import { reactive } from 'vue'

/**
 * 内存 mock 后端：在未启动真实 NestJS 后端时，演示「登录 → 领取 → /my → 归还」主流程。
 * 响应形状与 packages/shared 的 DTO 保持一致（camelCase）。
 *
 * 演示口令为无关占位值（与 seed/生产任何真实凭据无关）：
 *   管理员 admin / mock-admin；普通用户 zhangsan / mock-user。
 */
const INACTIVITY_TIMEOUT_SECONDS = 1800 // 30 分钟

const state = reactive({
  user: null,
  token: null,
  pool: [
    { id: 1, code: 'KY-01', status: 'AVAILABLE' },
    { id: 2, code: 'KY-02', status: 'IN_USE', expiresAt: isoFromNow(28 * 60 + 4) },
    { id: 3, code: 'KY-03', status: 'IN_USE', expiresAt: isoFromNow(11 * 60 + 20) },
    { id: 4, code: 'KY-04', status: 'RECYCLING' },
    { id: 5, code: 'KY-05', status: 'ERROR' },
    { id: 6, code: 'KY-06', status: 'AVAILABLE' },
    { id: 7, code: 'KY-07', status: 'AVAILABLE' },
    { id: 8, code: 'KY-08', status: 'AVAILABLE' },
    { id: 9, code: 'KY-09', status: 'AVAILABLE' },
    { id: 10, code: 'KY-10', status: 'AVAILABLE' },
  ],
  lease: null,
})

const MOCK_USERS = {
  admin: { id: 1, username: 'admin', displayName: '管理员', department: 'IT', role: 'ADMIN', enabled: true, password: 'mock-admin' },
  zhangsan: { id: 2, username: 'zhangsan', displayName: '张三', department: '研发部', role: 'USER', enabled: true, password: 'mock-user' },
}

function isoFromNow(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString()
}

function nowIso() {
  return new Date().toISOString()
}

function delay(ms = 250) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function httpError(message, status) {
  const err = new Error(message)
  err.status = status
  return err
}

function remainingOf(account) {
  if (!account?.expiresAt) return null
  return Math.max(0, Math.floor((new Date(account.expiresAt).getTime() - Date.now()) / 1000))
}

function availability() {
  const counts = { total: 0, available: 0, inUse: 0, recycling: 0, error: 0 }
  for (const a of state.pool) {
    counts.total += 1
    if (a.status === 'AVAILABLE') counts.available += 1
    else if (a.status === 'IN_USE') counts.inUse += 1
    else if (a.status === 'RECYCLING') counts.recycling += 1
    else if (a.status === 'ERROR') counts.error += 1
  }
  return counts
}

/** 公开池列表：游客不暴露使用人姓名（PRD §35）。形状对齐 GET /api/accounts/pool。 */
function pool() {
  return state.pool.map((a) => ({
    code: a.code,
    status: a.status,
    estimatedReleaseAt: a.expiresAt ?? null,
  }))
}

function toUserDto(user) {
  const { password: _password, ...rest } = user
  return rest
}

function toLeaseDto(lease) {
  const { leaseToken: _t, password: _p, ...rest } = lease
  return rest
}

function toAccountDto(lease) {
  return {
    accountId: lease.accountId,
    code: lease.accountCode,
    username: lease.accountUsername,
    password: lease.password,
  }
}

function requireAuth() {
  if (!state.user) throw httpError('未登录', 401)
}

async function login(username, password) {
  await delay()
  const user = MOCK_USERS[username]
  if (!user || user.password !== password) {
    throw httpError('用户名或密码错误', 401)
  }
  state.user = toUserDto(user)
  state.token = `mock-token-${Date.now()}`
  return { token: state.token, user: state.user }
}

async function logout() {
  await delay(50)
  state.user = null
  state.token = null
  return { ok: true }
}

async function me() {
  await delay(50)
  requireAuth()
  return state.user
}

