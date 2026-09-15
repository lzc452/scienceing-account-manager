/**
 * 账号密码密文格式回归测试（L2-14）
 *
 * 覆盖三件事：
 *  1. **AAD 绑定**：密文与 account.id 绑定，不能从一个账号搬到另一个账号；
 *  2. **迁移**：存量 v1（无 AAD）密文可被「读旧 → 重加密」升级为 v2，且幂等、可 dry-run、
 *     解不开的密文只记录不覆盖；
 *  3. **HMAC 域分离**：票据签名改用 HKDF 派生的子密钥，不再直接等于 master key 的 HMAC。
 *
 * 前置：需要先构建后端（pnpm --filter @scienceing/server build）。
 * 运行：node --test scripts/test/account-password-crypto.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const DIST = join(REPO_ROOT, 'apps', 'server', 'dist');

if (!existsSync(join(DIST, 'crypto', 'secret-box.js'))) {
  throw new Error(
    `后端未构建：找不到 ${join(DIST, 'crypto', 'secret-box.js')}。\n`
      + '  请先执行：pnpm --filter @scienceing/server build',
  );
}

const require = createRequire(import.meta.url);
const {
  encryptSecret, decryptSecret, serializePayload, parsePayload,
  accountAad, needsAadMigration, payloadVersion,
} = require(join(DIST, 'crypto', 'secret-box.js'));
const { reencryptAccountPasswords } = require(join(DIST, 'db', 'reencrypt-account-passwords.js'));
const { signVerifyToken, verifyVerifyToken } = require(join(DIST, 'crypto', 'verify-token.js'));
const { MIGRATIONS } = require(join(DIST, 'db', 'migrations.js'));

const KEY = randomBytes(32);
const NOW = new Date().toISOString();

/** 用真实迁移建库，保证跑在生产同款 schema 上。 */
function freshDb() {
  const db = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS) {
    for (const stmt of m.sql.split(';').map((s) => s.trim()).filter(Boolean)) db.exec(stmt);
  }
  return db;
}

function addAccount(db, id, code, ciphertext) {
  db.prepare(
    `INSERT INTO scienceing_accounts
       (id, code, username, current_password_ciphertext, status, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'AVAILABLE', 1, ?, ?)`,
  ).run(id, code, code.toLowerCase(), ciphertext, NOW, NOW);
}

function ciphertextOf(db, id) {
  return db.prepare('SELECT current_password_ciphertext AS c FROM scienceing_accounts WHERE id = ?').get(id).c;
}

// ───────────────────────── AAD 绑定 ─────────────────────────

test('L2-14a: 同账号加解密闭环', () => {
  const payload = encryptSecret('secret-pw', KEY, accountAad(7));
  assert.equal(decryptSecret(payload, KEY, accountAad(7)), 'secret-pw');
});

test('L2-14a: 密文搬到别的账号后解密失败（密文与账号绑定）', () => {
  const payload = encryptSecret('secret-pw', KEY, accountAad(7));
  assert.throws(
    () => decryptSecret(payload, KEY, accountAad(8)),
    '把 A 账号的密文当 B 账号解竟然成功 —— AAD 未生效',
  );
});

test('L2-14a: v2 载荷未提供账号标识时明确报错', () => {
  const payload = encryptSecret('secret-pw', KEY, accountAad(7));
  assert.throws(() => decryptSecret(payload, KEY), /必须提供账号标识/);
});

test('L2-14a: 版本号经序列化保留（否则 v2 会被当成 v1 解密）', () => {
  const payload = encryptSecret('x', KEY, accountAad(1));
  assert.equal(payloadVersion(payload), 2);
  const restored = parsePayload(serializePayload(payload));
  assert.equal(payloadVersion(restored), 2);
  assert.equal(needsAadMigration(restored), false);
});

test('L2-14a: 历史 v1 密文在迁移期内仍可读', () => {
  const legacy = encryptSecret('legacy-pw', KEY); // 不传 aad = v1
  assert.equal(payloadVersion(legacy), 1);
  assert.equal(needsAadMigration(legacy), true);
  assert.equal(decryptSecret(legacy, KEY), 'legacy-pw');
  assert.equal(decryptSecret(legacy, KEY, accountAad(3)), 'legacy-pw');
});

