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
import { ResetService } from '../modules/reset/reset.service';
import { AutomationService } from '../modules/automation/automation.service';
import type { HealthCheckExecutor, ResetExecutor } from '../modules/automation/automation.types';

const MASTER_KEY_HEX = '06bd85dc11dd5998a014a042afb70e714c41f6d46a94b1b119cfd26bff999e54';
const ADMIN_PASSWORD = 'admin123456';

const successExecutor: ResetExecutor = {
  async execute() {
    return { success: true };
  },
};

const failExecutor: ResetExecutor = {
  async execute() {
    return { success: false, error: '未找到「重置密码」按钮' };
  },
};

const okHealthExecutor: HealthCheckExecutor = {
  async check() {
    return { adminLoginOk: true, accountPageOk: true, resetEntryOk: true };
  },
};

let app: INestApplication;
let db: DatabaseSync;
let adminToken: string;
let userToken: string;

before(async () => {
  process.env.DATABASE_PATH = ':memory:';
  process.env.SCIENCEING_MASTER_KEY = MASTER_KEY_HEX;
  // 测试期间关闭后台定时器，避免与手动调用抢跑
  process.env.RECYCLE_INTERVAL_MS = '3600000';
  process.env.RESET_INTERVAL_MS = '3600000';

  app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  await app.init();
  db = app.get(DatabaseService).db;
  await seedDatabase(db, { adminPassword: ADMIN_PASSWORD, masterKey: Buffer.from(MASTER_KEY_HEX, 'hex') });

  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO users (username, display_name, department, password_hash, role, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
  ).run('u1', '用户一', '研发部', await hashPassword('u1-pass'), 'USER', now, now);

  const adminLogin = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'admin', password: ADMIN_PASSWORD });
  const userLogin = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'u1', password: 'u1-pass' });
  adminToken = adminLogin.body.token as string;
  userToken = userLogin.body.token as string;
});

after(async () => {
  await app.close();
});

/** 领取 → 拨回 31 分钟 → 超时回收，返回 {accountId, leaseId}。 */
async function claimAndTimeout(): Promise<{ accountId: number; leaseId: number }> {
  const claim = await request(app.getHttpServer()).post('/api/leases').set('Authorization', `Bearer ${userToken}`).send({ extensionVersion: '1.0.0' });
  assert.equal(claim.status, 201);
  const accountId = claim.body.lease.accountId as number;
  const leaseId = claim.body.lease.id as number;

  db.prepare('UPDATE leases SET last_activity_at = ? WHERE id = ?').run(new Date(Date.now() - 31 * 60 * 1000).toISOString(), leaseId);
  const recycled = app.get(LeasesService).recycleTimedOutLeases();
  assert.equal(recycled, 1);
  return { accountId, leaseId };
}

test('端到端成功：超时→RECYCLING→job→SUCCESS→AVAILABLE→Lease RELEASED', async () => {
  const { accountId, leaseId } = await claimAndTimeout();

  const summary = await app.get(ResetService).processPendingJobs(successExecutor);
  assert.equal(summary.succeeded, 1);

  const account = db
    .prepare('SELECT status, pending_password_ciphertext, current_password_ciphertext FROM scienceing_accounts WHERE id = ?')
    .get(accountId) as unknown as { status: string; pending_password_ciphertext: string | null; current_password_ciphertext: string | null };
  assert.equal(account.status, 'AVAILABLE');
  assert.equal(account.pending_password_ciphertext, null);
  assert.ok(account.current_password_ciphertext, '成功路径应写入新密码密文');

  const lease = db.prepare('SELECT status FROM leases WHERE id = ?').get(leaseId) as unknown as { status: string };
  assert.equal(lease.status, 'RELEASED');

  const job = db
    .prepare('SELECT status FROM reset_jobs WHERE lease_id = ? ORDER BY id DESC LIMIT 1')
    .get(leaseId) as unknown as { status: string };
  assert.equal(job.status, 'SUCCESS');
});

test('端到端失败：3 次重试后 →ERROR + lease FAILED', async () => {
  const { accountId, leaseId } = await claimAndTimeout();
  const resetService = app.get(ResetService);

  await resetService.processPendingJobs(failExecutor);
  await resetService.processPendingJobs(failExecutor);
  await resetService.processPendingJobs(failExecutor);

  const account = db
    .prepare('SELECT status, pending_password_ciphertext FROM scienceing_accounts WHERE id = ?')
    .get(accountId) as unknown as { status: string; pending_password_ciphertext: string | null };
  assert.equal(account.status, 'ERROR');
  assert.equal(account.pending_password_ciphertext, null);

  const lease = db.prepare('SELECT status FROM leases WHERE id = ?').get(leaseId) as unknown as { status: string };
  assert.equal(lease.status, 'FAILED');

  const job = db
    .prepare('SELECT status, attempt_count FROM reset_jobs WHERE lease_id = ? ORDER BY id DESC LIMIT 1')
    .get(leaseId) as unknown as { status: string; attempt_count: number };
  assert.equal(job.status, 'FAILED');
  assert.equal(job.attempt_count, 3);
});

test('健康检查返回三项结果 + 立即检测', async () => {
  const automationService = app.get(AutomationService);
  const result = await automationService.checkHealth(okHealthExecutor);
  assert.equal(result.adminLoginOk, true);
  assert.equal(result.accountPageOk, true);
  assert.equal(result.resetEntryOk, true);
  assert.ok(result.checkedAt);

  const get = await request(app.getHttpServer()).get('/api/admin/automation/health').set('Authorization', `Bearer ${adminToken}`);
  assert.equal(get.status, 200);
  assert.equal(get.body.adminLoginOk, true);
  assert.equal(get.body.accountPageOk, true);
  assert.equal(get.body.resetEntryOk, true);

  const post = await request(app.getHttpServer())
    .post('/api/admin/automation/health/check')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({});
  assert.equal(post.status, 201);
  assert.equal(typeof post.body.adminLoginOk, 'boolean');
  assert.equal(typeof post.body.accountPageOk, 'boolean');
  assert.equal(typeof post.body.resetEntryOk, 'boolean');
});

test('审计记录 RESET_SUCCESS / RESET_FAILED / ADMIN_MANUAL_FIX', async () => {
  const actions = () => db.prepare('SELECT action FROM audit_logs').all().map((r) => (r as { action: string }).action);
  assert.ok(actions().includes('RESET_SUCCESS'));
  assert.ok(actions().includes('RESET_FAILED'));

  // 人工处理完成（ERROR→AVAILABLE）写 ADMIN_MANUAL_FIX
  const errAccount = db.prepare("SELECT id FROM scienceing_accounts WHERE status = 'ERROR' LIMIT 1").get() as unknown as
    | { id: number }
    | undefined;
  assert.ok(errAccount, '应有失败路径留下的 ERROR 账号');
  const ma = await request(app.getHttpServer())
    .post(`/api/admin/accounts/${errAccount.id}/mark-available`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({});
  assert.equal(ma.status, 201);
  assert.ok(actions().includes('ADMIN_MANUAL_FIX'));
});
