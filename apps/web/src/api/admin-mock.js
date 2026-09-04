import { reactive } from 'vue'
import { ACTION_LABELS } from '@/lib/audit-labels'

/**
 * 管理后台内存 mock 后端（t8）。真实联调时由 admin.js 切到 fetch。
 * 响应形状对齐 apps/server 各 admin 控制器。
 */
const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

function delay(ms = 250) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function ago(ms) {
  return new Date(Date.now() - ms).toISOString()
}

function httpError(message, status) {
  const err = new Error(message)
  err.status = status
  return err
}

const state = reactive({
  users: [
    { id: 1, username: 'admin', displayName: '管理员', department: 'IT', role: 'ADMIN', enabled: true, createdAt: ago(30 * DAY), updatedAt: ago(2 * DAY) },
    { id: 2, username: 'zhangsan', displayName: '张三', department: '研发部', role: 'USER', enabled: true, createdAt: ago(20 * DAY), updatedAt: ago(5 * DAY) },
    { id: 3, username: 'lisi', displayName: '李四', department: '产品部', role: 'USER', enabled: false, createdAt: ago(15 * DAY), updatedAt: ago(3 * DAY) },
    { id: 4, username: 'wangwu', displayName: '王五', department: 'IT', role: 'USER', enabled: true, createdAt: ago(10 * DAY), updatedAt: ago(1 * DAY) },
  ],
  accounts: [
    { id: 1, code: 'KY-01', username: 'ky-01', status: 'AVAILABLE', currentUser: null, lastPasswordChangedAt: ago(7 * DAY), enabled: true, createdAt: ago(30 * DAY) },
    { id: 2, code: 'KY-02', username: 'ky-02', status: 'IN_USE', currentUser: '张三', lastPasswordChangedAt: ago(5 * DAY), enabled: true, createdAt: ago(30 * DAY) },
    { id: 3, code: 'KY-03', username: 'ky-03', status: 'IN_USE', currentUser: '李四', lastPasswordChangedAt: ago(4 * DAY), enabled: true, createdAt: ago(30 * DAY) },
    { id: 4, code: 'KY-04', username: 'ky-04', status: 'RECYCLING', currentUser: null, lastPasswordChangedAt: ago(2 * DAY), enabled: true, createdAt: ago(30 * DAY) },
    { id: 5, code: 'KY-05', username: 'ky-05', status: 'ERROR', currentUser: null, lastPasswordChangedAt: ago(1 * DAY), enabled: true, createdAt: ago(30 * DAY) },
    { id: 6, code: 'KY-06', username: 'ky-06', status: 'AVAILABLE', currentUser: null, lastPasswordChangedAt: ago(7 * DAY), enabled: true, createdAt: ago(30 * DAY) },
    { id: 7, code: 'KY-07', username: 'ky-07', status: 'AVAILABLE', currentUser: null, lastPasswordChangedAt: ago(7 * DAY), enabled: true, createdAt: ago(30 * DAY) },
    { id: 8, code: 'KY-08', username: 'ky-08', status: 'AVAILABLE', currentUser: null, lastPasswordChangedAt: ago(7 * DAY), enabled: true, createdAt: ago(30 * DAY) },
    { id: 9, code: 'KY-09', username: 'ky-09', status: 'AVAILABLE', currentUser: null, lastPasswordChangedAt: ago(7 * DAY), enabled: true, createdAt: ago(30 * DAY) },
    { id: 10, code: 'KY-10', username: 'ky-10', status: 'AVAILABLE', currentUser: null, lastPasswordChangedAt: ago(7 * DAY), enabled: true, createdAt: ago(30 * DAY) },
  ],
  leases: [
    { id: 104, userDisplayName: '张三', accountCode: 'KY-02', status: 'ACTIVE', startedAt: ago(HOUR), lastActivityAt: ago(3 * MIN), releasedAt: null, releaseReason: null },
    { id: 103, userDisplayName: '王五', accountCode: 'KY-01', status: 'RELEASED', startedAt: ago(DAY), lastActivityAt: ago(DAY - 2 * HOUR), releasedAt: ago(DAY - 2 * HOUR + MIN), releaseReason: 'USER_RETURN' },
    { id: 102, userDisplayName: '李四', accountCode: 'KY-03', status: 'RELEASED', startedAt: ago(2 * DAY), lastActivityAt: ago(2 * DAY - 30 * MIN), releasedAt: ago(2 * DAY - 30 * MIN), releaseReason: 'INACTIVITY_TIMEOUT' },
    { id: 101, userDisplayName: '张三', accountCode: 'KY-04', status: 'FAILED', startedAt: ago(3 * DAY), lastActivityAt: ago(3 * DAY - 25 * MIN), releasedAt: ago(3 * DAY - 25 * MIN), releaseReason: 'RESET_ERROR' },
    { id: 100, userDisplayName: '李四', accountCode: 'KY-02', status: 'RELEASED', startedAt: ago(4 * DAY), lastActivityAt: ago(4 * DAY - 40 * MIN), releasedAt: ago(4 * DAY - 40 * MIN), releaseReason: 'ADMIN_FORCE' },
  ],
  logs: [
    { id: 12, userId: null, accountId: 5, leaseId: null, action: 'RESET_FAILED', result: 'FAILED', ip: null, userAgent: null, metadata: { accountCode: 'KY-05' }, createdAt: ago(9 * MIN) },
    { id: 11, userId: 1, accountId: 5, leaseId: null, action: 'RESET_PASSWORD', result: 'SUCCESS', ip: '10.2.1.8', userAgent: null, metadata: { accountCode: 'KY-05' }, createdAt: ago(10 * MIN) },
    { id: 10, userId: 2, accountId: 2, leaseId: 104, action: 'CLAIM_ACCOUNT', result: 'SUCCESS', ip: '10.2.1.8', userAgent: null, metadata: { accountCode: 'KY-02' }, createdAt: ago(15 * MIN) },
    { id: 9, userId: 2, accountId: null, leaseId: null, action: 'LOGIN', result: 'SUCCESS', ip: '10.2.1.8', userAgent: null, metadata: null, createdAt: ago(16 * MIN) },
    { id: 8, userId: 2, accountId: 2, leaseId: 104, action: 'ACTIVITY', result: 'SUCCESS', ip: null, userAgent: null, metadata: null, createdAt: ago(20 * MIN) },
    { id: 7, userId: 2, accountId: 2, leaseId: 104, action: 'ACTIVITY', result: 'SUCCESS', ip: null, userAgent: null, metadata: null, createdAt: ago(25 * MIN) },
    { id: 6, userId: 1, accountId: 4, leaseId: null, action: 'ADMIN_FORCE_RELEASE', result: 'SUCCESS', ip: '10.2.1.8', userAgent: null, metadata: { accountCode: 'KY-04' }, createdAt: ago(DAY) },
    { id: 5, userId: 4, accountId: 1, leaseId: 103, action: 'RELEASE', result: 'SUCCESS', ip: '10.2.1.9', userAgent: null, metadata: { reason: 'USER_RETURN' }, createdAt: ago(DAY - HOUR) },
    { id: 4, userId: 4, accountId: 1, leaseId: 103, action: 'CLAIM_ACCOUNT', result: 'SUCCESS', ip: '10.2.1.9', userAgent: null, metadata: { accountCode: 'KY-01' }, createdAt: ago(DAY - 2 * HOUR) },
    { id: 3, userId: 3, accountId: 3, leaseId: 102, action: 'TIMEOUT', result: 'SUCCESS', ip: null, userAgent: null, metadata: { reason: 'INACTIVITY_TIMEOUT' }, createdAt: ago(2 * DAY) },
    { id: 2, userId: 3, accountId: 3, leaseId: 102, action: 'CLAIM_ACCOUNT', result: 'SUCCESS', ip: '10.2.1.10', userAgent: null, metadata: { accountCode: 'KY-03' }, createdAt: ago(2 * DAY - 30 * MIN) },
    { id: 1, userId: 1, accountId: null, leaseId: null, action: 'SETTING_UPDATE', result: 'SUCCESS', ip: '10.2.1.8', userAgent: null, metadata: { keys: ['warning_seconds'] }, createdAt: ago(3 * DAY) },
  ],
  settings: {
    // 无操作超时以「分钟」为单位（与后端 system_settings.inactivity_timeout_minutes 一致）
    inactivity_timeout_minutes: '30',
    warning_seconds: '300',
    critical_warning_seconds: '60',
    activity_throttle_seconds: '5',
    extension_min_version: '1.0.0',
    extension_latest_version: '1.3.0',
  },
  health: {
    lastCheckedAt: ago(5 * MIN),
    items: [
      { key: 'admin-login', label: '管理员登录正常', ok: true },
      { key: 'accounts-page', label: '账号管理页可访问', ok: true },
      { key: 'reset-entry', label: '改密入口正常', ok: true },
    ],
  },
  // 使用手册（t13）：content 初始为空串，首次访问时用 MANUAL_MOCK_CONTENT 兜底
  manual: {
    slug: 'user-guide',
    title: '科应共享账号管理平台 · 使用手册（Mock）',
    content: '',
    updatedAt: '',
    updatedByDisplayName: null,
    isDefault: true,
  },
})

