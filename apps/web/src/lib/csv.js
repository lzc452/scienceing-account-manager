/**
 * 极简 CSV 解析（RFC 4180 子集）：
 * - 支持双引号包裹字段、字段内逗号、双引号转义（"" → "）；
 * - 兼容 \r\n / \n 换行；
 * - 首行为表头，支持中英文列名（用户名/姓名/部门/角色/密码 或
 *   username/displayName/department/role/password）。
 */

/** 去除 BOM + 按行切分（引号内的换行已在上一步处理，这里简单 split 即可） */
function splitRows(text) {
  return text.replace(/^\uFEFF/, '').split(/\r?\n/)
}

/** 解析单行（含引号字段），返回字段数组；行列数不齐时由调用方兜底 */
function parseLine(line) {
  const fields = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields.map((f) => f.trim())
}

const HEADER_ALIASES = {
  username: ['username', '用户名', '账号', '登录名'],
  displayName: ['displayname', 'display_name', '姓名', '名称', '名字'],
  department: ['department', '部门'],
  role: ['role', '角色'],
  password: ['password', '密码', '初始密码'],
}

/** 表头 → 字段名映射；返回 null 表示无法识别该列 */
function mapHeader(cell) {
  const key = String(cell ?? '').trim().toLowerCase()
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(key)) return field
  }
  return null
}

const VALID_ROLES = new Set(['USER', 'ADMIN'])

/**
 * 解析用户 CSV 文本。
 * 返回 { rows: [{ index, username, displayName, department, role, password, errors: [] }], headerErrors: [] }
 * rows 中每行带 errors（空数组 = 合法行），供预览弹窗标记问题行。
 */
export function parseUsersCsv(text) {
  const lines = splitRows(text).filter((line, i, arr) => line.trim() !== '' || i < arr.length - 1)
  if (lines.length === 0) return { rows: [], headerErrors: ['文件为空'] }

  const headers = parseLine(lines[0]).map(mapHeader)
  const headerErrors = []
  for (const required of ['username', 'displayName', 'password']) {
    if (!headers.includes(required)) {
      headerErrors.push(`缺少必需列：${HEADER_ALIASES[required][0]}`)
    }
  }

  const rows = []
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseLine(lines[i])
    const record = { username: '', displayName: '', department: '', role: 'USER', password: '' }
    headers.forEach((field, col) => {
      if (field && cells[col] !== undefined) record[field] = cells[col]
    })

    const errors = []
    if (headerErrors.length === 0) {
      if (!record.username) errors.push('用户名为空')
      if (!record.displayName) errors.push('姓名为空')
      if (!record.password) errors.push('密码为空')
      const role = (record.role || 'USER').toUpperCase()
      if (!VALID_ROLES.has(role)) errors.push(`角色必须是 USER 或 ADMIN（当前「${record.role}」）`)
    }

    rows.push({
      index: i,
      username: record.username,
      displayName: record.displayName,
      department: record.department || '',
      role: (record.role || 'USER').toUpperCase(),
      password: record.password,
      errors,
    })
  }

  // 批内用户名重复：第二次及以后出现的行标记为不可导入（首个仍可导入）
  const seen = new Set()
  for (const row of rows) {
    if (!row.username) continue
    if (seen.has(row.username)) {
      row.errors.push('批内用户名重复')
    } else {
      seen.add(row.username)
    }
  }

  return { rows, headerErrors }
}

/**
 * 生成示例 CSV（供「下载模板」使用）。
 */
export function usersCsvTemplate() {
  return ['用户名,姓名,部门,角色,密码', 'zhangsan,张三,研发部,USER,初始密码123', 'lisi,李四,产品部,USER,初始密码456'].join('\r\n')
}

// ---------------------------------------------------------------------------
// 科应账号 CSV（新增 / 导入）：仅需 账号编号(code) + 科应账号(username)。
// 密码由系统以占位密文托管，管理员后续经「重置密码」流程生成真实密码。
// ---------------------------------------------------------------------------

const ACCOUNT_HEADER_ALIASES = {
  code: ['code', '账号编号', '编号', '账号码', '账号'],
  username: ['username', '科应账号', '账号名', '登录名', '名称'],
}

function mapAccountHeader(cell) {
  const key = String(cell ?? '').trim().toLowerCase()
  for (const [field, aliases] of Object.entries(ACCOUNT_HEADER_ALIASES)) {
    if (aliases.includes(key)) return field
  }
  return null
}

/**
 * 解析科应账号 CSV 文本。
 * 返回 { rows: [{ index, code, username, errors: [] }], headerErrors: [] }
 * 必需列：code、username。批内 code 重复的行标记为不可导入。
 */
export function parseAccountsCsv(text) {
  const lines = splitRows(text).filter((line, i, arr) => line.trim() !== '' || i < arr.length - 1)
  if (lines.length === 0) return { rows: [], headerErrors: ['文件为空'] }

  const headers = parseLine(lines[0]).map(mapAccountHeader)
  const headerErrors = []
  for (const required of ['code', 'username']) {
    if (!headers.includes(required)) {
      headerErrors.push(`缺少必需列：${ACCOUNT_HEADER_ALIASES[required][0]}`)
    }
  }

  const rows = []
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseLine(lines[i])
    const record = { code: '', username: '' }
    headers.forEach((field, col) => {
      if (field && cells[col] !== undefined) record[field] = cells[col]
    })

    const errors = []
    if (headerErrors.length === 0) {
      if (!record.code) errors.push('账号编号为空')
      if (!record.username) errors.push('科应账号为空')
    }

    rows.push({ index: i, code: record.code, username: record.username, errors })
  }

  // 批内 code 重复：第二次及以后出现的行标记为不可导入
  const seen = new Set()
  for (const row of rows) {
    if (!row.code) continue
    if (seen.has(row.code)) {
      row.errors.push('批内账号编号重复')
    } else {
      seen.add(row.code)
    }
  }

  return { rows, headerErrors }
}

/** 生成账号导入示例 CSV（供「下载模板」使用）。 */
export function accountsCsvTemplate() {
  return ['账号编号,科应账号', 'KY-11,ky-11', 'KY-12,ky-12'].join('\r\n')
}
