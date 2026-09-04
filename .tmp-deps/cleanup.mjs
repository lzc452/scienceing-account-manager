/* 清理本轮回归产生的测试数据（仅删除测试标识的数据，保留真实业务数据）。用完即删。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = [];
function log(...a) {
  OUT.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  fs.writeFileSync(path.join(ROOT, '.tmp-deps/cleanup.log'), OUT.join('\n'), 'utf8');
}

const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
const conf = {};
for (const l of env) {
  const i = l.indexOf('=');
  if (i > 0) conf[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const API = 'http://127.0.0.1:3000/api';

async function call(method, p, body, token) {
  const res = await fetch(API + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

(async () => {
  const login = await call('POST', '/auth/login', { username: 'admin', password: conf.ADMIN_INITIAL_PASSWORD });
  const token = login.data.token;

  // ---- 1. 删除测试科应账号（经 API，级联清理租约/审计/任务） ----
  const accounts = (await call('GET', '/admin/accounts', undefined, token)).data ?? [];
  const testAccountPattern = /^(CSV|Q|RG|Z|UIA|UIB)\d+[A-Z]?$/;
  let removedAccounts = 0;
  for (const a of accounts) {
    if (!testAccountPattern.test(a.code ?? '')) continue;
    const del = await call('DELETE', `/admin/accounts/${a.id}`, undefined, token);
    if (del.status === 200) {
      removedAccounts += 1;
      log(`  已删除测试账号 ${a.code} (${a.username})`);
    } else {
      log(`  !! 删除失败 ${a.code}: ${del.status} ${JSON.stringify(del.data?.message ?? '')}`);
    }
  }
  log(`测试账号清理：删除 ${removedAccounts} 个`);

  // ---- 2. 报告测试用户（无删除用户端点，列出供人工确认） ----
  const users = (await call('GET', '/admin/users', undefined, token)).data ?? [];
  const testUsers = users.filter(
    (u) => /^(csv_u\d*|uia|uib|g\d+|p\d+|rgu\d*|admA\d+|dup\d+|ok\d+)\d{6,}/.test(u.username ?? ''),
  );
  log(`\n测试用户（本轮回归产生，共 ${testUsers.length} 个；系统未提供删除用户端点）:`);
  testUsers.forEach((u) => log(`  #${u.id} ${u.username} (${u.displayName})`));

  log('\n真实用户（保留）:');
  users
    .filter((u) => !testUsers.includes(u))
    .forEach((u) => log(`  #${u.id} ${u.username} (${u.displayName})`));

  log('\n注意：回归过程中为验证「重置用户密码」链路，已把 zhangsan 的登录密码改为 ResetPass!2026（原密码哈希不可逆，无法还原）。');
})();
