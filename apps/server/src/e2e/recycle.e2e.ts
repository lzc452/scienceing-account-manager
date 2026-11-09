import 'reflect-metadata';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type DatabaseSync } from 'node:sqlite';
import { AppModule } from '../app.module';
import { DatabaseService } from '../db/database.service';
import { seedDatabase } from '../db/seed';
import { hashPassword } from '../crypto/password';
import { LeasesService } from '../modules/leases/leases.service';
import { claimAsExtension, provisionSeedAccounts } from './extension-fixture';

const MASTER_KEY_HEX = '06bd85dc11dd5998a014a042afb70e714c41f6d46a94b1b119cfd26bff999e54';
const ADMIN_PASSWORD = 'admin123456';

let app: INestApplication;
let db: DatabaseSync;
let userToken: string;

function nowIso(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function resetPool(): void {
  db.exec('DELETE FROM audit_logs');
  db.exec('DELETE FROM reset_jobs');
  db.exec('DELETE FROM leases');
  db.exec(
    `UPDATE scienceing_accounts
        SET status = 'AVAILABLE', enabled = 1, dirty_since = NULL,
            purge_attempts = 0, rotation_due_reason = NULL
      WHERE 1 = 1`,
  );
}

function countJobs(): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM reset_jobs').get() as unknown as { c: number }).c;
}

function accountOf(id: number): { status: string; dirty_since: string | null; rotation_due_reason: string | null } {
  return db
    .prepare('SELECT status, dirty_since, rotation_due_reason FROM scienceing_accounts WHERE id = ?')
    .get(id) as unknown as { status: string; dirty_since: string | null; rotation_due_reason: string | null };
}

/** 用指定版本领取一个账号。 */
async function claimOne(version: string, accountId?: number) {
  const res = await claimAsExtension(app, userToken, version, accountId);
  assert.equal(res.status, 201, `领取失败：${JSON.stringify(res.body)}`);
  return {
    leaseId: res.body.lease.id as number,
    accountId: res.body.account.accountId as number,
    leaseToken: res.body.leaseToken as string,
  };
}

/** 归还（用户 JWT）。 */
async function releaseLease(leaseId: number) {
  return request(app.getHttpServer())
    .post(`/api/leases/${leaseId}/release`)
    .set('Authorization', `Bearer ${userToken}`);
}

/** 清理回执（leaseToken）。 */
async function ack(leaseId: number, leaseToken: string, body: Record<string, unknown>) {
  return request(app.getHttpServer())
    .post(`/api/leases/${leaseId}/recycle-ack`)
    .set('Authorization', `Bearer ${leaseToken}`)
    .send(body);
}

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PATH = ':memory:';
  process.env.SCIENCEING_MASTER_KEY = MASTER_KEY_HEX;
  // 后台定时器全部推远：本文件手动调用 sweep，不依赖时钟
  process.env.RECYCLE_INTERVAL_MS = '3600000';
  process.env.RESET_INTERVAL_MS = '3600000';
  process.env.DIRTY_SWEEP_INTERVAL_MS = '3600000';
  process.env.ROTATION_INTERVAL_MS = '3600000';

  app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  await app.init();
  db = app.get(DatabaseService).db;
  const masterKey = Buffer.from(MASTER_KEY_HEX, 'hex');
  await seedDatabase(db, { adminPassword: ADMIN_PASSWORD, masterKey });
  provisionSeedAccounts(db, masterKey);

  const now = nowIso();
  db.prepare(
    'INSERT INTO users (username, display_name, department, password_hash, role, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
  ).run('u1', '用户一', '研发部', await hashPassword('u1-pass'), 'USER', now, now);

  const login = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: 'u1', password: 'u1-pass' });
  assert.equal(login.status, 200, `测试用户登录失败：${JSON.stringify(login.body)}`);
  userToken = login.body.token as string;
});

after(async () => {
  await app.close();
});

test('旧扩展（1.4.0）归还仍走「归还即改密」', async () => {
  resetPool();
  const { leaseId, accountId } = await claimOne('1.4.0');

  const rel = await releaseLease(leaseId);
  assert.equal(rel.status, 201);
  assert.equal(rel.body.recycleMode, 'ROTATE');

  assert.equal(accountOf(accountId).status, 'RECYCLING');
  assert.equal(countJobs(), 1, 'ROTATE 分支必须建改密任务');
});

