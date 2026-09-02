import 'reflect-metadata';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DatabaseService } from '../db/database.service';
import { seedDatabase } from '../db/seed';

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123456';

let app: INestApplication;
let dbService: DatabaseService;

before(async () => {
  process.env.DATABASE_PATH = ':memory:';
  app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  await app.init();
  dbService = app.get(DatabaseService);
  await seedDatabase(dbService.db, {
    adminPassword: ADMIN_PASSWORD,
    masterKey: Buffer.alloc(32, 7),
  });
});

after(async () => {
  await app.close();
});

test('登录 → me → 登出（集成闭环）', async () => {
  const login = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  assert.equal(login.status, 200);
  assert.ok(login.body.token);
  assert.equal(login.body.user.role, 'ADMIN');
  const token: string = login.body.token;

  const me = await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  assert.equal(me.status, 200);
  assert.equal(me.body.username, ADMIN_USERNAME);

  const logout = await request(app.getHttpServer()).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
  assert.equal(logout.status, 200);

  const meAfter = await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  assert.equal(meAfter.status, 401);
});

test('错误密码与用户不存在返回统一错误', async () => {
  const wrong = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: ADMIN_USERNAME, password: 'wrong-password' });
  const notFound = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: 'no-such-user', password: 'whatever' });
  assert.equal(wrong.status, 401);
  assert.equal(notFound.status, 401);
  assert.equal(wrong.body.message, notFound.body.message);
  assert.equal(wrong.body.message, '用户名或密码错误');
});

test('非 admin 访问 admin 端点 403；重置密码后旧会话失效', async () => {
  const adminLogin = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  const adminToken: string = adminLogin.body.token;

  const created = await request(app.getHttpServer())
    .post('/api/admin/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ username: 'zhangsan', displayName: '张三', department: '研发部', password: 'initial-pass-1' });
  assert.equal(created.status, 201);
  const userId: number = created.body.id;

  const userLogin = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: 'zhangsan', password: 'initial-pass-1' });
  assert.equal(userLogin.status, 200);
  const userToken: string = userLogin.body.token;

  const forbidden = await request(app.getHttpServer())
    .get('/api/admin/users')
    .set('Authorization', `Bearer ${userToken}`);
  assert.equal(forbidden.status, 403);

  const reset = await request(app.getHttpServer())
    .patch(`/api/admin/users/${userId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ password: 'new-pass-2' });
  assert.equal(reset.status, 200);

  const meAfterReset = await request(app.getHttpServer())
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${userToken}`);
  assert.equal(meAfterReset.status, 401);

  const relogin = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: 'zhangsan', password: 'new-pass-2' });
  assert.equal(relogin.status, 200);
});

test('审计：登录/登出/用户增改已记录', () => {
  const rows = dbService.db.prepare('SELECT action FROM audit_logs').all() as Array<{ action: string }>;
  const actions = rows.map((row) => row.action);
  assert.ok(actions.includes('LOGIN'));
  assert.ok(actions.includes('LOGOUT'));
  assert.ok(actions.includes('USER_CREATE'));
  assert.ok(actions.includes('USER_PASSWORD_RESET'));
});
