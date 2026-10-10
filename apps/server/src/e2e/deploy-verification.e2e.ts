import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DatabaseService } from '../db/database.service';
import { migrate } from '../db/migrate';
import { ResetService } from '../modules/reset/reset.service';
import { deploymentVerificationMiddleware } from '../lib/deploy-verification';

test('生产维护验证：业务请求被阻断、连接只读、初始化与后台改密不写库', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'scienceing-verification-'));
  const path = join(directory, 'scienceing.prod.db');
  const db = new DatabaseSync(path);
  migrate(db);
  db.exec("INSERT INTO users(username,display_name,password_hash,created_at,updated_at) VALUES('existing','existing','synthetic','2026-01-01','2026-01-01')");
  db.close();
  const keys = ['NODE_ENV', 'DATABASE_PATH', 'SCIENCEING_DEPLOY_VERIFY_ONLY', 'RESET_INTERVAL_MS', 'RECYCLE_INTERVAL_MS', 'SESSION_SWEEP_INTERVAL_MS'];
  const previous = keys.map((key) => process.env[key]);
  Object.assign(process.env, { NODE_ENV: 'production', DATABASE_PATH: path, SCIENCEING_DEPLOY_VERIFY_ONLY: '1', RESET_INTERVAL_MS: '1', RECYCLE_INTERVAL_MS: '1', SESSION_SWEEP_INTERVAL_MS: '1' });
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  app.setGlobalPrefix('api');
  app.use(deploymentVerificationMiddleware);
  let processed = 0;
  app.get(ResetService).processPendingJobs = async () => { processed += 1; return { processed: 0, succeeded: 0, failed: 0 }; };
  try {
    await app.init();
    assert.equal((await request(app.getHttpServer()).get('/api/extension/config')).status, 200);
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'existing', password: 'x' });
    assert.equal(login.status, 503);
    assert.equal(login.headers['cache-control'], 'no-store');
    assert.equal((await request(app.getHttpServer()).post('/api/extension/claim-proof')).status, 503);
    assert.equal((await request(app.getHttpServer()).get('/api/admin/accounts')).status, 503);
    const connection = app.get(DatabaseService).db;
    assert.throws(() => connection.exec("UPDATE users SET display_name='changed'"), /readonly/i);
    await delay(30);
    assert.equal(processed, 0);
    assert.equal(connection.prepare('SELECT COUNT(*) AS n FROM manuals').get()?.n, 0);
    assert.equal(connection.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()?.n, 0);
    assert.equal(connection.prepare('SELECT display_name FROM users').get()?.display_name, 'existing');
  } finally {
    await app.close();
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
    rmSync(directory, { recursive: true, force: true });
  }
});
