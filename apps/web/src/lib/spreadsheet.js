/**
 * 电子表格解析统一入口：兼容 CSV 与 XLSX。
 *
 * 背景（需求：除 CSV 外还需支持 .xlsx）：CSV 走 csv.js 纯文本解析；
 * XLSX 由 vendored SheetJS 解析（src/vendor/xlsx.mjs，官方 CDN 0.20.3 版，
 * 修复了 npm 0.18.5 的 CVE-2023-30533 / CVE-2024-22363）。
 *
 * 为什么 vendor 而非 npm 依赖：SheetJS 官方已从 npm 下架新版本，npm 上仅有含
 * 已知漏洞的 0.18.5；官方 CDN 在本内网实测单次拉取需数分钟且常超时。把官方
 * ESM 完整版（0.20.3，约 1MB）复制进仓库 src/vendor/，clone 即可构建、零网络
 * 依赖、版本固化可审计。升级方法：从 https://cdn.sheetjs.com/ 取新版 xlsx.mjs
 * 覆盖 src/vendor/xlsx.mjs 即可（文件头含 SheetJS License）。
 *
 * 两路最终都归一为「二维字符串矩阵」，交给 csv.js 的 parseUsersRows /
 * parseAccountsRows 做表头映射与行级校验——预览、错误提示与导入行为在两种
 * 格式下完全一致。
 */

import { csvTextToMatrix, parseUsersRows, parseAccountsRows } from './csv'

export { parseUsersRows, parseAccountsRows }

/** 支持的扩展名与 <input accept> 值。.xlsm（启用宏的 xlsx）与旧版 .xls（BIFF）官方库同样支持。 */
export const SPREADSHEET_EXTENSIONS = ['.csv', '.xlsx', '.xlsm', '.xls']
export const SPREADSHEET_ACCEPT =
  '.csv,.xlsx,.xlsm,.xls,text/csv,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'application/vnd.ms-excel'
export const SPREADSHEET_HINT = '支持 .csv / .xlsx 表格，首行需为列名'

const SHEETJS_CHUNK = () => import('@/vendor/xlsx.mjs')

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '')
  return m ? m[1].toLowerCase() : ''
}

/** 判断文件名是否为受支持的表格文件。 */
export function isSpreadsheetFile(name) {
  return SPREADSHEET_EXTENSIONS.includes('.' + extOf(name))
}

/** 判断是否 XLSX 家族（需 SheetJS；.csv 走文本解析）。 */
function isWorkbook(name) {
  return ['.xlsx', '.xlsm', '.xls'].includes('.' + extOf(name))
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('文件读取失败'))
    // xlsx 走 arrayBuffer；csv 按 utf-8 读文本。Excel 另存的 CSV 若是 GBK，utf-8 会乱码——
    // 属已知边界：提示用户另存为 UTF-8 CSV 或改用 xlsx。
    reader.readAsText(file, 'utf-8')
  })
}

/** 读取工作簿首个工作表 → 二维字符串矩阵（SheetJS 懒加载，仅首次选择 xlsx 时下载）。 */
async function workbookToMatrix(file) {
  const XLSX = await SHEETJS_CHUNK()
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const name = wb.SheetNames?.[0]
  if (!name) throw new Error('文件中没有可读取的工作表')
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[name], {
    header: 1, // 输出二维数组，首行为表头
    defval: '', // 空单元格统一补空串
    raw: false, // 取格式化文本：数字 12345 → '12345'，日期 → 显示文本（对齐 CSV 的全字符串语义）
    blankrows: false, // 跳过整行空白
  })
  return matrix
}

/**
 * 读取表格文件 → 二维字符串矩阵（首行为表头行）。
 * 不支持的扩展名抛错，由调用方转为用户提示。
 */
export async function fileToMatrix(file) {
  if (!file) throw new Error('未选择文件')
  if (!isSpreadsheetFile(file.name)) {
    throw new Error(`不支持的文件类型，请选择 ${SPREADSHEET_EXTENSIONS.join(' / ')}`)
  }
  if (isWorkbook(file.name)) return workbookToMatrix(file)
  return csvTextToMatrix(await readAsText(file))
}

/** 解析用户表格文件（CSV / XLSX）→ { rows, headerErrors }。 */
export function parseUsersFile(file) {
  return fileToMatrix(file).then(parseUsersRows)
}

/** 解析科应账号表格文件（CSV / XLSX）→ { rows, headerErrors }。 */
export function parseAccountsFile(file) {
  return fileToMatrix(file).then(parseAccountsRows)
}

/**
 * 生成工作簿二进制（供「下载 xlsx 模板」）。aoa = 二维字符串数组。
 * 与解析共用同一份 vendored SheetJS（懒加载），确保下载的模板一定能被本系统读回。
 */
export async function aoaToWorkbookBytes(aoa, sheetName = 'Sheet1') {
  const XLSX = await SHEETJS_CHUNK()
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}