function cloneUsers() {
  return state.users.map((u) => ({ ...u }))
}

async function listAccounts() {
  await delay()
  return state.accounts.map((a) => ({ ...a }))
}

function accountOf(id) {
  const account = state.accounts.find((a) => a.id === Number(id))
  if (!account) throw httpError('账号不存在', 404)
  return account
}

async function forceRelease(id) {
  await delay()
  const account = accountOf(id)
  const lease = state.leases.find((l) => l.accountCode === account.code && l.status === 'ACTIVE')
  if (!lease) return { accountId: account.id, status: account.status, recycled: false }
  lease.status = 'RECYCLING'
  lease.releaseReason = 'ADMIN_FORCE'
  lease.releasedAt = null
  account.status = 'RECYCLING'
  account.currentUser = null
  return { accountId: account.id, status: 'RECYCLING', recycled: true }
}

async function resetPassword(id) {
  await delay()
  const account = accountOf(id)
  if (account.status === 'RECYCLING') throw httpError('账号正在回收中', 409)
  account.status = 'RECYCLING'
  account.currentUser = null
  account.lastPasswordChangedAt = new Date().toISOString()
  return { accountId: account.id, status: 'RECYCLING' }
}

async function markAvailable(id) {
  await delay()
  const account = accountOf(id)
  if (account.status !== 'ERROR') throw httpError('仅 ERROR 账号可标记为可用', 409)
  account.status = 'AVAILABLE'
  return { accountId: account.id, status: 'AVAILABLE' }
}

