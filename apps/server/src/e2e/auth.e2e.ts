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
const ADMIN_INITIAL_PASSWORD = 'admin123456';
const ADMIN_PASSWORD = 'admin-changed-123';
const MASTER_KEY_HEX = '06bd85dc11dd5998a014a042afb70e714c41f6d46a94b1b119cfd26bff999e54';

let app: INestApplication;
let dbService: DatabaseService;

before(async () => {
  process.env.DATABASE_PATH = ':memory:';
  // verify-password / reset-password 的 HMAC 票据依赖 master key：固定值保证 sign/verify 一致
  process.env.SCIENCEING_MASTER_KEY = MASTER_KEY_HEX;
  app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  await app.init();
  dbService = app.get(DatabaseService);
  await seedDatabase(dbService.db, {
    adminPassword: ADMIN_INITIAL_PASSWORD,
    masterKey: Buffer.from(MASTER_KEY_HEX, 'hex'),
  });

  // 新部署管理员先完成首登改密，再作为其余管理员场景的稳定测试夹具。
  const firstLogin = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: ADMIN_USERNAME, password: ADMIN_INITIAL_PASSWORD });
  assert.equal(firstLogin.status, 200);
  assert.equal(firstLogin.body.user.mustChangePassword, true);
  const changed = await request(app.getHttpServer())
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${firstLogin.body.token}`)
    .send({ currentPassword: ADMIN_INITIAL_PASSWORD, newPassword: ADMIN_PASSWORD });
  assert.equal(changed.status, 200);
  await request(app.getHttpServer())
    .post('/api/auth/logout')
    .set('Authorization', `Bearer ${firstLogin.body.token}`);
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

test('首次登录强制改密 + 管理员重置后再强制（集成闭环）', async () => {
  const adminLogin = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  assert.equal(adminLogin.status, 200);
  const adminToken: string = adminLogin.body.token;

  const utf8Over72Bytes = '密'.repeat(25);
  const invalidCreate = await request(app.getHttpServer())
    .post('/api/admin/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ username: 'too-long-password', displayName: '超长密码', password: utf8Over72Bytes });
  assert.equal(invalidCreate.status, 400);
  assert.match(invalidCreate.body.message, /72 个 UTF-8 字节/);

  // 管理员创建用户 → 初始密码首登强制改（must_change_password=1）
  const created = await request(app.getHttpServer())
    .post('/api/admin/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ username: 'zhangsan', displayName: '张三', department: '研发部', password: 'initial-pass-1' });
  assert.equal(created.status, 201);
  assert.equal(created.body.mustChangePassword, true);
  const userId: number = created.body.id;

  // 首次登录成功但下发 mustChangePassword=true（会话可用，仅业务被拦）
  const firstLogin = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: 'zhangsan', password: 'initial-pass-1' });
  assert.equal(firstLogin.status, 200);
  assert.equal(firstLogin.body.user.mustChangePassword, true);
  const userToken: string = firstLogin.body.token;

  // 同一初始密码建立第二个会话，用来验证改密后旧会话会被撤销。
  const parallelLogin = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: 'zhangsan', password: 'initial-pass-1' });
  assert.equal(parallelLogin.status, 200);
  const parallelToken: string = parallelLogin.body.token;

  // 未改密前访问业务端点被 AuthGuard 拦截（403，先于角色判断）
  const blocked = await request(app.getHttpServer())
    .get('/api/admin/users')
    .set('Authorization', `Bearer ${userToken}`);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.message, '首次登录请先修改初始密码');

  // 当前密码错误 → 改密拒绝
  const wrong = await request(app.getHttpServer())
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ currentPassword: 'wrong-current', newPassword: 'changed-pass-1' });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.message, '当前密码不正确');

  const tooManyBytes = await request(app.getHttpServer())
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ currentPassword: 'initial-pass-1', newPassword: utf8Over72Bytes });
  assert.equal(tooManyBytes.status, 400);
  assert.match(tooManyBytes.body.message, /72 个 UTF-8 字节/);

  // 本人改密成功 = 登录完成：mustChangePassword 清除，业务放行
  const changed = await request(app.getHttpServer())
    .post('/api/auth/change-password')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ currentPassword: 'initial-pass-1', newPassword: 'changed-pass-1' });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.mustChangePassword, false);

  const meAfterChange = await request(app.getHttpServer())
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${userToken}`);
  assert.equal(meAfterChange.status, 200);
  assert.equal(meAfterChange.body.mustChangePassword, false);
  assert.equal(meAfterChange.body.firstLoginAt !== null, true, '首次登录时间应已记录');

  const parallelSessionAfterChange = await request(app.getHttpServer())
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${parallelToken}`);
  assert.equal(parallelSessionAfterChange.status, 401, '改密后必须撤销由旧密码建立的其它会话');

  // 管理员重置该用户密码 → 旧会话失效 + must_change_password 再次置 1
  const verify = await request(app.getHttpServer())
    .post('/api/admin/verify-password')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ password: ADMIN_PASSWORD });
  assert.equal(verify.status, 201);
  const verifyToken: string = verify.body.verifyToken;

  const reset = await request(app.getHttpServer())
    .post(`/api/admin/users/${userId}/reset-password`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ newPassword: 'admin-set-pass-9', verifyToken });
  assert.equal(reset.status, 201);
  assert.equal(reset.body.mustChangePassword, true, '重置后应再次强制改密');

  const meAfterReset = await request(app.getHttpServer())
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${userToken}`);
  assert.equal(meAfterReset.status, 401);

  // 用管理员设置的临时密码重登 → 仍须先改密
  const relogin = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: 'zhangsan', password: 'admin-set-pass-9' });
  assert.equal(relogin.status, 200);
  assert.equal(relogin.body.user.mustChangePassword, true);
});

test('审计：登录/登出/用户增改/本人改密已记录', () => {
  const rows = dbService.db.prepare('SELECT action FROM audit_logs').all() as Array<{ action: string }>;
  const actions = rows.map((row) => row.action);
  assert.ok(actions.includes('LOGIN'));
  assert.ok(actions.includes('LOGOUT'));
  assert.ok(actions.includes('USER_CREATE'));
  assert.ok(actions.includes('USER_PASSWORD_RESET'));
  assert.ok(actions.includes('PASSWORD_CHANGE'));
});
