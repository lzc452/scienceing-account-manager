/* 临时冒烟脚本：验证 CSV 批量导入链路（登录 → bulk 端点）。用完即删。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
const conf = {};
for (const line of env) {
  const i = line.indexOf('=');
  if (i > 0) conf[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = 'http://127.0.0.1:3000/api';

async function call(method, p, body, token) {
  const res = await fetch(BASE + p, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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
  console.log('[login] status=', login.status, 'role=', login.data && login.data.user && login.data.user.role);
  if (login.status !== 200) {
    console.log('[login] body=', JSON.stringify(login.data));
    return;
  }
  const token = login.data.token;

  // --- 用户 CSV 批量导入 ---
  const ts = Date.now();
  const users = [
    { username: `csv_u1_${ts}`, displayName: '导入测试1', department: '研发部', role: 'USER', password: 'Passw0rd!test' },
    { username: `csv_u2_${ts}`, displayName: '导入测试2', department: '产品部', role: 'USER', password: 'Passw0rd!test' },
  ];
  const r1 = await call('POST', '/admin/users/bulk', { users }, token);
  console.log('[users/bulk] status=', r1.status, 'body=', JSON.stringify(r1.data));

  // 重复用户名（应部分失败）
  const r2 = await call('POST', '/admin/users/bulk', { users: [users[0], { username: `csv_u3_${ts}`, displayName: 'x', password: 'p' }] }, token);
  console.log('[users/bulk dup] status=', r2.status, 'body=', JSON.stringify(r2.data));

  // --- 科应账号 CSV 批量导入 ---
  const accounts = [
    { code: `CSV${String(ts).slice(-6)}A`, username: `csv-a-${ts}` },
    { code: `CSV${String(ts).slice(-6)}B`, username: `csv-b-${ts}` },
  ];
  const r3 = await call('POST', '/admin/accounts/bulk', { accounts }, token);
  console.log('[accounts/bulk] status=', r3.status, 'body=', JSON.stringify(r3.data));

  // 非法账号编号（含空格）
  const r4 = await call('POST', '/admin/accounts/bulk', { accounts: [{ code: 'BAD CODE!', username: 'x' }] }, token);
  console.log('[accounts/bulk bad] status=', r4.status, 'body=', JSON.stringify(r4.data));

  // --- 列表回读，确认真的入库 ---
  const list = await call('GET', '/admin/users', undefined, token);
  const created = (list.data || []).filter((u) => u.username && u.username.startsWith('csv_u'));
  console.log('[users list] total=', (list.data || []).length, 'csvImported=', created.length);

  const alist = await call('GET', '/admin/accounts', undefined, token);
  const aCreated = (alist.data || []).filter((a) => a.code && a.code.startsWith('CSV'));
  console.log('[accounts list] total=', (alist.data || []).length, 'csvImported=', aCreated.length);
})();
