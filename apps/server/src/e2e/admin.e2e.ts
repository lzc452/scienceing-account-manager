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

const MASTER_KEY_HEX = '06bd85dc11dd5998a014a042afb70e714c41f6d46a94b1b119cfd26bff999e54';
const ADMIN_PASSWORD = 'admin123456';

let app: INestApplication;
let db: DatabaseSync;
let adminToken: string;
let userToken: string;

before(async () => {
  process.env.DATABASE_PATH = ':memory:';
  process.env.SCIENCEING_MASTER_KEY = MASTER_KEY_HEX;
  app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  await app.init();
  db = app.get(DatabaseService).db;
  await seedDatabase(db, { adminPassword: ADMIN_PASSWORD, masterKey: Buffer.from(MASTER_KEY_HEX, 'hex') });

  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO users (username, display_name, department, password_hash, role, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
  ).run('u1', '普通用户', '研发部', await hashPassword('u1-pass'), 'USER', now, now);

  const adminLogin = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: 'admin', password: ADMIN_PASSWORD });
  const userLogin = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'u1', password: 'u1-pass' });
  adminToken = adminLogin.body.token as string;
  userToken = userLogin.body.token as string;
});

after(async () => {
  await app.close();
});

test('非 admin 访问 admin 端点 403', async () => {
  for (const path of ['/api/admin/accounts', '/api/admin/leases', '/api/admin/logs', '/api/admin/settings']) {
    const res = await request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${userToken}`);
    assert.equal(res.status, 403, `${path} 应返回 403`);
  }
});

test('GET /admin/accounts 列表（10 账号）', async () => {
  const res = await request(app.getHttpServer()).get('/api/admin/accounts').set('Authorization', `Bearer ${adminToken}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 10);
  assert.equal(res.body[0].code, 'KY-01');
});

test('force-release / reset-password / mark-available / disable 集成', async () => {
  // u1 领取 → KY-01
  const claim = await request(app.getHttpServer()).post('/api/leases').set('Authorization', `Bearer ${userToken}`).send({ extensionVersion: '1.0.0' });
  assert.equal(claim.status, 201);
  const accountId = claim.body.lease.accountId as number;

  // force-release
  const fr = await request(app.getHttpServer())
    .post(`/api/admin/accounts/${accountId}/force-release`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({});
  assert.equal(fr.status, 201);
  assert.equal(fr.body.status, 'RECYCLING');
  assert.equal(fr.body.recycled, true);

  // reset-password（KY-02，AVAILABLE）→ RECYCLING + pending 密码 + reset_job
  const ky02 = (db.prepare("SELECT id FROM scienceing_accounts WHERE code = 'KY-02'").get() as unknown as { id: number }).id;
  const rp = await request(app.getHttpServer())
    .post(`/api/admin/accounts/${ky02}/reset-password`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({});
  assert.equal(rp.status, 201);
  assert.equal(rp.body.status, 'RECYCLING');
  const ky02Row = db.prepare('SELECT pending_password_ciphertext FROM scienceing_accounts WHERE id = ?').get(ky02) as unknown as {
    pending_password_ciphertext: string | null;
  };
  assert.ok(ky02Row.pending_password_ciphertext, '应写入 pending 密码密文');
  assert.ok((db.prepare('SELECT COUNT(*) AS c FROM reset_jobs WHERE account_id = ?').get(ky02) as unknown as { c: number }).c >= 1);

  // mark-available：ERROR → AVAILABLE
  db.exec("UPDATE scienceing_accounts SET status = 'ERROR' WHERE code = 'KY-03'");
  const ky03 = (db.prepare("SELECT id FROM scienceing_accounts WHERE code = 'KY-03'").get() as unknown as { id: number }).id;
  const ma = await request(app.getHttpServer())
    .post(`/api/admin/accounts/${ky03}/mark-available`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({});
  assert.equal(ma.status, 201);
  assert.equal(ma.body.status, 'AVAILABLE');

  // disable KY-04
  const ky04 = (db.prepare("SELECT id FROM scienceing_accounts WHERE code = 'KY-04'").get() as unknown as { id: number }).id;
  const dis = await request(app.getHttpServer())
    .post(`/api/admin/accounts/${ky04}/disable`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({});
  assert.equal(dis.status, 201);
  assert.equal(dis.body.enabled, false);
});

test('leases / logs / settings / extension config 端点', async () => {
  const leases = await request(app.getHttpServer()).get('/api/admin/leases').set('Authorization', `Bearer ${adminToken}`);
  assert.equal(leases.status, 200);
  assert.ok(Array.isArray(leases.body));

  const logs = await request(app.getHttpServer()).get('/api/admin/logs').set('Authorization', `Bearer ${adminToken}`);
  assert.equal(logs.status, 200);
  assert.ok(Array.isArray(logs.body.items));
  assert.ok(logs.body.total >= 0);

  const settings = await request(app.getHttpServer()).get('/api/admin/settings').set('Authorization', `Bearer ${adminToken}`);
  assert.equal(settings.status, 200);
  assert.equal(settings.body.inactivity_timeout_seconds, '1800');

  const upd = await request(app.getHttpServer())
    .post('/api/admin/settings')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ inactivity_timeout_seconds: '1200' });
  assert.equal(upd.status, 201);
  assert.equal(upd.body.inactivity_timeout_seconds, '1200');

  const ext = await request(app.getHttpServer()).get('/api/extension/config');
  assert.equal(ext.status, 200);
  assert.equal(ext.body.minimumVersion, '1.0.0');
  assert.equal(typeof ext.body.activityThrottleSeconds, 'number');
});

test('审计日志写入且不含敏感值', async () => {
  const rows = db.prepare('SELECT action, metadata FROM audit_logs').all() as unknown as Array<{
    action: string;
    metadata: string | null;
  }>;
  assert.ok(rows.length > 0);
  const actions = rows.map((row) => row.action);
  assert.ok(actions.includes('ADMIN_FORCE_RELEASE'));
  assert.ok(actions.includes('RESET_PASSWORD'));
  assert.ok(actions.includes('ADMIN_MANUAL_FIX'));
  assert.ok(actions.includes('ACCOUNT_DISABLE'));
  assert.ok(actions.includes('SETTING_UPDATE'));

  for (const row of rows) {
    const meta = row.metadata ?? '';
    assert.ok(!meta.includes('__PLACEHOLDER__'), '审计 metadata 不得含占位密码');
    assert.ok(!/password/i.test(meta), '审计 metadata 不得含 password 字段');
    assert.ok(!/ciphertext/i.test(meta), '审计 metadata 不得含 ciphertext');
  }
});
