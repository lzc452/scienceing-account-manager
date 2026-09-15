/**
 * 后端不变量回归测试（针对已修复的 P1 缺陷）
 *
 * 覆盖：
 *  - L1-1  未设 master key 时进程内复用同一把；生产缺失必须拒绝启动
 *  - L1-2  超时回收的事务原子性（注入写失败，租约/账号必须回滚）
 *  - L1-3  遗留 RUNNING job 的启动清扫；账号缺失不再让 job 卡在 RUNNING
 *  - L1-4  致命配置错误不消耗尝试次数并暂停队列
 *  - L2-15 过期会话清扫
 *
 * 前置：需要先构建后端（pnpm --filter @scienceing/server build），
 *       本测试直接加载 apps/server/dist 下的真实模块，并用真实迁移建库。
 *
 * 运行：node --test scripts/test/backend-invariants.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const DIST = join(REPO_ROOT, 'apps', 'server', 'dist');

if (!existsSync(join(DIST, 'db', 'migrations.js'))) {
  throw new Error(
    `后端未构建：找不到 ${join(DIST, 'db', 'migrations.js')}。\n`
      + '  请先执行：pnpm --filter @scienceing/server build',
  );
}

const require = createRequire(import.meta.url);
const { MIGRATIONS } = require(join(DIST, 'db', 'migrations.js'));
const { LeasesService } = require(join(DIST, 'modules', 'leases', 'leases.service.js'));
const { ResetService } = require(join(DIST, 'modules', 'reset', 'reset.service.js'));
const { AuthService } = require(join(DIST, 'modules', 'auth', 'auth.service.js'));
const { loadMasterKey } = require(join(DIST, 'crypto', 'master-key.js'));
const { createRateLimiter } = require(join(DIST, 'lib', 'rate-limit.js'));

const NOW = new Date().toISOString();
const OLD = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

/** 用真实迁移建库，保证测试跑在生产同款 schema 上。 */
function freshDb() {
  const db = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS) {
    for (const stmt of m.sql.split(';').map((s) => s.trim()).filter(Boolean)) db.exec(stmt);
  }
  // leases.user_id 有外键指向 users，先建一个用户满足约束
  db.prepare(
    `INSERT INTO users (id, username, display_name, password_hash, role, enabled, created_at, updated_at)
     VALUES (1, 'tester', 'Tester', 'h', 'USER', 1, ?, ?)`,
  ).run(NOW, NOW);
  return db;
}

function seedAccount(db, { id = 1, status = 'IN_USE' } = {}) {
  db.prepare(
    `INSERT INTO scienceing_accounts (id, code, username, current_password_ciphertext, status, enabled, created_at, updated_at)
     VALUES (?, ?, ?, 'cipher', ?, 1, ?, ?)`,
  ).run(id, `ACC${id}`, `user${id}`, status, NOW, NOW);
}

function seedLease(db, { id = 1, accountId = 1, status = 'ACTIVE', lastActivityAt = OLD } = {}) {
  db.prepare(
    `INSERT INTO leases (id, lease_token_hash, account_id, user_id, status, started_at, last_activity_at, created_at, updated_at)
     VALUES (?, 'hash', ?, 1, ?, ?, ?, ?, ?)`,
  ).run(id, accountId, status, OLD, lastActivityAt, OLD, OLD);
}

function seedJob(db, { id = 1, accountId = 1, status = 'PENDING', attempts = 0 } = {}) {
  db.prepare(
    `INSERT INTO reset_jobs (id, account_id, lease_id, status, attempt_count, created_at) VALUES (?, ?, NULL, ?, ?, ?)`,
  ).run(id, accountId, status, attempts, NOW);
}

const noopAudit = { record() {} };
const okExecutor = { execute: async () => ({ success: true }) };

// ───────────────────────── L1-1 ─────────────────────────

