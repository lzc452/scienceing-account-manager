/* 回归验证：CSV 导入 + 管理员二次验证 + 待改密标记。用完即删。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = [];
function log(...a) {
  OUT.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  fs.writeFileSync(path.join(ROOT, '.tmp-deps/regress-api.log'), OUT.join('\n'), 'utf8');
}
let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) {
    pass += 1;
    log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    fail += 1;
    log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
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

const ts = Date.now();

(async () => {
  // ---------- 管理员登录 ----------
  const login = await call('POST', '/auth/login', { username: 'admin', password: conf.ADMIN_INITIAL_PASSWORD });
  check('管理员登录', login.status === 200, `status=${login.status}`);
  const token = login.data?.token;
  const adminId = login.data?.user?.id;

  // ================= 1. 待改密标记 =================
  log('\n[1] 科应账号：待改密标记');
  const accRes = await call('GET', '/admin/accounts', undefined, token);
  const accounts = accRes.data ?? [];
  check('账号列表返回 passwordProvisioned 字段', accounts.length > 0 && typeof accounts[0].passwordProvisioned === 'boolean');

  const csvCode = `RG${String(ts).slice(-6)}A`;
  const bulk = await call('POST', '/admin/accounts/bulk', { accounts: [{ code: csvCode, username: `rg-a-${ts}` }] }, token);
  check('CSV 导入科应账号', bulk.status === 201 && bulk.data.created === 1, JSON.stringify(bulk.data));
  const after = (await call('GET', '/admin/accounts', undefined, token)).data ?? [];
  const imported = after.find((a) => a.code === csvCode);
  check('导入的账号标记为「待改密」(passwordProvisioned=false)', imported?.passwordProvisioned === false, `实际=${imported?.passwordProvisioned}`);

  // isPasswordProvisioned 单元行为（直接调用编译产物）
  const { isPasswordProvisioned } = await import(
    'file:///D:/studyspace/scienceing-account-manager/apps/server/dist/crypto/account-password-state.js'
  );
  check('isPasswordProvisioned(null) = false', isPasswordProvisioned(null) === false);
  check('isPasswordProvisioned(损坏密文) = false（不抛异常）', isPasswordProvisioned('not-json') === false);

  // ================= 2. 重置用户密码：管理员二次验证 =================
  log('\n[2] 重置用户密码：管理员二次验证（HMAC 短时票据）');
  const targetUsername = `rgu${ts}`;
  const created = await call(
    'POST',
    '/admin/users',
    { username: targetUsername, displayName: '回归用户', department: 'QA', role: 'USER', password: 'OldPassw0rd!1' },
    token,
  );
  check('创建待重置的测试用户', created.status === 201, `status=${created.status}`);
  const targetId = created.data?.id;

  // 2.1 PATCH 直改密码必须被拒绝（绕过防护）
  const bypass = await call('PATCH', `/admin/users/${targetId}`, { password: 'HackedPassw0rd!1' }, token);
  check('PATCH 直改密码被拒绝（堵死绕过）', bypass.status === 400, `status=${bypass.status} msg=${bypass.data?.message}`);

  // 2.2 无票据重置 → 401
  const noToken = await call('POST', `/admin/users/${targetId}/reset-password`, { newPassword: 'NewPassw0rd!1' }, token);
  check('无 verifyToken 重置被拒绝', noToken.status === 401, `status=${noToken.status}`);

  // 2.3 伪造票据 → 401
  const fakeToken = await call(
    'POST',
    `/admin/users/${targetId}/reset-password`,
    { newPassword: 'NewPassw0rd!1', verifyToken: 'user-password-reset:1:99999999999999.forged' },
    token,
  );
  check('伪造 verifyToken 被拒绝', fakeToken.status === 401, `status=${fakeToken.status}`);

  // 2.4 错误管理员密码 → 401
  const wrongPw = await call('POST', '/admin/verify-password', { password: 'definitely-wrong' }, token);
  check('错误管理员密码被拒绝', wrongPw.status === 401, `status=${wrongPw.status} msg=${wrongPw.data?.message}`);

  // 2.5 空密码 → 400
  const emptyPw = await call('POST', '/admin/verify-password', { password: '' }, token);
  check('空密码被拒绝', emptyPw.status === 400, `status=${emptyPw.status}`);

  // 2.6 正确密码 → 签发票据
  const verify = await call('POST', '/admin/verify-password', { password: conf.ADMIN_INITIAL_PASSWORD }, token);
  check('正确管理员密码签发 verifyToken', verify.status === 201 && typeof verify.data?.verifyToken === 'string', `status=${verify.status}`);
  const vt = verify.data?.verifyToken;
  check('票据绑定管理员 id', typeof vt === 'string' && vt.includes(`:${adminId}:`), vt ? vt.replace(/\..*$/, '') : 'n/a');

  // 2.7 票据换绑其他管理员 → 应拒绝（用另一个管理员会话调用）
  const otherUsername = `admA${ts}`;
  await call('POST', '/admin/users', { username: otherUsername, displayName: '管理员B', role: 'ADMIN', password: 'Adm1nPass!x' }, token);
  const loginB = await call('POST', '/auth/login', { username: otherUsername, password: 'Adm1nPass!x' });
  const tokenB = loginB.data?.token;
  const crossUse = await call('POST', `/admin/users/${targetId}/reset-password`, { newPassword: 'NewPassw0rd!1', verifyToken: vt }, tokenB);
  check('A 的票据不能由 B 使用（绑定 userId）', crossUse.status === 401, `status=${crossUse.status}`);

  // 2.8 弱密码 → 400
  const weak = await call('POST', `/admin/users/${targetId}/reset-password`, { newPassword: '123', verifyToken: vt }, token);
  check('弱密码被拒绝（长度约束）', weak.status === 400, `status=${weak.status} msg=${weak.data?.message}`);

  // 2.9 合法票据 → 重置成功
  const newPwd = 'NewPassw0rd!1';
  const reset = await call('POST', `/admin/users/${targetId}/reset-password`, { newPassword: newPwd, verifyToken: vt }, token);
  check('携带合法票据重置成功', reset.status === 201, `status=${reset.status} ${JSON.stringify(reset.data?.message ?? '')}`);

  // 2.10 用新密码登录被重置的用户
  const relogin = await call('POST', '/auth/login', { username: targetUsername, password: newPwd });
  check('新密码可登录', relogin.status === 200, `status=${relogin.status}`);
  const oldLogin = await call('POST', '/auth/login', { username: targetUsername, password: 'OldPassw0rd!1' });
  check('旧密码已失效', oldLogin.status === 401, `status=${oldLogin.status}`);

  // 2.11 不能重置自己的密码
  const selfReset = await call('POST', `/admin/users/${adminId}/reset-password`, { newPassword: 'NewPassw0rd!1', verifyToken: vt }, token);
  check('不能通过重置用户密码改自己的密码', selfReset.status === 403, `status=${selfReset.status}`);

  // ================= 3. CSV 用户导入（后端侧） =================
  log('\n[3] 用户 CSV 批量导入');
  const users = [
    { username: `rgu1${ts}`, displayName: '甲', department: 'QA', role: 'USER', password: 'Passw0rd!a' },
    { username: `rgu2${ts}`, displayName: '乙', department: 'QA', role: 'USER', password: 'Passw0rd!b' },
  ];
  const ub = await call('POST', '/admin/users/bulk', { users }, token);
  check('批量导入用户成功', ub.status === 201 && ub.data.created === 2, JSON.stringify(ub.data));
  const dup = await call('POST', '/admin/users/bulk', { users: [users[0]] }, token);
  check('重复导入被逐行拒绝且不阻断整批', dup.status === 201 && dup.data.created === 0 && dup.data.failed.length === 1, JSON.stringify(dup.data));

  // ---------- 清理测试数据 ----------
  log('\n[清理]');
  const finalUsers = (await call('GET', '/admin/users', undefined, token)).data ?? [];
  let cleaned = 0;
  for (const u of finalUsers) {
    if (/^rgu\d*\d{6,}/.test(u.username ?? '') || u.username === targetUsername || u.username === otherUsername) {
      // 无删除用户端点：直接清库外不可行，这里仅统计待清理项
      cleaned += 1;
    }
  }
  const finalAccounts = (await call('GET', '/admin/accounts', undefined, token)).data ?? [];
  for (const a of finalAccounts) {
    if (/^(RG|CSV|UIA|UIB|Q)\w*\d{6,}$/.test(a.code ?? '')) {
      const del = await call('DELETE', `/admin/accounts/${a.id}`, undefined, token);
      if (del.status === 200) cleaned += 1;
    }
  }
  log(`  已清理测试账号；遗留测试用户名 ${finalUsers.filter((u) => /^rgu/.test(u.username ?? '')).length} 个（无删除用户端点，需手工清理或忽略）`);

  log(`\n=========== 结果：PASS ${pass} / FAIL ${fail} ===========`);
})();