test('新扩展（1.5.0）归还进入 DIRTY，且不建改密任务', async () => {
  resetPool();
  const { leaseId, accountId } = await claimOne('1.5.0');

  const rel = await releaseLease(leaseId);
  assert.equal(rel.status, 201);
  assert.equal(rel.body.recycleMode, 'PURGE');
  assert.equal(rel.body.accountStatus, 'DIRTY');

  const account = accountOf(accountId);
  assert.equal(account.status, 'DIRTY', '归还后必须先隔离，不能被别人领走');
  assert.ok(account.dirty_since, 'dirty_since 是 ack 超时判定的依据，必须写入');
  assert.equal(countJobs(), 0, 'PURGE 分支的目标就是零改密');
});

test('归还后 DIRTY 账号不可被领取', async () => {
  resetPool();
  const { leaseId, accountId } = await claimOne('1.5.0');
  await releaseLease(leaseId);

  // 另一个用户尝试定向领取该账号
  const now = nowIso();
  db.prepare(
    'INSERT INTO users (username, display_name, department, password_hash, role, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
  ).run('u2', '用户二', '产品部', await hashPassword('u2-pass'), 'USER', now, now);
  const login2 = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: 'u2', password: 'u2-pass' });
  const u2Token = login2.body.token as string;

  const res = await claimAsExtension(app, u2Token, '1.5.0', accountId);
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'TARGET_ACCOUNT_UNAVAILABLE');
});

test('清理回执成功：账号回到可用池，租约归档，证据落库', async () => {
  resetPool();
  const { leaseId, accountId, leaseToken } = await claimOne('1.5.0');
  await releaseLease(leaseId);

  const res = await ack(leaseId, leaseToken, { ok: true, method: 'PAGE', detail: 'localStorage 已清空并复核' });
  assert.equal(res.status, 201);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.accountStatus, 'AVAILABLE');

  const account = accountOf(accountId);
  assert.equal(account.status, 'AVAILABLE');
  assert.equal(account.dirty_since, null, '回到池子后不应残留 dirty_since');

  const lease = db
    .prepare('SELECT status, released_at, purge_ack_at, purge_method FROM leases WHERE id = ?')
    .get(leaseId) as unknown as {
    status: string;
    released_at: string | null;
    purge_ack_at: string | null;
    purge_method: string | null;
  };
  assert.equal(lease.status, 'RELEASED');
  assert.ok(lease.released_at);
  assert.ok(lease.purge_ack_at);
  assert.equal(lease.purge_method, 'PAGE');

  const audits = db
    .prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'SESSION_PURGED'")
    .get() as unknown as { c: number };
  assert.equal(audits.c, 1);
  assert.equal(countJobs(), 0, '清理成功不应产生改密任务');
});

test('清理回执幂等：重复回执不报错、不改变结果', async () => {
  resetPool();
  const { leaseId, leaseToken } = await claimOne('1.5.0');
  await releaseLease(leaseId);

  const first = await ack(leaseId, leaseToken, { ok: true, method: 'PAGE' });
  assert.equal(first.body.alreadyDone, false);

  const second = await ack(leaseId, leaseToken, { ok: true, method: 'PAGE' });
  assert.equal(second.status, 201);
  assert.equal(second.body.alreadyDone, true, '扩展可能在收到响应前重试，重复回执必须安全');

  const audits = db
    .prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'SESSION_PURGED'")
    .get() as unknown as { c: number };
  assert.equal(audits.c, 1, '重复回执不应重复记审计');
});

