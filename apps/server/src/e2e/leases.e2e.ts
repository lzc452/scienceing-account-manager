import 'reflect-metadata';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { backup, type DatabaseSync } from 'node:sqlite';
import { AppModule } from '../app.module';
import { DatabaseService } from '../db/database.service';
import { seedDatabase } from '../db/seed';
import { hashPassword } from '../crypto/password';
import { LeasesService } from '../modules/leases/leases.service';
import {
  claimAsExtension,
  extensionHeaders,
  issueExtensionProof,
  provisionSeedAccounts,
  TEST_ACCOUNT_PASSWORD,
} from './extension-fixture';

const MASTER_KEY_HEX = '06bd85dc11dd5998a014a042afb70e714c41f6d46a94b1b119cfd26bff999e54';
const ADMIN_PASSWORD = 'admin123456';
const DATABASE_PATH = join(tmpdir(), `scienceing-leases-${randomUUID()}.db`);

let app: INestApplication;
let db: DatabaseSync;
let u1Token: string;
let u2Token: string;

function nowIso(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function resetPool(): void {
  db.exec('DELETE FROM audit_logs');
  db.exec('DELETE FROM reset_jobs');
  db.exec('DELETE FROM leases');
  db.exec("UPDATE scienceing_accounts SET status = 'AVAILABLE', enabled = 1");
}

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PATH = ':memory:';
  process.env.SCIENCEING_MASTER_KEY = MASTER_KEY_HEX;
  app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  await app.init();
  await app.listen(0, '127.0.0.1'); // 并发请求复用同一监听端口，避免测试客户端反复启停服务器。
  db = app.get(DatabaseService).db;
  const masterKey = Buffer.from(MASTER_KEY_HEX, 'hex');
  await seedDatabase(db, { adminPassword: ADMIN_PASSWORD, masterKey });
  provisionSeedAccounts(db, masterKey);

  const now = nowIso();
  db.prepare(
    'INSERT INTO users (username, display_name, department, password_hash, role, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
  ).run('u1', '用户一', '研发部', await hashPassword('u1-pass'), 'USER', now, now);
  db.prepare(
    'INSERT INTO users (username, display_name, department, password_hash, role, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
  ).run('u2', '用户二', '产品部', await hashPassword('u2-pass'), 'USER', now, now);

  const login1 = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'u1', password: 'u1-pass' });
  const login2 = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'u2', password: 'u2-pass' });
  u1Token = login1.body.token as string;
  u2Token = login2.body.token as string;
});

