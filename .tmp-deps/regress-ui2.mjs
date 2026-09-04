/* UI 回归补充：后端拒绝场景下的导入结果视图 + 401 来源定位。用完即删。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///D:/studyspace/scienceing-account-manager/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = [];
function log(...a) {
  OUT.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  fs.writeFileSync(path.join(ROOT, '.tmp-deps/regress-ui2.log'), OUT.join('\n'), 'utf8');
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

const BASE = 'http://127.0.0.1:5199';
const API = 'http://127.0.0.1:3000/api';
const ts = Date.now();

function writeCsv(name, text) {
  const p = path.join(ROOT, '.tmp-deps', name);
  fs.writeFileSync(p, '\uFEFF' + text, 'utf8');
  return p;
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const http401 = [];
page.on('response', (r) => {
  if (r.status() === 401) http401.push(`${r.request().method()} ${r.url()}`);
});

try {
  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: conf.ADMIN_INITIAL_PASSWORD }),
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ([t, u]) => {
      localStorage.setItem('scienceing_token', t);
      localStorage.setItem('scienceing_user', JSON.stringify(u));
    },
    [token, loginData.user],
  );

  const dlg = () => page.locator('[role="dialog"]');
  const dlgText = async () => (await dlg().count()) ? (await dlg().first().innerText()).replace(/\n+/g, ' | ') : '(无弹窗)';

  // 先造一个已存在的用户，再导入同名行 —— 制造「前端合法、后端拒绝」场景
  const existing = `dup${ts}`;
  await fetch(`${API}/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ username: existing, displayName: '已存在用户', role: 'USER', password: 'Passw0rd!1' }),
  });

  log('[3b] 前端合法但后端拒绝（用户名已存在）');
  const dupCsv = writeCsv(
    'rg-dup.csv',
    `用户名,姓名,部门,角色,密码\r\n${existing},重复用户,QA,USER,Passw0rd!1\r\nok${ts},新用户,QA,USER,Passw0rd!1\r\n`,
  );
  await page.goto(BASE + '/admin/users', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('input[type="file"]').first().setInputFiles(dupCsv);
  await page.waitForTimeout(900);
  log('  导入前: ' + (await dlgText()));
  await dlg().getByRole('button', { name: /确认导入 2 个用户/ }).first().click();
  await page.waitForTimeout(2500);
  const t = await dlgText();
  log('  导入后: ' + t);
  check('部分失败时保留弹窗展示结果', (await dlg().count()) === 1);
  check('成功行显示「✓ 已导入」', t.includes('✓ 已导入'));
  check('失败行显示后端原因', t.includes('用户名已存在'));
  check('失败后不再提供提交按钮（不可重复提交）', (await dlg().getByRole('button', { name: /确认导入/ }).count()) === 0);
  await page.screenshot({ path: path.join(ROOT, '.tmp-deps/shot-partial-fail.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 全失败场景
  log('\n[3c] 全部失败（两条都与库内冲突）');
  const allDupCsv = writeCsv('rg-alldup.csv', `用户名,姓名,部门,角色,密码\r\n${existing},重复用户,QA,USER,Passw0rd!1\r\nadmin,管理员,QA,USER,Passw0rd!1\r\n`);
  await page.goto(BASE + '/admin/users', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('input[type="file"]').first().setInputFiles(allDupCsv);
  await page.waitForTimeout(900);
  await dlg().getByRole('button', { name: /确认导入 2 个用户/ }).first().click();
  await page.waitForTimeout(2500);
  const t2 = await dlgText();
  log('  导入后: ' + t2);
  check('全失败时保留弹窗并标红每一行', (await dlg().count()) === 1 && t2.includes('用户名已存在'));

  log('\n=========== 401 请求明细 ===========');
  log(http401.length ? http401.join('\n') : '(无 401)');
  log(`\n=========== 结果：PASS ${pass} / FAIL ${fail} ===========`);
} catch (err) {
  log('[FATAL]', err && err.stack ? err.stack : String(err));
  log('\n401:\n' + http401.join('\n'));
  log(`\n=========== 结果：PASS ${pass} / FAIL ${fail}（异常中断） ===========`);
} finally {
  await browser.close();
}
