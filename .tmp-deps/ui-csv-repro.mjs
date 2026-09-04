/* 临时 UI 复现脚本：验证「导入用户 CSV / 导入科应账号 CSV」的真实交互链路。用完即删。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///D:/studyspace/scienceing-account-manager/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LOG = [];
function log(...a) {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  LOG.push(line);
  fs.writeFileSync(path.join(ROOT, '.tmp-deps/ui-repro.log'), LOG.join('\n'), 'utf8');
}

const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
const conf = {};
for (const line of env) {
  const i = line.indexOf('=');
  if (i > 0) conf[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = 'http://127.0.0.1:5199';
const API = 'http://127.0.0.1:3000/api';

// ---------- 准备测试用 CSV（UTF-8 带 BOM，模拟「下载模板」产出的格式） ----------
const ts = Date.now();
const usersCsv = '﻿用户名,姓名,部门,角色,密码\n'
  + `uia${ts},测试甲,研发部,USER,Passw0rd!a\n`
  + `uib${ts},测试乙,产品部,USER,Passw0rd!b\n`;
const usersCsvPath = path.join(ROOT, '.tmp-deps/users-import.csv');
fs.writeFileSync(usersCsvPath, usersCsv, 'utf8');

const accountsCsv = '﻿账号编号,科应账号\n'
  + `UIA${String(ts).slice(-6)},uia-${ts}\n`
  + `UIB${String(ts).slice(-6)},uib-${ts}\n`;
const accountsCsvPath = path.join(ROOT, '.tmp-deps/accounts-import.csv');
fs.writeFileSync(accountsCsvPath, accountsCsv, 'utf8');

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e.message}`));

try {
  // ---------- 用 API 登录，注入登录态，跳过登录 UI ----------
  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: conf.ADMIN_INITIAL_PASSWORD }),
  });
  const loginData = await loginRes.json();
  log('[api login] status=', loginRes.status, 'role=', loginData?.user?.role);

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ([token, user]) => {
      localStorage.setItem('scienceing_token', token);
      localStorage.setItem('scienceing_user', JSON.stringify(user));
    },
    [loginData.token, loginData.user],
  );

  // ================= 用例 1：用户管理 → 导入 CSV =================
  log('\n================ 用例1：/admin/users 导入用户 CSV ================');
  await page.goto(BASE + '/admin/users', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const importBtn = page.getByRole('button', { name: '导入CSV' });
  log('导入CSV 按钮数量 =', await importBtn.count(), '可见 =', await importBtn.first().isVisible().catch(() => 'ERR'));

  const dlgCountBefore = await page.locator('[role="dialog"]').count();
  log('点击前 dialog 数 =', dlgCountBefore);

  await importBtn.first().click();
  await page.waitForTimeout(300);
  let dlgCountAfter = await page.locator('[role="dialog"]').count();
  log('点击导入CSV后 dialog 数 =', dlgCountAfter, '(预期 1 = 弹出预览弹窗)');

  // 上传文件
  const fileInput = page.locator('input[type="file"]');
  log('页面 file input 数量 =', await fileInput.count());
  await fileInput.first().setInputFiles(usersCsvPath);
  await page.waitForTimeout(1200);

  dlgCountAfter = await page.locator('[role="dialog"]').count();
  log('上传后 dialog 数 =', dlgCountAfter, '(预期 1 = 预览弹窗已打开)');
  if (dlgCountAfter > 0) {
    const dlgText = await page.locator('[role="dialog"]').first().innerText();
    log('弹窗文本 >>>\n' + dlgText + '\n<<<');
  }
  await page.screenshot({ path: path.join(ROOT, '.tmp-deps/shot-users-import.png'), fullPage: false });

  // 点确认导入
  const confirmBtn = page.locator('[role="dialog"]').getByRole('button', { name: /确认导入/ });
  log('确认导入按钮数 =', await confirmBtn.count());
  if (await confirmBtn.count()) {
    await confirmBtn.first().click();
    await page.waitForTimeout(2000);
    const stillOpen = await page.locator('[role="dialog"]').count();
    log('导入后 dialog 数 =', stillOpen, '(0=已自动关闭；1=仍停留需手动关闭)');
    if (stillOpen > 0) {
      log('导入后弹窗文本 >>>\n' + (await page.locator('[role="dialog"]').first().innerText()) + '\n<<<');
      const again = page.locator('[role="dialog"]').getByRole('button', { name: /确认导入/ });
      log('导入完成后「确认导入」是否仍可点 =', await again.first().isEnabled().catch(() => 'ERR'));
    }
  }

  // ================= 用例 2：科应账号管理 → 导入 CSV =================
  log('\n================ 用例2：/admin/accounts 导入科应账号 CSV ================');
  await page.goto(BASE + '/admin/accounts', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const accImportBtn = page.getByRole('button', { name: '导入 CSV' });
  log('导入CSV 按钮数 =', await accImportBtn.count());
  await accImportBtn.first().click();
  await page.waitForTimeout(400);
  log('弹窗打开后 dialog 数 =', await page.locator('[role="dialog"]').count());

  // 弹窗内的 file input
  const dlgFileInput = page.locator('[role="dialog"] input[type="file"]');
  log('弹窗内 file input 数 =', await dlgFileInput.count());
  await dlgFileInput.first().setInputFiles(accountsCsvPath);
  await page.waitForTimeout(1200);
  log('上传后 dialog 数 =', await page.locator('[role="dialog"]').count());
  if ((await page.locator('[role="dialog"]').count()) > 0) {
    log('弹窗文本 >>>\n' + (await page.locator('[role="dialog"]').first().innerText()) + '\n<<<');
  }
  await page.screenshot({ path: path.join(ROOT, '.tmp-deps/shot-accounts-import.png'), fullPage: false });

  const accConfirm = page.locator('[role="dialog"]').getByRole('button', { name: /^导入 / });
  log('导入按钮数 =', await accConfirm.count());
  if (await accConfirm.count()) {
    await accConfirm.first().click();
    await page.waitForTimeout(2000);
    log('导入后 dialog 数 =', await page.locator('[role="dialog"]').count());
  }

  log('\n================ 控制台错误/警告 ================');
  log(consoleErrors.length ? consoleErrors.join('\n') : '(无)');
} catch (err) {
  log('[FATAL]', err && err.stack ? err.stack : String(err));
  log('\n控制台错误/警告:\n' + consoleErrors.join('\n'));
} finally {
  await browser.close();
}