test('L1-1: 未设 key 时进程内复用同一把；生产缺失直接拒绝', () => {
  delete process.env.SCIENCEING_MASTER_KEY;

  const first = loadMasterKey({});
  const second = loadMasterKey({});
  assert.ok(first.equals(second), '两次调用必须返回同一把 key —— 否则加密与解密用的不是同一把钥匙');
  assert.equal(first.length, 32);

  assert.throws(
    () => loadMasterKey({ NODE_ENV: 'production' }),
    /生产环境必须显式设置/,
    '生产环境缺 key 必须抛错，而不是静默用临时 key 写出永远解不开的密文',
  );

  const hex = 'ab'.repeat(32);
  assert.ok(loadMasterKey({ SCIENCEING_MASTER_KEY: hex }).equals(Buffer.from(hex, 'hex')));
  assert.throws(() => loadMasterKey({ SCIENCEING_MASTER_KEY: 'abcd' }), /必须是 32 字节/);
});

// ───────────────────────── L1-2 ─────────────────────────

test('L1-2: 超时回收是原子的 —— reset_jobs 写入失败时租约与账号一起回滚', () => {
  const db = freshDb();
  seedAccount(db, { id: 1, status: 'IN_USE' });
  seedLease(db, { id: 1, accountId: 1, status: 'ACTIVE', lastActivityAt: OLD });
  const svc = new LeasesService({ db }, noopAudit);

  // 注入失败：让 reset_jobs 的插入直接 ABORT（模拟第三次写失败）
  db.exec(`CREATE TRIGGER block_reset BEFORE INSERT ON reset_jobs
           BEGIN SELECT RAISE(ABORT, 'injected'); END;`);

  assert.throws(() => svc.recycleTimedOutLeases(), /injected/);

  assert.equal(db.prepare('SELECT status FROM leases WHERE id = 1').get().status, 'ACTIVE',
    '租约必须回滚为 ACTIVE —— 否则账号卡在 RECYCLING 且没有 reset_job，需人工修库');
  assert.equal(db.prepare('SELECT status FROM scienceing_accounts WHERE id = 1').get().status, 'IN_USE');
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM reset_jobs').get().c, 0);
});

test('L1-2: 正常回收时租约/账号/reset_job 三处状态一致', () => {
  const db = freshDb();
  seedAccount(db, { id: 1, status: 'IN_USE' });
  seedLease(db, { id: 1, accountId: 1, status: 'ACTIVE', lastActivityAt: OLD });
  const svc = new LeasesService({ db }, noopAudit);

  assert.equal(svc.recycleTimedOutLeases(), 1);
  assert.equal(db.prepare('SELECT status FROM leases WHERE id = 1').get().status, 'RECYCLING');
  assert.equal(db.prepare('SELECT status FROM scienceing_accounts WHERE id = 1').get().status, 'RECYCLING');
  const job = db.prepare('SELECT status, lease_id FROM reset_jobs').get();
  assert.equal(job.status, 'PENDING');
  assert.equal(job.lease_id, 1);
});

test('L1-2: 回收前刚续期的租约不被误踢', () => {
  const db = freshDb();
  seedAccount(db, { id: 1, status: 'IN_USE' });
  seedLease(db, { id: 1, accountId: 1, status: 'ACTIVE', lastActivityAt: NOW });
  const svc = new LeasesService({ db }, noopAudit);

  assert.equal(svc.recycleTimedOutLeases(), 0);
  assert.equal(db.prepare('SELECT status FROM leases WHERE id = 1').get().status, 'ACTIVE');
});

// ───────────────────────── L1-3 ─────────────────────────

test('L1-3: 启动清扫把遗留 RUNNING job 退回 PENDING', () => {
  const db = freshDb();
  seedAccount(db, { id: 1 });
  db.prepare(`INSERT INTO reset_jobs (id, account_id, lease_id, status, attempt_count, created_at, started_at)
              VALUES (1, 1, NULL, 'RUNNING', 1, ?, ?)`).run(OLD, OLD);
  const svc = new ResetService({ db }, noopAudit, okExecutor);

  assert.equal(svc.sweepStaleRunningJobs(), 1);
  const job = db.prepare('SELECT status, started_at FROM reset_jobs WHERE id = 1').get();
  assert.equal(job.status, 'PENDING');
  assert.equal(job.started_at, null);
});

