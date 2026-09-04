/* 清理 xlsx 回归产生的测试账号。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
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
  return { status: res.status, data: await res.json().catch(() => null) };
}

const login = await call('POST', '/auth/login', { username: 'admin', password: conf.ADMIN_INITIAL_PASSWORD });
const token = login.data.token;
const accounts = (await call('GET', '/admin/accounts', undefined, token)).data ?? [];
let n = 0;
for (const a of accounts) {
  if (/^XA\d+[12]$/.test(a.code ?? '')) {
    const r = await call('DELETE', `/admin/accounts/${a.id}`, undefined, token);
    console.log(`删除 ${a.code}: ${r.status}`);
    n += 1;
  }
}
console.log(`共删除 ${n} 个测试账号`);