test('清理回执失败：立刻转改密兜底，不等超时', async () => {
  resetPool();
  const { leaseId, accountId, leaseToken } = await claimOne('1.5.0');
  await releaseLease(leaseId);

  const res = await ack(leaseId, leaseToken, { ok: false, detail: 'browsingData.remove 报错' });
  assert.equal(res.status, 201);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.reason, 'PURGE_FAILED');

  const account = accountOf(accountId);
  assert.equal(account.status, 'RECYCLING');
  assert.equal(account.rotation_due_reason, 'PURGE_FAILED');
  assert.equal(countJobs(), 1, '清理失败必须落到改密');

  const lease = db
    .prepare('SELECT purge_method, purge_detail FROM leases WHERE id = ?')
    .get(leaseId) as unknown as { purge_method: string | null; purge_detail: string | null };
  assert.equal(lease.purge_method, 'FAILED');
  assert.match(lease.purge_detail ?? '', /browsingData/);

  const attempts = db
    .prepare('SELECT purge_attempts FROM scienceing_accounts WHERE id = ?')
    .get(accountId) as unknown as { purge_attempts: number };
  assert.ok(attempts.purge_attempts >= 1, '失败次数留在账号上，便于告警与人工判断');
});

test('清理回执缺 ok 字段：400，不当作成功', async () => {
  resetPool();
  const { leaseId, accountId, leaseToken } = await claimOne('1.5.0');
  await releaseLease(leaseId);

  const res = await ack(leaseId, leaseToken, { method: 'PAGE' });
  assert.equal(res.status, 400);
  // 仍停在 DIRTY：一次误判为成功会让那台机器上的令牌继续有效，账号却已放回池子
  assert.equal(accountOf(accountId).status, 'DIRTY');
});

test('回执超时：DIRTY 超期后转改密，原因为 ACK_TIMEOUT', async () => {
  resetPool();
  const { leaseId, accountId } = await claimOne('1.5.0');
  await releaseLease(leaseId);

  const leases = app.get(LeasesService);
  // 直接把「现在」推到超时之后，不 sleep
  const converted = leases.sweepDirtyAckTimeouts(new Date(Date.now() + 10 * 60 * 1000));
  assert.equal(converted, 1);

  const account = accountOf(accountId);
  assert.equal(account.status, 'RECYCLING');
  assert.equal(account.rotation_due_reason, 'ACK_TIMEOUT');
  assert.equal(account.dirty_since, null);
  assert.equal(countJobs(), 1);

  const audits = db
    .prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'PURGE_TIMEOUT'")
    .get() as unknown as { c: number };
  assert.equal(audits.c, 1);
});

test('回执超时：未到时限的 DIRTY 账号不受影响', async () => {
  resetPool();
  const { leaseId, accountId } = await claimOne('1.5.0');
  await releaseLease(leaseId);

  const converted = app.get(LeasesService).sweepDirtyAckTimeouts();
  assert.equal(converted, 0);
  assert.equal(accountOf(accountId).status, 'DIRTY');
});

test('recycle_mode=ROTATE 是止血开关：新扩展也退回改密', async () => {
  resetPool();
  db.prepare("UPDATE system_settings SET value = 'ROTATE' WHERE key = 'recycle_mode'").run();
  try {
    const { leaseId, accountId } = await claimOne('1.5.0');
    const rel = await releaseLease(leaseId);
    assert.equal(rel.body.recycleMode, 'ROTATE');
    assert.equal(accountOf(accountId).status, 'RECYCLING');
    assert.equal(countJobs(), 1);
  } finally {
    db.prepare("UPDATE system_settings SET value = 'PURGE' WHERE key = 'recycle_mode'").run();
  }
});

test('超时回收：新扩展进入 DIRTY 等待清理，而不是直接改密', async () => {
  resetPool();
  const { leaseId, accountId } = await claimOne('1.5.0');
  // 把最近活动时间拨到 25 小时前
  db.prepare('UPDATE leases SET last_activity_at = ? WHERE id = ?').run(nowIso(-25 * 60 * 60 * 1000), leaseId);

  const recycled = app.get(LeasesService).recycleTimedOutLeases();
  assert.equal(recycled, 1);

  const account = accountOf(accountId);
  assert.equal(account.status, 'DIRTY', '超时恰恰最可能有标签页开着，应先试清理');
  assert.equal(countJobs(), 0);

  const lease = db.prepare('SELECT status, release_reason FROM leases WHERE id = ?').get(leaseId) as unknown as {
    status: string;
    release_reason: string;
  };
  assert.equal(lease.status, 'RECYCLING');
  assert.equal(lease.release_reason, 'INACTIVITY_TIMEOUT');
});
