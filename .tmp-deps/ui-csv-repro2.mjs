/* 临时 UI 复现脚本（第二轮）：编码兼容 / 模板下载 / 重复提交 / 真实入库。用完即删。 */
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
  fs.writeFileSync(path.join(ROOT, '.tmp-deps/ui-repro2.log'), LOG.join('\n'), 'utf8');
}

const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
const conf = {};
for (const line of env) {
  const i = line.indexOf('=');
  if (i > 0) conf[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = 'http://127.0.0.1:5199';
const API = 'http://127.0.0.1:3000/api';
const ts = Date.now();

// ---------- 构造各种编码的 CSV ----------
function write(name, buf) {
  const p = path.join(ROOT, '.tmp-deps', name);
  fs.writeFileSync(p, buf);
  return p;
}
// 1) GBK（Windows Excel「另存为 CSV」默认 ANSI/GBK）
const gbkHeader = Buffer.from('用户名,姓名,部门,角色,密码\r\n', 'latin1');
// 用 iconv 不可用，直接构造 GBK 字节：借助 Buffer + 手动映射不可行，改用 TextEncoder 替代方案：
//   退而求其次，用「UTF-8 无 BOM」与「UTF-16 LE 带 BOM」两种常见 Excel 导出格式，
//   并以 latin1 写入一段模拟乱码来覆盖「编码不匹配」分支。
const utf8NoBom = Buffer.from(
  `用户名,姓名,部门,角色,密码\r\ng${ts}a,甲,研发部,USER,Passw0rd!1\r\n`,
  'utf8',
);
const pUtf8NoBom = write('users-utf8-nobom.csv', utf8NoBom);

// UTF-16LE 带 BOM（Excel「另存为 Unicode 文本/CSV UTF-16」产物）
const pUtf16 = write('users-utf16.csv', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`用户名,姓名,部门,角色,密码\r\nh${ts}a,乙,研发部,USER,Passw0rd!1\r\n`, 'utf16le')]));

// 列头为中文同义但顺序不同 + 多余列
const pMixed = write(
  'users-mixed.csv',
  Buffer.from(`\uFEFF姓名,密码,用户名,部门,角色,备注\r\ni${ts}a,Passw0rd!1,丙,研发部,USER,hello\r\n`, 'utf8'),
);

// 缺列
const pMissing = write('users-missing.csv', Buffer.from(`\uFEFF用户名,姓名\r\nj${ts}a,丁\r\n`, 'utf8'));

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[${m.type()}] ${m.text()}`);
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

  // ================= A. 模板下载是否可用 =================
  log('================ A. 「下载模板」按钮 ================');
  await page.goto(BASE + '/admin/users', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const dl1 = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.getByRole('button', { name: '下载模板' }).first().click();
  const d1 = await dl1;
  log('用户模板下载事件 =', d1 ? `OK (${d1.suggestedFilename()})` : '未触发 ✗');
  if (d1) {
    const fp = path.join(ROOT, '.tmp-deps/dl-users-template.csv');
    await d1.saveAs(fp);
    log('模板内容 =', JSON.stringify(fs.readFileSync(fp, 'utf8')));
  }

  await page.goto(BASE + '/admin/accounts', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: '导入 CSV' }).first().click();
  await page.waitForTimeout(400);
  const dl2 = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.getByRole('button', { name: '下载模板' }).first().click();
  const d2 = await dl2;
  log('账号模板下载事件 =', d2 ? `OK (${d2.suggestedFilename()})` : '未触发 ✗');
  if (d2) {
    const fp = path.join(ROOT, '.tmp-deps/dl-accounts-template.csv');
    await d2.saveAs(fp);
    log('模板内容 =', JSON.stringify(fs.readFileSync(fp, 'utf8')));
  }
  await page.keyboard.press('Escape');

  // ================= B. 各种 CSV 编码/格式的解析结果 =================
  log('\n================ B. CSV 编码 / 格式兼容性（用户导入） ================');
  const cases = [
    ['UTF-8 无 BOM（正常）', pUtf8NoBom],
    ['UTF-16LE 带 BOM（Excel 常见）', pUtf16],
    ['列序不同 + 多余列', pMixed],
    ['缺少必需列', pMissing],
  ];
  for (const [label, file] of cases) {
    await page.goto(BASE + '/admin/users', { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.locator('input[type="file"]').first().setInputFiles(file);
    await page.waitForTimeout(900);
    const n = await page.locator('[role="dialog"]').count();
    if (n === 0) {
      log(`[${label}] 结果：未弹出预览（无提示/静默失败）✗`);
    } else {
      const txt = (await page.locator('[role="dialog"]').first().innerText()).replace(/\n+/g, ' | ');
      log(`[${label}] 结果：${txt}`);
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }

  // ================= C. 用户导入：连续两次点击「确认导入」 =================
  log('\n================ C. 用户导入：重复提交 ================');
  await page.goto(BASE + '/admin/users', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.locator('input[type="file"]').first().setInputFiles(pUtf8NoBom);
  await page.waitForTimeout(900);
  const btn = page.locator('[role="dialog"]').getByRole('button', { name: /确认导入/ });
  await btn.first().click();
  await page.waitForTimeout(1500);
  log('第 1 次点击后弹窗文本 =', (await page.locator('[role="dialog"]').first().innerText()).replace(/\n+/g, ' | '));
  const stillEnabled = await page.locator('[role="dialog"]').getByRole('button', { name: /确认导入/ }).first().isEnabled();
  log('第 1 次点击后按钮仍可点 =', stillEnabled);
  if (stillEnabled) {
    await page.locator('[role="dialog"]').getByRole('button', { name: /确认导入/ }).first().click();
    await page.waitForTimeout(1500);
    log('第 2 次点击后弹窗文本 =', (await page.locator('[role="dialog"]').first().innerText()).replace(/\n+/g, ' | '));
  }
  await page.keyboard.press('Escape');

  // ================= D. 账号导入后是否真的入库 + 是否可用 =================
  log('\n================ D. 账号导入后数据状态 ================');
  const codeA = `Q${String(ts).slice(-7)}A`;
  const codeB = `Q${String(ts).slice(-7)}B`;
  const accCsv = write('accounts-d.csv', Buffer.from(`\uFEFF账号编号,科应账号\r\n${codeA},qa-${ts}\r\n${codeB},qb-${ts}\r\n`, 'utf8'));
  await page.goto(BASE + '/admin/accounts', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: '导入 CSV' }).first().click();
  await page.waitForTimeout(400);
  await page.locator('[role="dialog"] input[type="file"]').first().setInputFiles(accCsv);
  await page.waitForTimeout(900);
  await page.locator('[role="dialog"]').getByRole('button', { name: /^导入 / }).first().click();
  await page.waitForTimeout(2000);
  log('导入后 dialog 数 =', await page.locator('[role="dialog"]').count());

  const res = await fetch(`${API}/admin/accounts`, { headers: { Authorization: `Bearer ${token}` } });
  const all = await res.json();
  const imported = all.filter((a) => a.code === codeA || a.code === codeB);
  log('导入账号入库情况 =', JSON.stringify(imported.map((a) => ({ code: a.code, username: a.username, status: a.status, enabled: a.enabled }))));

  log('\n================ 控制台错误/警告 ================');
  log(consoleErrors.length ? consoleErrors.join('\n') : '(无)');
} catch (err) {
  log('[FATAL]', err && err.stack ? err.stack : String(err));
  log('\n控制台错误/警告:\n' + consoleErrors.join('\n'));
} finally {
  await browser.close();
}
