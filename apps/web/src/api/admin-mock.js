import { reactive } from 'vue'

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
    inactivity_timeout_seconds: '1800',
    warning_seconds: '300',
    critical_warning_seconds: '60',
    activity_throttle_seconds: '5',
    extension_min_version: '1.0.0',
    extension_latest_version: '1.2.0',
  },
  health: {
    lastCheckedAt: ago(5 * MIN),
    items: [
      { key: 'admin-login', label: '管理员登录正常', ok: true },
      { key: 'accounts-page', label: '账号管理页可访问', ok: true },
      { key: 'reset-entry', label: '改密入口正常', ok: true },
    ],
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

async function listLeases() {
  await delay()
  return state.leases.map((l) => ({ ...l }))
}

async function listLogs({ action, page = 1, pageSize = 20 } = {}) {
  await delay()
  let rows = state.logs.map((l) => ({ ...l }))
  if (action) rows = rows.filter((l) => l.action === action)
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
  }
}

async function runHealthCheck() {
  await delay(600)
  state.health.lastCheckedAt = new Date().toISOString()
  return { lastCheckedAt: state.health.lastCheckedAt, items: state.health.items.map((i) => ({ ...i })) }
}

export const adminMockApi = {
  listAccounts,
  forceRelease,
  resetPassword,
  markAvailable,
  disable,
  enable,
  listUsers,
  createUser,
  updateUser,
  listLeases,
  listLogs,
  getSettings,
  updateSettings,
  getExtensionConfig,
  runHealthCheck,
}
