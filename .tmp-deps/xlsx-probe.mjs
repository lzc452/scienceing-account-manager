/* 验证：用 full 版生成 xlsx，再用 mini 版读取（模拟管理员 Excel 导入）。 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const OUT = [];
function log(...a) {
  OUT.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x, null, 1))).join(' '));
  fs.writeFileSync(path.resolve(process.cwd(), '.tmp-deps/xlsx-probe.log'), OUT.join('\n'), 'utf8');
}

const FULL = 'D:/studyspace/scienceing-account-manager/apps/web/node_modules/xlsx/dist/xlsx.full.min.js';
const MINI = 'D:/studyspace/scienceing-account-manager/apps/web/node_modules/xlsx/dist/xlsx.mini.min.js';
const MJS = 'D:/studyspace/scienceing-account-manager/apps/web/node_modules/xlsx/xlsx.mjs';

const XLSXFull = require(FULL);
const XLSXMini = require(MINI);

log('full version =', XLSXFull.version);
log('mini version =', XLSXMini.version);

// ---------- 生成测试工作簿（覆盖常见表格形态） ----------
const aoa = [
  ['用户名', '姓名', '部门', '角色', '密码'],
  ['zhangsan', '张三', '研发部', 'USER', 'Passw0rd!1'],
  ['lisi', '李四', '产品部', 'USER', 'Passw0rd!2'],
];
const ws = XLSXFull.utils.aoa_to_sheet(aoa);
const wb = XLSXFull.utils.book_new();
XLSXFull.utils.book_append_sheet(wb, ws, 'Sheet1');
const buf = XLSXFull.write(wb, { type: 'buffer', bookType: 'xlsx' });
fs.writeFileSync(path.resolve(process.cwd(), '.tmp-deps/probe-users.xlsx'), buf);
log('\n生成测试文件 probe-users.xlsx，大小 =', buf.length, 'bytes');

// ---------- mini 版读取（浏览器端将用它） ----------
const wb2 = XLSXMini.read(buf, { type: 'buffer' });
log('\nmini 读取 SheetNames =', JSON.stringify(wb2.SheetNames));
const rows = XLSXMini.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { header: 1, defval: '', raw: false });
log('mini sheet_to_json(header:1, raw:false) =', JSON.stringify(rows));

// 空单元格 / 缺列场景
const aoa2 = [
  ['用户名', '姓名'],
  ['wangwu', ''],
  ['', '赵六'],
];
const ws2 = XLSXFull.utils.aoa_to_sheet(aoa2);
const wb3 = XLSXFull.utils.book_new();
XLSXFull.utils.book_append_sheet(wb3, ws2, 'Sheet1');
const buf2 = XLSXFull.write(wb3, { type: 'buffer', bookType: 'xlsx' });
const wb4 = XLSXMini.read(buf2, { type: 'buffer' });
const rows2 = XLSXMini.utils.sheet_to_json(wb4.Sheets[wb4.SheetNames[0]], { header: 1, defval: '', raw: false });
log('\n空单元格场景 =', JSON.stringify(rows2));

// 数字单元格（raw:false 应转字符串）
const aoa3 = [['账号编号', '科应账号'], ['KY-01', 12345], ['KY-02', 'ky-02']];
const ws3 = XLSXFull.utils.aoa_to_sheet(aoa3);
const wb5 = XLSXFull.utils.book_new();
XLSXFull.utils.book_append_sheet(wb5, ws3, 'Sheet1');
const buf3 = XLSXFull.write(wb5, { type: 'buffer', bookType: 'xlsx' });
const wb6 = XLSXMini.read(buf3, { type: 'buffer' });
const rows3 = XLSXMini.utils.sheet_to_json(wb6.Sheets[wb6.SheetNames[0]], { header: 1, defval: '', raw: false });
log('数字单元格(raw:false) =', JSON.stringify(rows3));

// ---------- ESM 入口是否可直接 import（vite 场景） ----------
try {
  const mod = await import('file:///D:/studyspace/scienceing-account-manager/apps/web/node_modules/xlsx/xlsx.mjs');
  log('\nESM(xlsx.mjs) import OK, version =', mod.version, '| has read =', typeof mod.read, '| has utils =', typeof mod.utils);
} catch (e) {
  log('\nESM import FAILED:', e.message);
}

log('\n文件大小：full=', fs.statSync(FULL).size, ' mini=', fs.statSync(MINI).size, ' mjs=', fs.statSync(MJS).size);
