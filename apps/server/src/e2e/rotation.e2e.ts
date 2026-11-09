import 'reflect-metadata';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type DatabaseSync } from 'node:sqlite';
import { AppModule } from '../app.module';
import { DatabaseService } from '../db/database.service';
import { seedDatabase } from '../db/seed';
import { RotationService } from '../modules/reset/rotation.service';
import { ResetService } from '../modules/reset/reset.service';
import type { ResetExecutor } from '../modules/automation/automation.types';
import { provisionSeedAccounts } from './extension-fixture';

const MASTER_KEY_HEX = '06bd85dc11dd5998a014a042afb70e714c41f6d46a94b1b119cfd26bff999e54';

const okExecutor: ResetExecutor = {
  async execute() {
    return { success: true };
  },
};

let app: INestApplication;
let db: DatabaseSync;
let rotation: RotationService;
let reset: ResetService;

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PATH = ':memory:';
  process.env.SCIENCEING_MASTER_KEY = MASTER_KEY_HEX;
  // 后台任务全部推远：本文件只手动调用 sweep / processPendingJobs
  process.env.RECYCLE_INTERVAL_MS = '3600000';
  process.env.RESET_INTERVAL_MS = '3600000';
  process.env.ROTATION_INTERVAL_MS = '3600000';

  app = await NestFactory.create(AppModule);
  await app.init();
  db = app.get(DatabaseService).db;
  const masterKey = Buffer.from(MASTER_KEY_HEX, 'hex');
  await seedDatabase(db, { adminPassword: 'admin123456', masterKey });
  provisionSeedAccounts(db, masterKey);
  rotation = app.get(RotationService);
  reset = app.get(ResetService);
});

after(async () => {
  await app.close();
});

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** 把指定账号的「上次改密」推到 N 天前，模拟长期无人领用。 */
function backdate(accountId: number, days: number): void {
  db.prepare('UPDATE scienceing_accounts SET last_password_changed_at = ? WHERE id = ?').run(
    daysAgoIso(days),
    accountId,
  );
}

/** 取前 N 个 AVAILABLE 账号的 id。 */
function pickAvailable(count: number): number[] {
  const rows = db
    .prepare("SELECT id FROM scienceing_accounts WHERE status = 'AVAILABLE' ORDER BY id LIMIT ?")
    .all(count) as unknown as Array<{ id: number }>;
  return rows.map((row) => row.id);
}

/** 取一个 AVAILABLE 账号；拿不到直接失败，避免把 undefined 喂进 SQL。 */
function pickOne(): number {
  const id = pickAvailable(1)[0];
  if (id === undefined) throw new Error('需要至少一个 AVAILABLE 账号');
  return id;
}

function clearJobs(): void {
  db.exec('DELETE FROM reset_jobs');
}

/**
 * 把账号池恢复到「刚改过密、全部可用」的干净起点。
 *
 * 每条用例都调用：否则上一条用例故意推老的账号会漏到下一条，
 * 制造出看似产品 bug、实为串扰的失败（第一版就踩了）。
 */
function resetPool(): void {
  clearJobs();
  db.exec(
    "UPDATE scienceing_accounts SET status = 'AVAILABLE', rotation_due_reason = NULL, rotation_not_before = NULL",
  );
  db.prepare('UPDATE scienceing_accounts SET last_password_changed_at = ?').run(new Date().toISOString());
}

test('超期清扫：超过有效期的空闲账号被排入改密，状态与审计同步', () => {
  resetPool();
  const targets = pickAvailable(2);
  assert.equal(targets.length, 2, '种子账号应足够');
  for (const id of targets) backdate(id, 40);

  const result = rotation.sweepOverdueRotations();

  assert.equal(result.enqueued, 2);
  // 正常配置下不该有推迟：刚改过的账号应落进 NOT_DUE 而不是 MIN_INTERVAL
  assert.equal(result.deferred, 0);

  for (const id of targets) {
    const row = db
      .prepare('SELECT status, rotation_due_reason FROM scienceing_accounts WHERE id = ?')
      .get(id) as unknown as { status: string; rotation_due_reason: string | null };
    // 排入改密即进入 RECYCLING：此时不允许被领取
    assert.equal(row.status, 'RECYCLING');
    assert.equal(row.rotation_due_reason, 'PASSWORD_EXPIRED');

    const job = db
      .prepare('SELECT status FROM reset_jobs WHERE account_id = ? ORDER BY id DESC LIMIT 1')
      .get(id) as unknown as { status: string } | undefined;
    assert.equal(job?.status, 'PENDING');
  }

  const audits = db
    .prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'AUTO_ROTATION_ENQUEUED'")
    .get() as unknown as { count: number };
  assert.equal(audits.count, 2);
});

