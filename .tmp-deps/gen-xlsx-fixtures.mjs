/* 生成 xlsx 回归测试文件（用户/账号/缺列/数字/公式单元格）。用完即删。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('D:/studyspace/scienceing-account-manager/apps/web/node_modules/xlsx/dist/xlsx.full.min.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, '.tmp-deps');
const ts = Date.now();

function save(name, aoa, sheetName = 'Sheet1') {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const p = path.join(OUT_DIR, name);
  fs.writeFileSync(p, buf);
  return p;
}

// 1) 用户导入（正常）
const usersAoa = [
  ['用户名', '姓名', '部门', '角色', '密码'],
  [`xu1_${ts}`, '甲一', '研发部', 'USER', 'Passw0rd!a'],
  [`xu2_${ts}`, '乙二', '产品部', 'USER', 'Passw0rd!b'],
];
// 2) 用户缺列（无密码列）
const usersMissingAoa = [
  ['用户名', '姓名', '部门'],
  [`xm1_${ts}`, '缺密码', 'QA'],
];
// 3) 账号导入（正常 + 数字格式账号编号（应为文本列名）+ 尾随空格）
const accountsAoa = [
  ['账号编号', '科应账号'],
  [`XA${String(ts).slice(-6)}1`, `xa1-${ts}`],
  [`XA${String(ts).slice(-6)}2`, 'xa2'],
];
// 4) 账号非法编号 + 空行（Excel 常见多余空行）
const accountsBadAoa = [
  ['账号编号', '科应账号'],
  ['BAD CODE!', 'xb1'],
  ['', ''],
];

const files = {
  usersOk: save('t-users-ok.xlsx', usersAoa, '用户'),
  usersMissing: save('t-users-missing.xlsx', usersMissingAoa),
  accountsOk: save('t-accounts-ok.xlsx', accountsAoa, '账号'),
  accountsBad: save('t-accounts-bad.xlsx', accountsBadAoa),
};
fs.writeFileSync(
  path.join(OUT_DIR, 'xlsx-fixtures.json'),
  JSON.stringify({ ...files, ts }, null, 2),
  'utf8',
);
console.log('fixtures written:', Object.values(files).join('\n'));