// ───────────────────────── 迁移 ─────────────────────────

test('L2-14 迁移：v1 密文升级为 v2 且明文不变', () => {
  const db = freshDb();
  addAccount(db, 1, 'KY-01', serializePayload(encryptSecret('real-pw-1', KEY)));
  addAccount(db, 2, 'KY-02', serializePayload(encryptSecret('real-pw-2', KEY)));

  const summary = reencryptAccountPasswords(db, KEY, false);
  assert.equal(summary.migrated, 2);
  assert.deepEqual(summary.failed, []);

  for (const [id, expected] of [[1, 'real-pw-1'], [2, 'real-pw-2']]) {
    const payload = parsePayload(ciphertextOf(db, id));
    assert.equal(payloadVersion(payload), 2, `账号 ${id} 应升级到 v2`);
    assert.equal(decryptSecret(payload, KEY, accountAad(id)), expected);
  }
});

test('L2-14 迁移：升级后密文确实与账号绑定', () => {
  const db = freshDb();
  addAccount(db, 1, 'KY-01', serializePayload(encryptSecret('pw-1', KEY)));
  reencryptAccountPasswords(db, KEY, false);
  assert.throws(() => decryptSecret(parsePayload(ciphertextOf(db, 1)), KEY, accountAad(2)));
});

test('L2-14 迁移：幂等，重复执行不再改动', () => {
  const db = freshDb();
  addAccount(db, 1, 'KY-01', serializePayload(encryptSecret('pw', KEY)));
  reencryptAccountPasswords(db, KEY, false);
  const second = reencryptAccountPasswords(db, KEY, false);
  assert.equal(second.migrated, 0);
  assert.equal(second.alreadyCurrent, 1);
});

test('L2-14 迁移：dry-run 只统计、不写库', () => {
  const db = freshDb();
  const original = serializePayload(encryptSecret('pw', KEY));
  addAccount(db, 1, 'KY-01', original);
  const summary = reencryptAccountPasswords(db, KEY, true);
  assert.equal(summary.migrated, 1);
  assert.equal(ciphertextOf(db, 1), original, 'dry-run 不应改动数据库');
});

test('L2-14 迁移：解不开的密文只记录不覆盖（保住唯一可恢复的原件）', () => {
  const db = freshDb();
  const broken = serializePayload(encryptSecret('pw', randomBytes(32))); // 用错的主密钥加密
  addAccount(db, 1, 'KY-01', broken);
  const summary = reencryptAccountPasswords(db, KEY, false);
  assert.equal(summary.failed.length, 1);
  assert.equal(ciphertextOf(db, 1), broken, '解不开的密文被覆盖会毁掉原件');
});

// ───────────────────────── HMAC 域分离 ─────────────────────────

test('L2-14b: 票据签发/校验仍闭环，且绑定 userId', () => {
  process.env.SCIENCEING_MASTER_KEY = randomBytes(32).toString('hex');
  const { token } = signVerifyToken(42);
  assert.equal(verifyVerifyToken(token, 42), true);
  assert.equal(verifyVerifyToken(token, 43), false, '换 userId 必须拒绝');
});

test('L2-14b: 签名来自 HKDF 子密钥，而非 master key 直接 HMAC', () => {
  process.env.SCIENCEING_MASTER_KEY = randomBytes(32).toString('hex');
  const masterKey = Buffer.from(process.env.SCIENCEING_MASTER_KEY, 'hex');
  const { token } = signVerifyToken(1);
  const dot = token.lastIndexOf('.');
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const naive = createHmac('sha256', masterKey).update(body).digest('base64url');
  assert.notEqual(signature, naive, '签名仍等于「master key 直接 HMAC」—— 未做域分离');

  const derived = Buffer.from(
    hkdfSync('sha256', masterKey, Buffer.alloc(0), 'scienceing:verify-token:hmac:v1', 32),
  );
  const expected = createHmac('sha256', derived).update(body).digest('base64url');
  assert.equal(signature, expected);
});