async function claim(extensionVersion) {
  await delay()
  requireAuth()

  // R2：已有活动租约 → 直接返回既有租约（轮换 token）
  if (state.lease && state.lease.status === 'ACTIVE') {
    state.lease.leaseToken = `mock-lease-token-${state.lease.accountId}-${Date.now()}`
    return { leaseToken: state.lease.leaseToken, lease: toLeaseDto(state.lease), account: toAccountDto(state.lease) }
  }

  const account = state.pool.find((a) => a.status === 'AVAILABLE')
  if (!account) {
    throw httpError('暂无可用账号', 409)
  }

  account.status = 'IN_USE'
  account.expiresAt = isoFromNow(INACTIVITY_TIMEOUT_SECONDS)
  const now = nowIso()
  const lease = {
    id: Date.now(),
    accountId: account.id,
    accountCode: account.code,
    accountUsername: account.code.toLowerCase(),
    password: `Ky-${account.code}#Demo`,
    leaseToken: `mock-lease-token-${account.id}`,
    status: 'ACTIVE',
    startedAt: now,
    lastActivityAt: now,
    expiresAt: isoFromNow(INACTIVITY_TIMEOUT_SECONDS),
    remainingSeconds: INACTIVITY_TIMEOUT_SECONDS,
    timeoutSeconds: INACTIVITY_TIMEOUT_SECONDS, // 进度条满刻度（与后端 LeaseView 同形）
    releaseRequestedAt: null,
    releasedAt: null,
    releaseReason: null,
  }
  state.lease = lease
  return { leaseToken: lease.leaseToken, lease: toLeaseDto(lease), account: toAccountDto(lease) }
}

async function current() {
  await delay()
  requireAuth()
  if (!state.lease || state.lease.status !== 'ACTIVE') {
    return { lease: null, account: null }
  }
  const remaining = remainingOf(state.lease)
  state.lease.remainingSeconds = remaining
  const account = state.pool.find((a) => a.id === state.lease.accountId)
  if (account) account.remainingSeconds = remaining
  return { lease: toLeaseDto(state.lease), account: toAccountDto(state.lease) }
}

async function release(id) {
  await delay()
  requireAuth()
  if (!state.lease || state.lease.id !== id) {
    throw httpError('租约不存在', 404)
  }
  state.lease.status = 'RECYCLING'
  state.lease.releaseReason = 'USER_RETURN'
  state.lease.releaseRequestedAt = nowIso()
  const account = state.pool.find((a) => a.id === state.lease.accountId)
  if (account) account.status = 'RECYCLING'

  // 模拟 Playwright 改密完成后账号回到可用（5 秒后释放）
  const lease = state.lease
  setTimeout(() => {
    if (state.lease === lease && state.lease.status === 'RECYCLING') {
      state.lease.status = 'RELEASED'
      state.lease.releasedAt = nowIso()
      const acc = state.pool.find((a) => a.id === state.lease.accountId)
      if (acc) acc.status = 'AVAILABLE'
      state.lease = null
    }
  }, 5000)

  return { leaseId: id, status: 'RECYCLING', releaseReason: 'USER_RETURN' }
}

/**
 * 使用手册（mock 精简版，仅用于无后端开发；真实内容由后端 manuals 表提供）。
 * 图片用 `![](placeholder)` 占位，前端渲染为「待补充图片」提示框。
 */
const MANUAL_MOCK_CONTENT = `# 科应共享账号管理平台 · 使用手册（Mock）

> 当前为前端内存 mock 数据，启动后端后显示管理员维护的完整手册。

## 1. 三步用起来

1. 登录看板（管理员分发的地址）；
2. 点 **领取账号**；
3. 点 **打开科应**，用完点 **立即归还**。

![看板首页：账号余量与「领取账号」按钮](placeholder)

## 2. 安装浏览器助手

1. 顶栏下载 ZIP；
2. 解压到固定文件夹（\`manifest.json\` 要在根目录）；
3. Chrome 打开 \`chrome://extensions\` → 开发者模式 → **加载已解压的扩展程序**。

![Chrome 扩展管理页：开发者模式开关与「加载已解压的扩展程序」](placeholder)

## 3. 校验

刷新看板，顶栏出现绿色「助手已就绪」即成功；打开科应后右下角应有倒计时悬浮窗。

| 颜色 | 含义 |
|---|---|
| 绿色 | 正常 |
| 黄色 | 即将到期 |
| 红色 | 马上到期 |
`

function manual() {
  return {
    slug: 'user-guide',
    title: '科应共享账号管理平台 · 使用手册（Mock）',
    content: MANUAL_MOCK_CONTENT,
    updatedAt: nowIso(),
    updatedByDisplayName: null,
    isDefault: true,
  }
}

export const mockApi = {
  login,
  logout,
  me,
  availability,
  pool,
  claim,
  current,
  release,
  manual,
}
