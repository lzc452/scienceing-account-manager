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

const MASTER_KEY_HEX = '06bd85dc11dd5998a014a042afb70e714c41f6d46a94b1b119cfd26bff999e54';
const ADMIN_PASSWORD = 'admin123456';

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
  db.exec("UPDATE scienceing_accounts SET status = 'AVAILABLE'");
}

before(async () => {
  process.env.DATABASE_PATH = ':memory:';
  process.env.SCIENCEING_MASTER_KEY = MASTER_KEY_HEX;
  app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  await app.init();
  db = app.get(DatabaseService).db;
  await seedDatabase(db, { adminPassword: ADMIN_PASSWORD, masterKey: Buffer.from(MASTER_KEY_HEX, 'hex') });

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

test('游客可访问账号池列表（匿名，不含密码/密文，IN_USE 有 estimatedReleaseAt）', async () => {
  resetPool();
  const claim = await request(app.getHttpServer()).post('/api/leases').set('Authorization', `Bearer ${u1Token}`).send({ extensionVersion: '1.0.0' });
  const claimedCode = claim.body.lease.accountCode as string;

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
    } else {
      assert.equal(item.estimatedReleaseAt, null);
    }
  }
});

test('R3/R4：插件未装 / 版本过旧拒绝领取（>= 最低版本可领）', async () => {
  resetPool();
  // 无 extensionVersion → EXTENSION_REQUIRED（409）
  const missing = await request(app.getHttpServer()).post('/api/leases').set('Authorization', `Bearer ${u1Token}`).send({});
  assert.equal(missing.status, 409);
  assert.equal(missing.body.code, 'EXTENSION_REQUIRED');

  // 低版本 → EXTENSION_OUTDATED（409）
  const outdated = await request(app.getHttpServer())
    .post('/api/leases')
    .set('Authorization', `Bearer ${u1Token}`)
    .send({ extensionVersion: '0.9.0' });
  assert.equal(outdated.status, 409);
  assert.equal(outdated.body.code, 'EXTENSION_OUTDATED');

  // >= 最低版本（1.0.0）可领
  const ok = await request(app.getHttpServer())
    .post('/api/leases')
    .set('Authorization', `Bearer ${u1Token}`)
    .send({ extensionVersion: '1.0.0' });
  assert.equal(ok.status, 201);
  assert.ok(ok.body.leaseToken);
});

test('并发领取：两用户抢最后一个账号，仅一人成功（事务保证）', async () => {
  resetPool();
  db.exec("UPDATE scienceing_accounts SET status = 'IN_USE' WHERE code != 'KY-01'");

  const [res1, res2] = await Promise.all([
    request(app.getHttpServer()).post('/api/leases').set('Authorization', `Bearer ${u1Token}`).send({ extensionVersion: '1.0.0' }),
    request(app.getHttpServer()).post('/api/leases').set('Authorization', `Bearer ${u2Token}`).send({ extensionVersion: '1.0.0' }),
  ]);

  const ok = [res1, res2].filter((r) => r.status === 201);
  const fail = [res1, res2].filter((r) => r.status !== 201);
  assert.equal(ok.length, 1, `应只有一人成功，实际 ${ok.length}`);
  assert.equal(fail.length, 1);
  const winner = ok[0];
  assert.ok(winner);
  assert.equal(winner.body.account.code, 'KY-01');
  assert.equal(winner.body.account.password, '__PLACEHOLDER__');

  const active = db
    .prepare(
      "SELECT COUNT(*) AS c FROM leases l JOIN scienceing_accounts a ON a.id = l.account_id WHERE a.code = 'KY-01' AND l.status = 'ACTIVE'",
    )
    .get() as unknown as { c: number };
  assert.equal(active.c, 1);
});

test('R2：同用户重复领取返回同一账号，不新增租约', async () => {
  resetPool();
  const first = await request(app.getHttpServer()).post('/api/leases').set('Authorization', `Bearer ${u1Token}`).send({ extensionVersion: '1.0.0' });
  assert.equal(first.status, 201);
  const firstCode = first.body.lease.accountCode as string;

  const again = await request(app.getHttpServer()).post('/api/leases').set('Authorization', `Bearer ${u1Token}`).send({ extensionVersion: '1.0.0' });
  assert.equal(again.status, 201);
  assert.equal(again.body.lease.accountCode, firstCode);

  const totalActive = db.prepare("SELECT COUNT(*) AS c FROM leases WHERE status = 'ACTIVE'").get() as unknown as { c: number };
  assert.equal(totalActive.c, 1);
});

test('Activity 续期/过期状态机 + 归还创建 reset_job', async () => {
  resetPool();
  const claim = await request(app.getHttpServer()).post('/api/leases').set('Authorization', `Bearer ${u1Token}`).send({ extensionVersion: '1.0.0' });
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

test('竞态：29:59 刚操作不被 30:00 回收误踢（条件更新 R6）', async () => {
  resetPool();
  const claim = await request(app.getHttpServer()).post('/api/leases').set('Authorization', `Bearer ${u1Token}`).send({ extensionVersion: '1.0.0' });
  const leaseId = claim.body.lease.id as number;
  const leaseToken = claim.body.leaseToken as string;

  // 模拟 29 分钟无操作，随后用户操作续期成功（last_activity_at 回到 now）
  db.prepare('UPDATE leases SET last_activity_at = ? WHERE id = ?').run(nowIso(-29 * 60 * 1000), leaseId);
  const renew = await request(app.getHttpServer())
    .post(`/api/leases/${leaseId}/activity`)
    .set('Authorization', `Bearer ${leaseToken}`)
    .send({});
  assert.equal(renew.body.result, 'ACTIVE');

  // 30:00 定时回收触发：last_activity_at 已刷新，不应误踢
  const leasesService = app.get(LeasesService);
  assert.equal(leasesService.recycleTimedOutLeases(), 0);
  const stillActive = db.prepare('SELECT status FROM leases WHERE id = ?').get(leaseId) as unknown as { status: string };
  assert.equal(stillActive.status, 'ACTIVE');

  // 拨回 31 分钟前 → 回收器应回收（ACTIVE→RECYCLING + account RECYCLING + reset_job）
  db.prepare('UPDATE leases SET last_activity_at = ? WHERE id = ?').run(nowIso(-31 * 60 * 1000), leaseId);
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