test('L1-3: 账号不存在时 job 不再永久卡在 RUNNING', async () => {
  const db = freshDb();
  // 账号被删除后遗留的 job 是真实场景，需临时关掉外键来构造
  db.exec('PRAGMA foreign_keys = OFF;');
  seedJob(db, { id: 1, accountId: 999 });
  const svc = new ResetService({ db }, noopAudit, okExecutor);

  const r = await svc.processPendingJobs();
  assert.equal(r.failed, 1);

  const job = db.prepare('SELECT status, error_message FROM reset_jobs WHERE id = 1').get();
  assert.notEqual(job.status, 'RUNNING', 'getAccount 抛错后 job 不得停在 RUNNING');
  assert.equal(job.status, 'PENDING', '尝试次数未耗尽，应退回 PENDING 等待重试');
  assert.ok(job.error_message, '必须记录失败原因');
});

// ───────────────────────── L1-4 ─────────────────────────

test('L1-4: 致命配置错误不消耗尝试次数，并暂停队列', async () => {
  const db = freshDb();
  seedAccount(db, { id: 1, status: 'RECYCLING' });
  seedJob(db, { id: 1, accountId: 1 });
  seedJob(db, { id: 2, accountId: 1 });

  const fatalExecutor = {
    execute: async () => ({ success: false, fatal: true, error: '缺少科应后台环境变量：SCIENCING_ADMIN_URL' }),
  };
  const svc = new ResetService({ db }, noopAudit, fatalExecutor);

  await assert.rejects(() => svc.processPendingJobs(), /改密队列已暂停/);

  const jobs = db.prepare('SELECT id, status, attempt_count FROM reset_jobs ORDER BY id').all();
  assert.equal(jobs[0].status, 'PENDING');
  assert.equal(jobs[0].attempt_count, 0, '致命错误必须回退 attempt_count，否则重试预算被无意义消耗');
  assert.equal(jobs[1].status, 'PENDING', '队列应暂停，后续 job 不得被处理');
  assert.equal(jobs[1].attempt_count, 0);
});

test('L1-4: 普通业务失败仍然照常消耗尝试次数', async () => {
  const db = freshDb();
  seedAccount(db, { id: 1, status: 'RECYCLING' });
  seedJob(db, { id: 1, accountId: 1 });
  const svc = new ResetService({ db }, noopAudit, {
    execute: async () => ({ success: false, error: '账号未出现成功文案' }),
  });

  const r = await svc.processPendingJobs();
  assert.equal(r.failed, 1);
  const job = db.prepare('SELECT status, attempt_count FROM reset_jobs WHERE id = 1').get();
  assert.equal(job.status, 'PENDING');
  assert.equal(job.attempt_count, 1, '普通失败应保留这次尝试');
});

// ───────────────────────── L1-7 ─────────────────────────

test('L1-7: 限流只统计失败，成功即清零', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });

  assert.equal(limiter.isBlocked('ip-a'), false);
  limiter.recordFailure('ip-a');
  limiter.recordFailure('ip-a');
  assert.equal(limiter.isBlocked('ip-a'), false, '未达阈值不应拦截');
  assert.equal(limiter.remaining('ip-a'), 1);

  limiter.recordFailure('ip-a');
  assert.equal(limiter.isBlocked('ip-a'), true, '达到阈值应拦截');

  limiter.reset('ip-a');
  assert.equal(limiter.isBlocked('ip-a'), false, '登录成功应清零');

  assert.equal(limiter.isBlocked('ip-b'), false);
  assert.equal(limiter.remaining('ip-b'), 3);
});

// ───────────────────────── L2-15 ─────────────────────────

test('L2-15: 只清扫已过期会话', () => {
  const db = freshDb(); // 已含 user id=1
  const past = new Date(Date.now() - 1000).toISOString();
  const future = new Date(Date.now() + 3600_000).toISOString();
  db.prepare(`INSERT INTO sessions (id, token_hash, user_id, created_at, expires_at) VALUES (1, 'a', 1, ?, ?)`).run(OLD, past);
  db.prepare(`INSERT INTO sessions (id, token_hash, user_id, created_at, expires_at) VALUES (2, 'b', 1, ?, ?)`).run(NOW, future);

  const svc = new AuthService({ db }, noopAudit);
  assert.equal(svc.sweepExpiredSessions(), 1);
  assert.deepEqual(db.prepare('SELECT id FROM sessions').all().map((r) => r.id), [2]);
});
