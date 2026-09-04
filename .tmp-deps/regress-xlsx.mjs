/* UI 回归：xlsx 导入（用户/账号/缺列/非法）+ xlsx 模板下载。用完即删。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'file:///D:/studyspace/scienceing-account-manager/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = [];
function log(...a) {
  OUT.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  fs.writeFileSync(path.join(ROOT, '.tmp-deps/regress-xlsx.log'), OUT.join('\n'), 'utf8');
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
const fx = JSON.parse(fs.readFileSync(path.join(ROOT, '.tmp-deps/xlsx-fixtures.json'), 'utf8'));

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const consoleErrors = [];
const xlsxChunkRequests = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(`[error] ${m.text()}`);
});
page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e.message}`));
page.on('request', (r) => {
  if (r.url().includes('xlsx-') && r.url().includes('.js')) xlsxChunkRequests.push(r.url());
});

const dlg = () => page.locator('[role="dialog"]');
const dlgText = async () => (await dlg().count()) ? (await dlg().first().innerText()).replace(/\n+/g, ' | ') : '(无弹窗)';

try {
  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: conf.ADMIN_INITIAL_PASSWORD }),
  });
  const loginData = await loginRes.json();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ([t, u]) => {
      localStorage.setItem('scienceing_token', t);
      localStorage.setItem('scienceing_user', JSON.stringify(u));
    },
    [loginData.token, loginData.user],
  );

  // ============ 1. 用户页：正常 xlsx 导入 ============
  log('[1] 用户管理：正常 xlsx 导入');
  await page.goto(BASE + '/admin/users', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('导入按钮文案为「导入表格」', (await page.getByRole('button', { name: '导入表格' }).count()) === 1);
  check('存在 XLSX模板 下载按钮', (await page.getByRole('button', { name: 'XLSX模板' }).count()) === 1);
  await page.locator('input[type="file"]').first().setInputFiles(fx.usersOk);
  await page.waitForTimeout(2500);
  let t = await dlgText();
  log('  预览: ' + t);
  check('xlsx 解析出 2 行可导入', t.includes('2 行可导入') && !t.includes('✓ 可导入') || t.includes('2 行'), t.slice(0, 50));
  check('SheetJS chunk 已按需加载', xlsxChunkRequests.length > 0, xlsxChunkRequests[0] || '(未请求)');
  await dlg().getByRole('button', { name: /确认导入 2 个用户/ }).first().click();
  await page.waitForTimeout(3000);
  check('导入成功后弹窗自动关闭', (await dlg().count()) === 0, `dialog=${await dlg().count()} text=${await dlgText()}`);

  // ============ 2. 用户页：xlsx 缺密码列 ============
  log('\n[2] 用户管理：xlsx 缺少「密码」列');
  await page.locator('input[type="file"]').first().setInputFiles(fx.usersMissing);
  await page.waitForTimeout(2000);
  t = await dlgText();
  log('  预览: ' + t);
  check('缺列提示出现', t.includes('缺少必需列：password'));
  check('行被标红（密码为空）', t.includes('密码为空'));
  const confirmBtn = dlg().getByRole('button', { name: /确认导入/ });
  check('提交按钮禁用', (await confirmBtn.count()) === 0 || (await confirmBtn.first().isDisabled().catch(() => false)), '无按钮或禁用');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ============ 3. 用户页：XLSX 模板下载并可回读 ============
  log('\n[3] 用户页：XLSX 模板下载');
  const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await page.getByRole('button', { name: 'XLSX模板' }).first().click();
  const d = await dl;
  check('XLSX 模板下载触发', d !== null, d?.suggestedFilename() || 'n/a');
  if (d) {
    const fp = path.join(ROOT, '.tmp-deps/dl-users-template.xlsx');
    await d.saveAs(fp);
    const XLSX = require('D:/studyspace/scienceing-account-manager/apps/web/node_modules/xlsx/dist/xlsx.full.min.js');
    const wb = XLSX.read(fs.readFileSync(fp), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    log('  模板回读 =', JSON.stringify(rows));
    check('模板可被本系统解析（表头正确）', rows[0]?.[0] === '用户名' && rows[0]?.[4] === '密码');
  }

  // ============ 4. 账号页：xlsx 正常导入 ============
  log('\n[4] 账号管理：xlsx 正常导入');
  await page.goto(BASE + '/admin/accounts', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: '导入表格' }).first().click();
  await page.waitForTimeout(400);
  await dlg().locator('input[type="file"]').first().setInputFiles(fx.accountsOk);
  await page.waitForTimeout(2000);
  t = await dlgText();
  log('  预览: ' + t);
  check('账号 xlsx 解析出可导入行', t.includes('可导入 2 条'), t.slice(0, 60));
  await dlg().getByRole('button', { name: /^导入 2 条$/ }).first().click();
  await page.waitForTimeout(3000);
  check('账号导入后弹窗关闭', (await dlg().count()) === 0, `dialog=${await dlg().count()}`);
  const listText = await page.locator('tbody').first().innerText();
  const ts = fx.ts;
  check('新导入账号出现在列表且带「待改密」', listText.includes(`XA${String(ts).slice(-6)}1`) && listText.includes('待改密'));

  // ============ 5. 账号页：xlsx 非法编号 ============
  log('\n[5] 账号管理：xlsx 非法编号');
  await page.getByRole('button', { name: '导入表格' }).first().click();
  await page.waitForTimeout(400);
  await dlg().locator('input[type="file"]').first().setInputFiles(fx.accountsBad);
  await page.waitForTimeout(2000);
  t = await dlgText();
  log('  预览: ' + t);
  check('非法编号被预览拦截', t.includes('账号编号仅允许') && t.includes('可导入 0 条'));
  const accConfirm = dlg().getByRole('button', { name: /^导入 \d+ 条$/ });
  check('无可导入行时提交按钮禁用/不存在', (await accConfirm.count()) === 0 || (await accConfirm.first().isDisabled().catch(() => false)));

  log('\n=========== 控制台错误 ===========');
  log(consoleErrors.length ? consoleErrors.join('\n') : '(无)');
  log(`\n=========== XLSX UI 结果：PASS ${pass} / FAIL ${fail} ===========`);
} catch (err) {
  log('[FATAL]', err && err.stack ? err.stack : String(err));
  log('\n控制台错误:\n' + consoleErrors.join('\n'));
  log(`\n=========== XLSX UI 结果：PASS ${pass} / FAIL ${fail}（异常中断） ===========`);
} finally {
  await browser.close();
}