after(async () => {
  await app.close();
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${DATABASE_PATH}${suffix}`, { force: true });
});

test('游客可访问 availability 统计（不泄露密码/使用人）', async () => {
  const res = await request(app.getHttpServer()).get('/api/accounts/availability');
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 10);
  assert.equal(typeof res.body.available, 'number');
  assert.equal(typeof res.body.inUse, 'number');
  assert.equal(typeof res.body.recycling, 'number');
  assert.equal(res.body.password, undefined);
  assert.equal(res.body.currentUser, undefined);
});

test('仅在请求体伪造扩展版本不能领取账号', async () => {
  resetPool();
  const forged = await request(app.getHttpServer())
    .post('/api/leases')
    .set('Authorization', `Bearer ${u1Token}`)
    .send({ extensionVersion: '999.0.0' });
  assert.equal(forged.status, 409);
  assert.equal(forged.body.code, 'EXTENSION_REQUIRED');
});

test('游客可访问账号池列表（匿名，不含密码/密文，IN_USE 有 estimatedReleaseAt）', async () => {
  resetPool();
  const claim = await claimAsExtension(app, u1Token);
  const claimedCode = claim.body.lease.accountCode as string;
  const claimedExpiresAt = claim.body.lease.expiresAt as string;
  assert.equal(claim.body.lease.timeoutSeconds, 24 * 60 * 60);

  const res = await request(app.getHttpServer()).get('/api/accounts/pool');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.equal(res.body.length, 10);

  for (const item of res.body) {
    assert.equal(typeof item.code, 'string');
    assert.equal(typeof item.status, 'string');
    // 不含敏感字段（匿名 + 无密码/密文）
    assert.equal(item.username, undefined);
    assert.equal(item.password, undefined);
    assert.equal(item.current_password_ciphertext, undefined);
    assert.equal(item.pending_password_ciphertext, undefined);
    assert.equal(item.currentUser, undefined);
    assert.equal(item.displayName, undefined);
    if (item.status === 'IN_USE') {
      assert.ok(item.estimatedReleaseAt, 'IN_USE 应有 estimatedReleaseAt');
      assert.equal(item.code, claimedCode);
      assert.equal(item.estimatedReleaseAt, claimedExpiresAt);
    } else {
      assert.equal(item.estimatedReleaseAt, null);
    }
  }
});

test('R3/R4：扩展证明缺失 / 版本过旧拒绝领取（>= 最低版本可领且证明不可重放）', async () => {
  resetPool();
  // 普通网页请求既没有扩展 Origin，也没有领取证明 → EXTENSION_REQUIRED（409）
  const missing = await request(app.getHttpServer()).post('/api/leases').set('Authorization', `Bearer ${u1Token}`).send({});
  assert.equal(missing.status, 409);
  assert.equal(missing.body.code, 'EXTENSION_REQUIRED');

  // Origin 必须是纯 chrome-extension://<id>，不能夹带路径伪装扩展来源。
  const malformedOrigin = await request(app.getHttpServer())
    .post('/api/extension/claim-proof')
    .set('Authorization', `Bearer ${u1Token}`)
    .set(extensionHeaders())
    .set('Origin', `${extensionHeaders().Origin}/forged`)
    .send({});
  assert.equal(malformedOrigin.status, 409);
  assert.equal(malformedOrigin.body.code, 'EXTENSION_REQUIRED');

  // 真实扩展通道签发证明，但版本过旧 → EXTENSION_OUTDATED（409）
  const outdated = await claimAsExtension(app, u1Token, '0.9.0');
  assert.equal(outdated.status, 409);
  assert.equal(outdated.body.code, 'EXTENSION_OUTDATED');

  // >= 最低版本（1.0.0）可领；相同证明第二次使用必须失败
  const proof = await issueExtensionProof(app, u1Token);
  const ok = await request(app.getHttpServer())
    .post('/api/leases')
    .set('Authorization', `Bearer ${u1Token}`)
    .set(extensionHeaders())
    .send({ extensionProof: proof });
  assert.equal(ok.status, 201);
  assert.ok(ok.body.leaseToken);

  const replay = await request(app.getHttpServer())
    .post('/api/leases')
    .set('Authorization', `Bearer ${u1Token}`)
    .set(extensionHeaders())
    .send({ extensionProof: proof });
  assert.equal(replay.status, 409);
  assert.equal(replay.body.code, 'EXTENSION_PROOF_INVALID');
});

test('并发领取：两用户抢最后一个账号，仅一人成功（事务保证）', async () => {
  resetPool();
  db.exec("UPDATE scienceing_accounts SET status = 'IN_USE' WHERE code != 'KY-01'");

  const [res1, res2] = await Promise.all([
    claimAsExtension(app, u1Token),
    claimAsExtension(app, u2Token),
  ]);

  const ok = [res1, res2].filter((r) => r.status === 201);
  const fail = [res1, res2].filter((r) => r.status !== 201);
  assert.equal(ok.length, 1, `应只有一人成功，实际 ${ok.length}`);
  assert.equal(fail.length, 1);
  const winner = ok[0];
  assert.ok(winner);
  assert.equal(winner.body.account.code, 'KY-01');
  assert.equal(winner.body.account.password, TEST_ACCOUNT_PASSWORD);

  const active = db
    .prepare(
      "SELECT COUNT(*) AS c FROM leases l JOIN scienceing_accounts a ON a.id = l.account_id WHERE a.code = 'KY-01' AND l.status = 'ACTIVE'",
    )
    .get() as unknown as { c: number };
  assert.equal(active.c, 1);
});

test('R2：同用户重复领取返回同一账号，不新增租约', async () => {
  resetPool();
  const first = await claimAsExtension(app, u1Token);
  assert.equal(first.status, 201);
  const firstCode = first.body.lease.accountCode as string;

  const again = await claimAsExtension(app, u1Token);
  assert.equal(again.status, 201);
  assert.equal(again.body.lease.accountCode, firstCode);

  const totalActive = db.prepare("SELECT COUNT(*) AS c FROM leases WHERE status = 'ACTIVE'").get() as unknown as { c: number };
  assert.equal(totalActive.c, 1);
});

test('定向领取准确返回目标，同账号重入，不同账号冲突且不轮换原 token', async () => {
  resetPool();
  const first = await claimAsExtension(app, u1Token, '1.4.0', 3);
  assert.equal(first.status, 201);
  assert.equal(first.body.lease.accountId, 3);
  const again = await claimAsExtension(app, u1Token, '1.4.0', 3);
  assert.equal(again.body.lease.id, first.body.lease.id);
  const conflict = await claimAsExtension(app, u1Token, '1.4.0', 6);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, 'ACTIVE_LEASE_CONFLICT');
  const status = await request(app.getHttpServer()).get(`/api/leases/${again.body.lease.id}/status`)
    .set('Authorization', `Bearer ${again.body.leaseToken}`);
  assert.equal(status.status, 200);
  assert.equal((db.prepare('SELECT status FROM scienceing_accounts WHERE id = 6').get() as { status: string }).status, 'AVAILABLE');
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM leases').get() as { c: number }).c, 1);
});

test('非法目标与旧扩展拒绝定向领取，普通旧扩展仍兼容', async () => {
  resetPool();
  for (const accountId of [0, -1, 1.5, '3', null, Number.MAX_SAFE_INTEGER + 1]) {
    const proof = await issueExtensionProof(app, u1Token, '1.4.0');
    const response = await request(app.getHttpServer()).post('/api/leases')
      .set('Authorization', `Bearer ${u1Token}`).set(extensionHeaders('1.4.0'))
      .send({ extensionProof: proof, accountId });
    assert.equal(response.status, 400);
  }
  const missing = await claimAsExtension(app, u1Token, '1.4.0', 99999);
  assert.equal(missing.status, 404);
  const old = await claimAsExtension(app, u1Token, '1.3.0', 3);
  assert.equal(old.status, 409);
  assert.equal(old.body.code, 'EXTENSION_OUTDATED');
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM leases').get() as { c: number }).c, 0);
  assert.equal((await claimAsExtension(app, u1Token, '1.0.0')).status, 201);
});

test('目标被占用、回收、异常、停用或无密码时不领取其他账号', async () => {
  resetPool();
  for (const status of ['IN_USE', 'RECYCLING', 'ERROR']) {
    db.prepare('UPDATE scienceing_accounts SET status = ? WHERE id = 3').run(status);
    const response = await claimAsExtension(app, u1Token, '1.4.0', 3);
    assert.equal(response.status, 409);
    assert.equal(response.body.code, 'TARGET_ACCOUNT_UNAVAILABLE');
  }
  db.exec("UPDATE scienceing_accounts SET status = 'AVAILABLE', enabled = 0 WHERE id = 3");
  assert.equal((await claimAsExtension(app, u1Token, '1.4.0', 3)).body.code, 'TARGET_ACCOUNT_UNAVAILABLE');
  const original = db.prepare('SELECT current_password_ciphertext FROM scienceing_accounts WHERE id = 3').get() as { current_password_ciphertext: string };
  try {
    db.exec('UPDATE scienceing_accounts SET enabled = 1, current_password_ciphertext = NULL WHERE id = 3');
    assert.equal((await claimAsExtension(app, u1Token, '1.4.0', 3)).body.code, 'ACCOUNT_NOT_PROVISIONED');
  } finally {
    db.prepare('UPDATE scienceing_accounts SET current_password_ciphertext = ? WHERE id = 3').run(original.current_password_ciphertext);
  }
  assert.equal((db.prepare('SELECT COUNT(*) AS c FROM leases').get() as { c: number }).c, 0);
  assert.equal((db.prepare('SELECT status FROM scienceing_accounts WHERE id = 1').get() as { status: string }).status, 'AVAILABLE');
});

test('定向并发：两人争同账号、一人争两个账号，均只有一个活动租约', async () => {
  resetPool();
  const twoUsers = await Promise.all([
    claimAsExtension(app, u1Token, '1.4.0', 3), claimAsExtension(app, u2Token, '1.4.0', 3),
  ]);
  assert.deepEqual(twoUsers.map((r) => r.status).sort(), [201, 409]);
  resetPool();
  const sameUser = await Promise.all([
    claimAsExtension(app, u1Token, '1.4.0', 3), claimAsExtension(app, u1Token, '1.4.0', 6),
  ]);
  assert.deepEqual(sameUser.map((r) => r.status).sort(), [201, 409]);
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM leases WHERE status = 'ACTIVE'").get() as { c: number }).c, 1);
});

test('本人历史去重排序、停用保留、用户隔离，退出登录与服务重启后可返回原账号', async () => {
  resetPool();
  const restart = async () => {
    await app.close();
    process.env.DATABASE_PATH = DATABASE_PATH;
    process.env.SCIENCEING_MASTER_KEY = MASTER_KEY_HEX;
    app = await NestFactory.create(AppModule);
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    db = app.get(DatabaseService).db;
  };
  // 同进程其他用例会改环境变量，在用例内切换文件库后再验证完整的重启路径。
  await backup(db, DATABASE_PATH);
  await restart();
  assert.equal((await request(app.getHttpServer()).get('/api/accounts/mine')).status, 401);
  const releaseForTest = async (leaseId: number, accountId: number) => {
    assert.equal((await request(app.getHttpServer()).post(`/api/leases/${leaseId}/release`)
      .set('Authorization', `Bearer ${u1Token}`).send({})).status, 201);
    // 模拟已验证过的回收完成状态，历史记录保持不变。
    db.prepare("UPDATE leases SET status = 'RELEASED', released_at = ? WHERE id = ?").run(nowIso(), leaseId);
    db.prepare("UPDATE scienceing_accounts SET status = 'AVAILABLE' WHERE id = ?").run(accountId);
  };
  const first = await claimAsExtension(app, u1Token, '1.4.0', 3);
  await releaseForTest(first.body.lease.id, 3);
  const second = await claimAsExtension(app, u1Token, '1.4.0', 3);
  await releaseForTest(second.body.lease.id, 3);
  db.prepare('UPDATE leases SET started_at = ? WHERE account_id = 3').run(nowIso(-60_000));
  const latest = await claimAsExtension(app, u1Token, '1.4.0', 6);
  await releaseForTest(latest.body.lease.id, 6);
  await claimAsExtension(app, u2Token, '1.4.0', 7);
  db.exec('UPDATE scienceing_accounts SET enabled = 0 WHERE id IN (3, 4)');
  const mine = await request(app.getHttpServer()).get('/api/accounts/mine').set('Authorization', `Bearer ${u1Token}`);
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body.filter((a: { lastUsedAt: string | null }) => a.lastUsedAt).map((a: { accountId: number }) => a.accountId), [6, 3]);
  assert.equal(mine.body.find((a: { accountId: number }) => a.accountId === 3).enabled, false);
  assert.equal(mine.body.some((a: { accountId: number }) => a.accountId === 4), false);
  assert.equal(mine.body.find((a: { accountId: number }) => a.accountId === 7).lastUsedAt, null);
  assert.ok(mine.body.every((a: Record<string, unknown>) => Object.keys(a).sort().join(',') === 'accountId,code,enabled,estimatedReleaseAt,lastUsedAt,status'));
  const other = await request(app.getHttpServer()).get('/api/accounts/mine').set('Authorization', `Bearer ${u2Token}`);
  assert.equal(other.body.some((a: { accountId: number }) => a.accountId === 3), false);
  assert.equal(other.body.find((a: { accountId: number }) => a.accountId === 6).lastUsedAt, null);
  db.exec('UPDATE scienceing_accounts SET enabled = 1 WHERE id = 3');
  await request(app.getHttpServer()).post('/api/auth/logout').set('Authorization', `Bearer ${u1Token}`).send({});
  const login = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'u1', password: 'u1-pass' });
  u1Token = login.body.token as string;
  const afterLogin = await request(app.getHttpServer()).get('/api/accounts/mine').set('Authorization', `Bearer ${u1Token}`);
  assert.ok(afterLogin.body.find((a: { accountId: number }) => a.accountId === 3).lastUsedAt);
  const resumed = await claimAsExtension(app, u1Token, '1.4.0', 3);
  assert.equal(resumed.status, 201);
  assert.equal(resumed.body.lease.accountId, 3);
  const beforeRestart = await request(app.getHttpServer()).get('/api/accounts/mine').set('Authorization', `Bearer ${u1Token}`);
  await restart();
  const afterRestart = await request(app.getHttpServer()).get('/api/accounts/mine').set('Authorization', `Bearer ${u1Token}`);
  assert.equal(afterRestart.status, 200);
  assert.deepEqual(afterRestart.body, beforeRestart.body);
  assert.equal((await claimAsExtension(app, u1Token, '1.4.0', 3)).body.lease.id, resumed.body.lease.id);
});

test('Activity 续期/过期状态机 + 归还创建 reset_job', async () => {
  resetPool();
  const claim = await claimAsExtension(app, u1Token);
  assert.equal(claim.status, 201);
  const leaseId = claim.body.lease.id as number;
  const leaseToken = claim.body.leaseToken as string;

  // 续期成功
  const renew = await request(app.getHttpServer())
    .post(`/api/leases/${leaseId}/activity`)
    .set('Authorization', `Bearer ${leaseToken}`)
    .send({});
  assert.equal(renew.status, 201);
  assert.equal(renew.body.result, 'ACTIVE');

  // 扩展轮询 status
  const status = await request(app.getHttpServer())
    .get(`/api/leases/${leaseId}/status`)
    .set('Authorization', `Bearer ${leaseToken}`);
  assert.equal(status.status, 200);
  assert.equal(status.body.status, 'ACTIVE');

  // 归还 → RECYCLING + reset_job
  const rel = await request(app.getHttpServer())
    .post(`/api/leases/${leaseId}/release`)
    .set('Authorization', `Bearer ${u1Token}`)
    .send({});
  assert.equal(rel.status, 201);
  assert.equal(rel.body.status, 'RECYCLING');
  const jobs = db.prepare('SELECT COUNT(*) AS c FROM reset_jobs WHERE lease_id = ?').get(leaseId) as unknown as { c: number };
  assert.ok(jobs.c >= 1);

  // RECYCLING 后 Activity 被拒（R7）
  const renewAfter = await request(app.getHttpServer())
    .post(`/api/leases/${leaseId}/activity`)
    .set('Authorization', `Bearer ${leaseToken}`)
    .send({});
  assert.equal(renewAfter.body.result, 'LEASE_EXPIRED');
});

test('竞态：23:59 刚操作不被 24:00 回收误踢（条件更新 R6）', async () => {
  resetPool();
  const claim = await claimAsExtension(app, u1Token);
  const leaseId = claim.body.lease.id as number;
  const leaseToken = claim.body.leaseToken as string;

  // 模拟 23 小时 59 分钟无操作，随后用户操作续期成功（last_activity_at 回到 now）
  db.prepare('UPDATE leases SET last_activity_at = ? WHERE id = ?').run(nowIso(-(23 * 60 + 59) * 60 * 1000), leaseId);
  const renew = await request(app.getHttpServer())
    .post(`/api/leases/${leaseId}/activity`)
    .set('Authorization', `Bearer ${leaseToken}`)
    .send({});
  assert.equal(renew.body.result, 'ACTIVE');

  // 24:00 定时回收触发：last_activity_at 已刷新，不应误踢
  const leasesService = app.get(LeasesService);
  assert.equal(leasesService.recycleTimedOutLeases(), 0);
  const stillActive = db.prepare('SELECT status FROM leases WHERE id = ?').get(leaseId) as unknown as { status: string };
  assert.equal(stillActive.status, 'ACTIVE');

  // 拨回 24 小时 1 分钟前 → 回收器应回收（ACTIVE→RECYCLING + account RECYCLING + reset_job）
  db.prepare('UPDATE leases SET last_activity_at = ? WHERE id = ?').run(nowIso(-(24 * 60 + 1) * 60 * 1000), leaseId);
  assert.equal(leasesService.recycleTimedOutLeases(), 1);
  const lease = db.prepare('SELECT status, release_reason, account_id FROM leases WHERE id = ?').get(leaseId) as unknown as {
    status: string;
    release_reason: string;
    account_id: number;
  };
  assert.equal(lease.status, 'RECYCLING');
  assert.equal(lease.release_reason, 'INACTIVITY_TIMEOUT');
  const account = db.prepare('SELECT status FROM scienceing_accounts WHERE id = ?').get(lease.account_id) as unknown as {
    status: string;
  };
  assert.equal(account.status, 'RECYCLING');
});