async function disable(id) {
  await delay()
  const account = accountOf(id)
  account.enabled = false
  const lease = state.leases.find((l) => l.accountCode === account.code && l.status === 'ACTIVE')
  if (lease) {
    lease.status = 'RECYCLING'
    lease.releaseReason = 'ADMIN_FORCE'
    account.status = 'RECYCLING'
  }
  return { accountId: account.id, enabled: false }
}

async function enable(id) {
  await delay()
  const account = accountOf(id)
  account.enabled = true
  return { accountId: account.id, enabled: true }
}

async function renameAccount(id, dto) {
  await delay()
  const account = accountOf(id)
  const username = (dto.username ?? '').trim()
  if (!username) throw httpError('账号名称不能为空', 400)
  if (state.accounts.some((a) => a.id !== account.id && a.username === username)) {
    throw httpError(`账号名称「${username}」已被其他账号使用`, 409)
  }
  account.username = username
  return { ...account }
}

async function createAccount(dto) {
  await delay()
  const code = (dto.code ?? '').trim()
  const username = (dto.username ?? '').trim()
  if (!code) throw httpError('账号编号不能为空', 400)
  if (!username) throw httpError('科应账号不能为空', 400)
  if (state.accounts.some((a) => a.code === code)) {
    throw httpError(`账号编号「${code}」已存在`, 409)
  }
  if (state.accounts.some((a) => a.username === username)) {
    throw httpError(`科应账号「${username}」已存在`, 409)
  }
  const account = {
    id: Math.max(0, ...state.accounts.map((a) => a.id)) + 1,
    code,
    username,
    status: 'AVAILABLE',
    currentUser: null,
    lastPasswordChangedAt: new Date().toISOString(),
    enabled: true,
    createdAt: new Date().toISOString(),
  }
  state.accounts.push(account)
  return { ...account }
}

async function deleteAccount(id) {
  await delay()
  const account = accountOf(id)
  const lease = state.leases.find((l) => l.accountCode === account.code && l.status === 'ACTIVE')
  if (lease) throw httpError('账号使用中，请先强制回收再删除', 409)
  state.accounts = state.accounts.filter((a) => a.id !== id)
  return { accountId: id }
}

async function bulkCreateAccounts(accounts) {
  await delay()
  let created = 0
  const failed = []
  for (const dto of accounts) {
    try {
      await createAccount(dto)
      created += 1
    } catch (err) {
      failed.push({ code: (dto.code ?? '').trim() || '(空)', reason: err.message })
    }
  }
  return { created, failed }
}

async function listUsers() {
  await delay()
  return cloneUsers()
}