test('超期清扫：队列有任务时整轮让路，不往队列里继续塞', () => {
  resetPool();
  // 先制造一个 PENDING job，让队列处于「忙」的状态
  const queued = pickOne();
  backdate(queued, 40);
  rotation.sweepOverdueRotations();
  const pending = db
    .prepare("SELECT COUNT(*) AS count FROM reset_jobs WHERE status = 'PENDING'")
    .get() as unknown as { count: number };
  assert.equal(pending.count, 1);

  // 再来两个超期账号：本轮应该整体让路
  const more = pickAvailable(2);
  for (const id of more) backdate(id, 40);

  const result = rotation.sweepOverdueRotations();
  assert.equal(result.queueBusy, true);
  assert.equal(result.enqueued, 0);

  // 让路的账号必须保持原状态，不能因为「看过一眼」就被改掉
  for (const id of more) {
    const row = db.prepare('SELECT status FROM scienceing_accounts WHERE id = ?').get(id) as unknown as {
      status: string;
    };
    assert.equal(row.status, 'AVAILABLE');
  }
});

test('改密成功后清空欠密标记并恢复 AVAILABLE', async () => {
  resetPool();
  const targets = pickAvailable(2);
  for (const id of targets) backdate(id, 40);
  rotation.sweepOverdueRotations();

  const processed = await reset.processPendingJobs(okExecutor);
  assert.equal(processed.succeeded, 2);

  // 改密成功即「还清」：欠密原因与解禁时间都必须清掉，
  // 否则账号会永久显示「欠一次改密」，下一轮清扫也会误判
  const rows = db
    .prepare('SELECT status, rotation_due_reason, rotation_not_before FROM scienceing_accounts WHERE rotation_due_reason IS NOT NULL')
    .all() as unknown as Array<{ status: string; rotation_due_reason: string; rotation_not_before: string | null }>;
  assert.equal(rows.length, 0, '改密成功后不应残留 rotation_due_reason');

  for (const id of targets) {
    const row = db.prepare('SELECT status FROM scienceing_accounts WHERE id = ?').get(id) as unknown as {
      status: string;
    };
    assert.equal(row.status, 'AVAILABLE');
  }
});

test('超期清扫：未托管密码（占位/解密失败）的账号不被排入', () => {
  resetPool();
  const id = pickOne();
  const original = db
    .prepare('SELECT current_password_ciphertext AS ct FROM scienceing_accounts WHERE id = ?')
    .get(id) as unknown as { ct: string | null };
  // 密文置空即「未托管」：这类账号在科应上往往连用户名都不对，
  // 排入改密只会一次失败转 ERROR，把账号池烧掉
  db.prepare('UPDATE scienceing_accounts SET current_password_ciphertext = NULL WHERE id = ?').run(id);
  backdate(id, 40);

  try {
    const result = rotation.sweepOverdueRotations();
    assert.equal(result.enqueued, 0);
    assert.equal(result.skipped.NOT_PROVISIONED, 1);

    const row = db.prepare('SELECT status FROM scienceing_accounts WHERE id = ?').get(id) as unknown as {
      status: string;
    };
    assert.equal(row.status, 'AVAILABLE');
  } finally {
    // 还原密文：账号池是全文件共享的，留着 NULL 会影响后续用例
    db.prepare('UPDATE scienceing_accounts SET current_password_ciphertext = ? WHERE id = ?').run(
      original.ct,
      id,
    );
  }
});

test('超期清扫：关闭开关后完全不动', () => {
  resetPool();
  const id = pickOne();
  backdate(id, 40);
  db.prepare("UPDATE system_settings SET value = '0' WHERE key = 'password_max_age_days'").run();

  try {
    const result = rotation.sweepOverdueRotations();
    assert.equal(result.enqueued, 0);
    assert.equal(result.skipped.DISABLED, 1);
    assert.equal(result.scanned, 0, '关闭状态下不应查候选');

    const row = db.prepare('SELECT status FROM scienceing_accounts WHERE id = ?').get(id) as unknown as {
      status: string;
    };
    assert.equal(row.status, 'AVAILABLE');
  } finally {
    db.prepare("UPDATE system_settings SET value = '30' WHERE key = 'password_max_age_days'").run();
  }
});
