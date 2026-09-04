/* UI 回归：CSV 导入闭环 + 重置密码二次验证。用完即删。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///D:/studyspace/scienceing-account-manager/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = [];
function log(...a) {
  OUT.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  fs.writeFileSync(path.join(ROOT, '.tmp-deps/regress-ui.log'), OUT.join('\n'), 'utf8');
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
const missingCol = writeCsv('rg-missing.csv', `用户名,姓名\r\nm${ts}a,甲\r\n`);
const goodCsv = writeCsv('rg-good.csv', `用户名,姓名,部门,角色,密码\r\ng${ts}a,甲,QA,USER,Passw0rd!1\r\ng${ts}b,乙,QA,USER,Passw0rd!2\r\n`);
const partialCsv = writeCsv('rg-partial.csv', `用户名,姓名,部门,角色,密码\r\np${ts}a,甲,QA,USER,Passw0rd!1\r\n,BAD_ROW,,SUPERUSER,\r\n`);
const badCodeCsv = writeCsv('rg-badcode.csv', `账号编号,科应账号\r\nBAD CODE!,x${ts}\r\n`);
const goodAccCsv = writeCsv('rg-acc.csv', `账号编号,科应账号\r\nZ${String(ts).slice(-6)}A,za-${ts}\r\n`);

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(`[error] ${m.text()}`);
});
page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e.message}`));

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

  // ============ 1. 缺列 CSV：必须标红且禁止提交 ============
  log('[1] 用户 CSV 缺少「密码」列');
  await page.goto(BASE + '/admin/users', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('input[type="file"]').first().setInputFiles(missingCol);
  await page.waitForTimeout(900);
  let txt = await dlgText();
  log('  弹窗: ' + txt);
  check('缺列时行被标红（不再显示「✓ 可导入」）', txt.includes('密码为空') && !txt.includes('✓ 可导入'));
  const confirmBtn = dlg().getByRole('button', { name: /确认导入/ });
  const disabled = await confirmBtn.first().isDisabled().catch(() => null);
  check('缺列时「确认导入」按钮禁用', disabled === true, `disabled=${disabled}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ============ 2. 正常 CSV：导入成功后自动关闭 + 不可重复提交 ============
  log('\n[2] 用户 CSV 正常导入');
  await page.goto(BASE + '/admin/users', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('input[type="file"]').first().setInputFiles(goodCsv);
  await page.waitForTimeout(900);
  check('正常 CSV 解析为可导入', (await dlgText()).includes('2 行可导入'));
  await dlg().getByRole('button', { name: /确认导入 2 个用户/ }).first().click();
  await page.waitForTimeout(2500);
  check('全部成功后弹窗自动关闭', (await dlg().count()) === 0, `dialog=${await dlg().count()}`);

  // ============ 3. 部分失败：保留弹窗 + 展示行级原因 + 禁止重复提交 ============
  log('\n[3] 用户 CSV 部分行非法');
  await page.goto(BASE + '/admin/users', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('input[type="file"]').first().setInputFiles(partialCsv);
  await page.waitForTimeout(900);
  txt = await dlgText();
  log('  导入前: ' + txt);
  check('非法行在预览阶段即被标红', txt.includes('角色必须是 USER 或 ADMIN') || txt.includes('用户名为空'));
  check('仅合法行计入可导入数', txt.includes('1 行可导入'), txt.slice(0, 60));
  await dlg().getByRole('button', { name: /确认导入 1 个用户/ }).first().click();
  await page.waitForTimeout(2500);
  txt = await dlgText();
  log('  导入后: ' + txt);
  const stillSubmit = await dlg().getByRole('button', { name: /确认导入/ }).count();
  check('出结果后提交按钮不再存在（杜绝重复提交）', stillSubmit === 0, `按钮数=${stillSubmit}`);
  check('成功行显示「✓ 已导入」', txt.includes('✓ 已导入'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ============ 4. 重置用户密码：两段式管理员验证 ============
  log('\n[4] 重置用户密码：管理员二次验证');
  await page.goto(BASE + '/admin/users', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  // 找一个非自己的用户（避开 admin 自身）
  const rows = page.locator('tbody tr');
  const count = await rows.count();
  let targetRow = null;
  for (let i = 0; i < count; i += 1) {
    const name = (await rows.nth(i).locator('td').first().innerText()).trim();
    if (name && name !== 'admin') {
      targetRow = rows.nth(i);
      log(`  目标用户: ${name}`);
      break;
    }
  }
  check('找到非自身测试用户', targetRow !== null);
  if (targetRow) {
    await targetRow.getByRole('button', { name: '重置密码' }).click();
    await page.waitForTimeout(500);
    let t = await dlgText();
    log('  第 1 步弹窗: ' + t);
    check('先弹出安全验证（要求当前管理员密码）', t.includes('安全验证') || t.includes('管理员密码'));

    // 4.1 错误密码
    await dlg().locator('input[type="password"]').first().fill('wrong-password');
    await dlg().getByRole('button', { name: /下一步|验证|确认/ }).first().click();
    await page.waitForTimeout(1800);
    t = await dlgText();
    log('  错误密码后: ' + t);
    check('错误密码给出明确错误提示', t.includes('不正确') || t.includes('失败'));
    check('错误密码不进入第二步', !t.includes('新密码'));

    // 4.2 正确密码
    await dlg().locator('input[type="password"]').first().fill(conf.ADMIN_INITIAL_PASSWORD);
    await dlg().getByRole('button', { name: /下一步|验证|确认/ }).first().click();
    await page.waitForTimeout(1800);
    t = await dlgText();
    log('  正确密码后: ' + t);
    check('正确密码后进入设置新密码步骤', t.includes('新密码'));

    // 4.3 弱密码
    await dlg().locator('input[type="password"]').first().fill('123');
    await dlg().getByRole('button', { name: /确认|保存|重置/ }).first().click();
    await page.waitForTimeout(1500);
    t = await dlgText();
    log('  弱密码提交后: ' + t);
    check('弱密码被拦截（仍在弹窗内）', (await dlg().count()) === 1, t.slice(0, 80));

    // 4.4 合法新密码
    const newPwd = 'ResetPass!2026';
    await dlg().locator('input[type="password"]').first().fill(newPwd);
    await dlg().getByRole('button', { name: /确认|保存|重置/ }).first().click();
    await page.waitForTimeout(2500);
    check('重置成功后弹窗关闭', (await dlg().count()) === 0, `dialog=${await dlg().count()} text=${await dlgText()}`);

    // 4.5 用新密码登录验证
    const targetName = (await targetRow.locator('td').first().innerText()).trim();
    const relogin = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: targetName, password: newPwd }),
    });
    check(`用户 ${targetName} 可用新密码登录`, relogin.status === 200, `status=${relogin.status}`);
  }

  // ============ 5. 科应账号：待改密标记 ============
  log('\n[5] 科应账号导入与待改密标记');
  await page.goto(BASE + '/admin/accounts', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: '导入 CSV' }).first().click();
  await page.waitForTimeout(400);
  await dlg().locator('input[type="file"]').first().setInputFiles(badCodeCsv);
  await page.waitForTimeout(900);
  let t = await dlgText();
  log('  非法编号: ' + t);
  check('非法账号编号在预览阶段被拦截', t.includes('账号编号仅允许') && t.includes('可导入 0 条'));

  await dlg().locator('input[type="file"]').first().setInputFiles(goodAccCsv);
  await page.waitForTimeout(900);
  t = await dlgText();
  check('合法账号可导入', t.includes('可导入 1 条'), t.slice(0, 60));
  await dlg().getByRole('button', { name: /^导入 1 条$/ }).first().click();
  await page.waitForTimeout(2500);
  check('导入成功后弹窗关闭', (await dlg().count()) === 0, `dialog=${await dlg().count()}`);

  const listText = await page.locator('tbody').first().innerText();
  check('列表中显示「待改密」标记', listText.includes('待改密'), listText.split('\n').filter((l) => l.includes('待改密')).slice(0, 2).join(' / '));

  log('\n=========== 控制台错误 ===========');
  log(consoleErrors.length ? consoleErrors.join('\n') : '(无)');
  log(`\n=========== UI 结果：PASS ${pass} / FAIL ${fail} ===========`);
} catch (err) {
  log('[FATAL]', err && err.stack ? err.stack : String(err));
  log('\n控制台错误:\n' + consoleErrors.join('\n'));
  log(`\n=========== UI 结果：PASS ${pass} / FAIL ${fail}（异常中断） ===========`);
} finally {
  await browser.close();
}