async function createUser(dto) {
  await delay()
  if (state.users.some((u) => u.username === dto.username)) {
    throw httpError('用户名已存在', 409)
  }
  const user = {
    id: Math.max(...state.users.map((u) => u.id)) + 1,
    username: dto.username,
    displayName: dto.displayName,
    department: dto.department || '',
    role: dto.role || 'USER',
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  state.users.push(user)
  return { ...user }
}

async function updateUser(id, dto) {
  await delay()
  const user = state.users.find((u) => u.id === Number(id))
  if (!user) throw httpError('用户不存在', 404)
  if (dto.displayName !== undefined) user.displayName = dto.displayName
  if (dto.department !== undefined) user.department = dto.department
  if (dto.role !== undefined) user.role = dto.role
  if (dto.enabled !== undefined) user.enabled = dto.enabled
  user.updatedAt = new Date().toISOString()
  return { ...user }
}

async function bulkCreateUsers(users) {
  await delay()
  const failed = []
  let created = 0
  for (const dto of users) {
    try {
      if (!dto.username || !dto.displayName || !dto.password) {
        throw httpError('username / displayName / password 必填', 400)
      }
      await createUser(dto)
      created += 1
    } catch (err) {
      failed.push({ username: dto.username || '(空)', reason: err.message })
    }
  }
  return { created, failed }
}

/**
 * 租约记录 mock：后端分页形状 { items, total, page, pageSize }（与真实 /admin/leases 一致）。
 * 手写样本只有 5 条，为便于验证翻页，首次调用时确定性补足到 24 条（幂等）。
 */
function ensureLeaseRows() {
  const MIN_ROWS = 24
  if (state.leases.length >= MIN_ROWS) return
  const codes = ['KY-01', 'KY-02', 'KY-03', 'KY-04', 'KY-05']
  const statusCycle = ['RELEASED', 'ACTIVE', 'RELEASED', 'RELEASED', 'FAILED', 'TIMEOUT']
  const reasons = { RELEASED: 'USER_RETURN', FAILED: 'RESET_ERROR', TIMEOUT: 'INACTIVITY_TIMEOUT' }
  let n = state.leases.length
  while (state.leases.length < MIN_ROWS) {
    n += 1
    const user = state.users[(n % (state.users.length - 1)) + 1] // 张三/李四/王五 轮转（跳过 admin）
    const status = statusCycle[n % statusCycle.length]
    const releasedAt = status === 'RELEASED' || status === 'FAILED' || status === 'TIMEOUT' ? ago((n + 1) * 7 * HOUR) : null
    state.leases.push({
      id: 500 - n,
      userDisplayName: user.displayName,
      accountCode: codes[n % codes.length],
      status: status === 'TIMEOUT' ? 'RELEASED' : status,
      startedAt: ago(n * 7 * HOUR),
      lastActivityAt: ago(n * 7 * HOUR - 40 * MIN),
      releasedAt,
      releaseReason: releasedAt ? reasons[status] ?? 'USER_RETURN' : null,
    })
  }
}

async function listLeases({ status, page = 1, pageSize = 20 } = {}) {
  await delay()
  ensureLeaseRows()
  let rows = state.leases.map((l) => ({ ...l }))
  if (status && status !== 'all') rows = rows.filter((l) => l.status === status)
  rows.sort((a, b) => b.id - a.id)
  const total = rows.length
  const items = rows.slice((page - 1) * pageSize, page * pageSize)
  return { items, total, page, pageSize }
}

async function listLogs({ action, hideActivity, page = 1, pageSize = 20 } = {}) {
  await delay()
  // 与真实后端一致：audit 行只存 userId，用户列由 users 表解析出 displayName；动作下发 actionLabel 中文
  const nameOf = (id) => (id == null ? null : state.users.find((u) => u.id === id)?.displayName ?? null)
  let rows = state.logs.map((l) => ({ ...l, userDisplayName: nameOf(l.userId), actionLabel: ACTION_LABELS[l.action] ?? null }))
  if (action) rows = rows.filter((l) => l.action === action)
  if (hideActivity) rows = rows.filter((l) => l.action !== 'ACTIVITY')
  const total = rows.length
  const items = rows.slice((page - 1) * pageSize, page * pageSize)
  return { items, total, page, pageSize }
}

async function getSettings() {
  await delay()
  return { ...state.settings }
}

async function updateSettings(dto) {
  await delay()
  for (const [key, value] of Object.entries(dto)) {
    state.settings[key] = String(value)
  }
  return { ...state.settings }
}

async function getExtensionConfig() {
  await delay(100)
  return {
    minimumVersion: state.settings.extension_min_version,
    latestVersion: state.settings.extension_latest_version,
    activityThrottleSeconds: Number(state.settings.activity_throttle_seconds),
    warningSeconds: Number(state.settings.warning_seconds),
    criticalWarningSeconds: Number(state.settings.critical_warning_seconds),
    // 无操作超时（秒）：配置以分钟存储（inactivity_timeout_minutes），换算下发，与后端一致
    inactivityTimeoutSeconds: Math.round(Number(state.settings.inactivity_timeout_minutes ?? 30) * 60),
    // 真实部署下由 deploy-lan 打包生成（apps/web/dist/downloads/extension.json）
    package: {
      available: true,
      version: state.settings.extension_latest_version,
      fileName: 'scienceing-extension.zip',
      size: 0,
      downloadPath: '/downloads/scienceing-extension.zip',
      updatedAt: new Date().toISOString(),
    },
  }
}

async function runHealthCheck() {
  await delay(600)
  state.health.lastCheckedAt = new Date().toISOString()
  return { lastCheckedAt: state.health.lastCheckedAt, items: state.health.items.map((i) => ({ ...i })) }
}

/* ===================== 使用手册（t13） ===================== */

const MANUAL_MOCK_CONTENT = `# 科应共享账号管理平台 · 使用手册（Mock）

> 当前为前端内存 mock 数据，启动后端后显示管理员维护的完整手册。
> 管理员在本页编辑后可「保存」，普通用户只读预览。

## 1. 快速上手

1. 登录看板；
2. 点 **领取账号**；
3. 点 **打开科应**；用完点 **立即归还**。

![看板首页：账号余量与「领取账号」按钮](placeholder)

## 2. 安装浏览器助手

1. 顶栏下载 ZIP；
2. 解压到固定文件夹（\`manifest.json\` 在根目录）；
3. \`chrome://extensions\` → 开发者模式 → **加载已解压的扩展程序**。

![Chrome 扩展管理页：开发者模式开关与「加载已解压的扩展程序」](placeholder)

## 3. 校验方法

刷新看板 → 顶栏出现绿色「助手已就绪」→ 打开科应后右下角出现倒计时悬浮窗。

| 悬浮窗颜色 | 含义 |
|---|---|
| 绿色 | 正常 |
| 黄色 | 即将到期 |
| 红色 | 马上到期 |
`

async function getManual() {
  await delay()
  if (!state.manual.content) {
    state.manual.content = MANUAL_MOCK_CONTENT
    state.manual.updatedAt = new Date().toISOString()
  }
  return { ...state.manual }
}

async function updateManual({ title, content } = {}) {
  await delay(300)
  if (typeof title === 'string') state.manual.title = title
  if (typeof content === 'string') state.manual.content = content
  state.manual.updatedAt = new Date().toISOString()
  state.manual.updatedByDisplayName = '管理员'
  state.manual.isDefault = false
  return { ...state.manual }
}

/* ===================== 数据看板（t13） ===================== */

/** 稳定的伪随机（同一天同一指标得到同一值，避免每次刷新图表乱跳） */
function pseudo(seed) {
  const x = Math.sin(seed) * 10_000
  return Math.abs(x - Math.floor(x))
}

function daySeries(days) {
  const out = []
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * DAY)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

async function getDashboardStats(days = 30) {
  await delay(320)
  const range = Number(days) || 30
  const days1 = daySeries(range)

  const accounts = state.accounts
  const countBy = (status) => accounts.filter((a) => a.status === status && a.enabled).length

  const statusLabels = { AVAILABLE: '可用', IN_USE: '使用中', RECYCLING: '回收中', ERROR: '异常' }
  const accountStatus = ['AVAILABLE', 'IN_USE', 'RECYCLING', 'ERROR'].map((name) => ({
    name,
    label: statusLabels[name],
    value: countBy(name),
  }))

  const accountLoad = accounts
    .map((a, index) => ({
      accountId: a.id,
      code: a.code,
      username: a.username,
      status: a.status,
      claimCount: Math.round(pseudo(index + 1) * 26) + (a.status === 'IN_USE' ? 6 : 0),
      totalMinutes: Math.round(pseudo(index + 7) * 2400) + 120,
    }))
    .sort((x, y) => y.claimCount - x.claimCount)
    .slice(0, 10)

  const topUsers = state.users
    .filter((u) => u.role !== 'ADMIN')
    .map((u, index) => ({
      userId: u.id,
      displayName: u.displayName,
      department: u.department,
      claimCount: Math.round(pseudo(index + 21) * 30) + 2,
      totalMinutes: Math.round(pseudo(index + 33) * 3000) + 200,
    }))
    .sort((x, y) => y.claimCount - x.claimCount)
    .slice(0, 10)

  const claimTrend = days1.map((day, i) => ({
    day,
    count: Math.round(pseudo(i + 3) * 18) + (i % 7 === 0 || i % 7 === 6 ? 0 : 3),
  }))

  const resetTrend = days1.map((day, i) => ({
    day,
    success: Math.round(pseudo(i + 11) * 16) + 2,
    failed: Math.round(pseudo(i + 41) * 3),
  }))

  const now = Date.now()
  const ageDaysOf = (iso) => (iso ? Math.floor((now - new Date(iso).getTime()) / DAY) : null)
  const counter = { d7: 0, d30: 0, d90: 0, older: 0, never: 0 }
  const scored = accounts.map((a) => {
    const age = ageDaysOf(a.lastPasswordChangedAt)
    if (age === null) counter.never += 1
    else if (age <= 7) counter.d7 += 1
    else if (age <= 30) counter.d30 += 1
    else if (age <= 90) counter.d90 += 1
    else counter.older += 1
    return { ...a, ageDays: age }
  })

  const abnormal = scored
    .filter((a) => a.status === 'ERROR' || !a.enabled || a.ageDays === null || a.ageDays > 90)
    .map((a) => ({
      accountId: a.id,
      code: a.code,
      username: a.username,
      status: a.status,
      enabled: a.enabled,
      lastPasswordChangedAt: a.lastPasswordChangedAt,
      passwordAgeDays: a.ageDays,
      lastError: a.status === 'ERROR' ? '科应后台重置超时（mock）' : null,
      lastErrorAt: a.status === 'ERROR' ? ago(9 * MIN) : null,
    }))

  return {
    range: { days: range, from: new Date(Date.now() - range * DAY).toISOString(), to: new Date().toISOString() },
    overview: {
      accountTotal: accounts.length,
      accountEnabled: accounts.filter((a) => a.enabled).length,
      accountDisabled: accounts.filter((a) => !a.enabled).length,
      available: countBy('AVAILABLE'),
      inUse: countBy('IN_USE'),
      recycling: countBy('RECYCLING'),
      error: countBy('ERROR'),
      activeLeases: state.leases.filter((l) => l.status === 'ACTIVE').length,
      activeUsers: new Set(state.leases.filter((l) => l.status === 'ACTIVE').map((l) => l.userDisplayName)).size,
      avgLeaseMinutes: 42,
      totalClaims: claimTrend.reduce((sum, d) => sum + d.count, 0),
    },
    accountStatus,
    accountLoad,
    passwordHealth: {
      buckets: [
        { label: '7 天内', count: counter.d7 },
        { label: '8-30 天', count: counter.d30 },
        { label: '31-90 天', count: counter.d90 },
        { label: '90 天以上', count: counter.older },
        { label: '从未改密', count: counter.never },
      ],
      neverChanged: counter.never,
      abnormal,
    },
    resetJobs: {
      success: resetTrend.reduce((s, d) => s + d.success, 0),
      failed: resetTrend.reduce((s, d) => s + d.failed, 0),
      pending: 1,
      running: 0,
      total: resetTrend.reduce((s, d) => s + d.success + d.failed, 0) + 1,
      trend: resetTrend,
    },
    claimTrend,
    topUsers,
    releaseReasons: [
      { name: 'USER_RETURN', label: '主动归还', value: 42 },
      { name: 'INACTIVITY_TIMEOUT', label: '无操作超时', value: 11 },
      { name: 'ADMIN_FORCE', label: '管理员强制回收', value: 4 },
      { name: 'RESET_ERROR', label: '改密失败回收', value: 2 },
    ],
  }
}

export const adminMockApi = {
  listAccounts,
  forceRelease,
  resetPassword,
  markAvailable,
  disable,
  enable,
  renameAccount,
  createAccount,
  deleteAccount,
  bulkCreateAccounts,
  listUsers,
  createUser,
  bulkCreateUsers,
  updateUser,
  listLeases,
  listLogs,
  getSettings,
  updateSettings,
  getExtensionConfig,
  runHealthCheck,
  getManual,
  updateManual,
  getDashboardStats,
}
