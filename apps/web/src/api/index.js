/* global window, document, localStorage, fetch */

import { computed, reactive } from 'vue'
import { mockApi } from './mock'

/**
 * 统一 API 层。
 *
 * USE_MOCK：默认**关闭**（走真实后端）。只有显式设 VITE_USE_MOCK=true 才进入 mock。
 *
 * 此前默认是 mock（`!== 'false'`），意味着只要漏设该变量，前端就会以
 * 「编造的数据 + mock 登录」上线——页面看起来完全正常，实际没有一个真实请求。
 * 默认值改为「真实」后，漏配只会导致连不上后端（立刻可见），而不是静默地骗人。
 * 纯 UI 开发用 mock：`VITE_USE_MOCK=true`。
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
const API_BASE = '/api'

/**
 * 登录态。
 *
 * 会话凭证由后端 httpOnly cookie 承载，**不再写入 localStorage**。
 * 此前把 token 存进 localStorage 并作为 `Authorization: Bearer` 发送，等于绕开了
 * httpOnly 的意义——任何一次 XSS 都能把长期有效的会话凭证整体带走。
 *
 * 现在 token 只存在于内存中，且只有一个用途：交给浏览器扩展。
 * （扩展运行在 chrome-extension:// 源，无法携带看板的 cookie，见 ensureExtensionToken。）
 * 刷新页面后登录态凭 cookie 调 /auth/me 恢复，需要令牌时再按需取回。
 */
export const authState = reactive({
  token: '',
  user: safeParse(localStorage.getItem('scienceing_user')),
})

/** 登录态以「已解析出的用户」为准，而非内存里的 token——刷新后 token 为空但会话仍在。 */
export const isLoggedIn = computed(() => Boolean(authState.user))
export const isAdmin = computed(() => authState.user?.role === 'ADMIN')

/** 插件状态（§4.4）。mock 模式默认就绪；真实联调时经扩展握手（t9）检测。 */
export const pluginState = reactive({
  status: USE_MOCK ? 'ready' : 'detecting',
  version: USE_MOCK ? '1.4.0' : '',
  supportsAccountSelection: USE_MOCK,
  minimumVersion: '',
  latestVersion: '',
})

let extensionDetectionStarted = false

/**
 * 扩展握手检测（契约见 apps/extension/README.md / content/dashboard.js）：
 * 广播 EXTENSION_PING，扩展以 EXTENSION_READY 应答（含 version/status/minimumVersion/latestVersion）；
 * 3 秒无应答判定未安装。status：ready | outdated | error（后端不可达，禁领取，PRD §45）。
 *
 * 真实浏览器验证（USE_MOCK=false）：
 *   1. 在 Edge/Chrome 加载已解压扩展（apps/extension），开启开发者模式；
 *   2. 启动后端（3000）+ 前端 dev（5173，代理 /api），打开看板；
 *   3. Console 观察广播 EXTENSION_PING 与扩展应答 EXTENSION_READY（或 3s 超时判未安装）。
 */
export function detectExtension() {
  if (USE_MOCK || extensionDetectionStarted) return
  extensionDetectionStarted = true

  let settled = false
  const timer = window.setTimeout(() => settle({ status: 'missing' }), 3000)

  function settle(detail) {
    if (settled) return
    settled = true
    window.clearTimeout(timer)
    window.removeEventListener('message', onMessage)
    document.removeEventListener('scienceing:extension-ready', onDocumentEvent)
    applyExtensionState(detail)
  }

  function onMessage(e) {
    if (e.source !== window || e.data?.source !== 'scienceing-extension') return
    if (e.data?.type === 'EXTENSION_READY') settle(e.data)
  }

  function onDocumentEvent(e) {
    settle(e.detail)
  }

  window.addEventListener('message', onMessage)
  document.addEventListener('scienceing:extension-ready', onDocumentEvent)
  window.postMessage({ source: 'scienceing-dashboard', type: 'EXTENSION_PING' }, '*')
}

function applyExtensionState(detail) {
  pluginState.version = detail?.version || ''
  pluginState.minimumVersion = detail?.minimumVersion || ''
  pluginState.latestVersion = detail?.latestVersion || ''
  pluginState.supportsAccountSelection = detail?.supportsAccountSelection === true
  const status = detail?.status
  pluginState.status = status === 'ready' || status === 'outdated' || status === 'error' ? status : 'missing'
}

/**
 * 扩展下载包（由 deploy-lan 在部署时生成并放到前端静态目录，由网关托管）。
 *
 * 固定文件名保证前端无需知道版本号即可给出稳定入口；
 * 真实版本/更新时间由后端 GET /extension/config 的 package 字段补充（见 loadExtensionPackage）。
 */
export const EXTENSION_DOWNLOAD_PATH = '/downloads/scienceing-extension.zip'

export const extensionPackage = reactive({
  available: false,
  version: '',
  size: 0,
  updatedAt: '',
  downloadPath: EXTENSION_DOWNLOAD_PATH,
})

let packageLoading = null

/** 读取扩展包元信息（幂等，失败静默：下载入口仍指向固定路径，只是没有版本/时间可展示）。 */
export function loadExtensionPackage() {
  if (USE_MOCK) {
    // mock 演示态：给出一个可用的展示值（真实部署时由后端 /extension/config 提供）
    extensionPackage.available = true
    extensionPackage.version = '1.4.0'
    extensionPackage.updatedAt = new Date().toISOString()
    return Promise.resolve(extensionPackage)
  }
  if (packageLoading) return packageLoading
  packageLoading = http('GET', '/extension/config')
    .then((cfg) => {
      const pkg = cfg?.package
      extensionPackage.available = Boolean(pkg?.available)
      extensionPackage.version = pkg?.version || ''
      extensionPackage.size = Number(pkg?.size || 0)
      extensionPackage.updatedAt = pkg?.updatedAt || ''
      extensionPackage.downloadPath = pkg?.downloadPath || EXTENSION_DOWNLOAD_PATH
      return extensionPackage
    })
    .catch(() => {
      extensionPackage.available = false
      return extensionPackage
    })
    .finally(() => {
      packageLoading = null
    })
  return packageLoading
}

/** 触发浏览器下载扩展 zip（同源静态文件，直接走 <a download>）。 */
export function downloadExtensionZip() {
  const a = document.createElement('a')
  a.href = extensionPackage.downloadPath || EXTENSION_DOWNLOAD_PATH
  a.download = ''
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function safeParse(value) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/**
 * 只持久化非敏感展示字段（用户名 / 角色），用于首屏渲染。
 * 凭证一律不落盘：token 留在内存，会话本身由 httpOnly cookie 维持。
 */
function persist() {
  if (authState.user) localStorage.setItem('scienceing_user', JSON.stringify(authState.user))
  else localStorage.removeItem('scienceing_user')
  // 清掉旧版本可能残留的凭证，避免升级后仍留在磁盘上。
  localStorage.removeItem('scienceing_token')
}

class ApiError extends Error {
  constructor(message, status, code = null) {
    super(message)
    this.status = status
    this.code = code
  }
}

/**
 * 统一请求。认证完全依赖 httpOnly cookie（`credentials: 'include'`）——
 * 不再附带 Bearer 头，避免把长期凭证暴露给页面脚本。
 */
export async function http(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  let res
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('服务不可用，请稍后重试', 0)
  }
  const text = await res.text()
  const data = text ? safeParse(text) : null
  if (!res.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join('，')
      : data?.message || `请求失败（${res.status}）`
    throw new ApiError(message, res.status, data?.code)
  }
  return data
}

export async function login(username, password) {
  if (USE_MOCK) {
    const data = await mockApi.login(username, password)
    authState.token = data.token
    authState.user = data.user
    persist()
    return data
  }
  const data = await http('POST', '/auth/login', { username, password })
  authState.token = data.token
  authState.user = data.user
  persist()
  return data
}

export async function logout() {
  if (USE_MOCK) {
    await mockApi.logout()
  } else {
    try {
      await http('POST', '/auth/logout')
    } catch {
      // 网络异常时仍清空本地登录态
    }
  }
  authState.token = ''
  authState.user = null
  persist()
}

/**
 * 用户本人修改登录密码（t14）：
 * POST /auth/change-password { currentPassword, newPassword }
 * 返回最新 user（首次登录强制改密场景下 mustChangePassword 已为 false）。
 * 成功即更新本地登录态，无需重新登录。
 */
export async function changePassword(currentPassword, newPassword) {
  const data = USE_MOCK
    ? await mockApi.changePassword(currentPassword, newPassword)
    : await http('POST', '/auth/change-password', { currentPassword, newPassword })
  authState.user = data
  persist()
  return data
}

export async function fetchMe() {
  if (USE_MOCK) {
    return mockApi.me()
  }
  try {
    const user = await http('GET', '/auth/me')
    authState.user = user
    persist()
    return user
  } catch (err) {
    // 会话已失效（cookie 过期 / 被撤销）：必须清掉本地残留的展示态，
    // 否则 localStorage 里的旧 user 会让界面一直以为还处于登录状态。
    if (err instanceof ApiError && err.status === 401) {
      authState.token = ''
      authState.user = null
      persist()
    }
    throw err
  }
}

export function getAvailability() {
  return USE_MOCK ? Promise.resolve(mockApi.availability()) : http('GET', '/accounts/availability')
}

export function getPool() {
  // 公开池列表（GET /api/accounts/pool，游客可访问）：[{ code, status, estimatedReleaseAt }]
  return USE_MOCK ? Promise.resolve(mockApi.pool()) : http('GET', '/accounts/pool')
}

/**
 * 取回当前会话令牌，专供交给浏览器扩展使用。
 *
 * 扩展运行在 chrome-extension:// 源，拿不到看板的 httpOnly cookie，因此领取流程
 * 必须由看板把 Bearer 令牌递过去。令牌只缓存在内存：刷新后这里会凭 cookie
 * 重新取回（后端 /auth/extension-token 返回的正是当前会话令牌，不新增凭证类型）。
 */
async function ensureExtensionToken() {
  if (authState.token) return authState.token
  const data = await http('POST', '/auth/extension-token')
  authState.token = data?.token || ''
  return authState.token
}

export async function claimLease(accountId) {
  if (accountId !== undefined && !pluginState.supportsAccountSelection) {
    throw new ApiError('指定账号领取需要科应账号助手 1.4.0 及以上，请升级扩展', 409, 'EXTENSION_OUTDATED')
  }
  if (USE_MOCK) return mockApi.claim(accountId)

  const authToken = await ensureExtensionToken()
  if (!authToken) throw new ApiError('未登录', 401)

  return new Promise((resolve, reject) => {
    const requestId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
    const timer = window.setTimeout(() => finish(new ApiError('科应账号助手响应超时，请刷新页面后重试', 0)), 12_000)

    function finish(error, data) {
      window.clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      if (error) reject(error)
      else resolve(data)
    }

    function onMessage(event) {
      const data = event.data
      if (
        event.source !== window ||
        data?.source !== 'scienceing-extension' ||
        data?.type !== 'CLAIM_LEASE_RESULT' ||
        data?.requestId !== requestId
      ) return
      if (data.ok) finish(null, data.data)
      else finish(new ApiError(data.error || '领取账号失败', Number(data.status || 0), data.code))
    }

    window.addEventListener('message', onMessage)
    window.postMessage(
      { source: 'scienceing-dashboard', type: 'CLAIM_LEASE', requestId, authToken, accountId },
      window.location.origin,
    )
  })
}

export function getCurrentLease() {
  return USE_MOCK ? mockApi.current() : http('GET', '/leases/current')
}

export function getMyAccounts() {
  return USE_MOCK ? mockApi.mine() : http('GET', '/accounts/mine')
}

export function releaseLease(leaseId) {
  return USE_MOCK ? mockApi.release(leaseId) : http('POST', `/leases/${leaseId}/release`)
}

/**
 * 使用手册（游客可读）：GET /api/manual
 * 后端无记录时返回内置默认内容（isDefault=true）。
 */
export function getManual() {
  return USE_MOCK ? mockApi.manual() : http('GET', '/manual')
}

/** 不足 1 小时显示 mm:ss，否则显示 HH:mm:ss（tabular-nums）。 */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds ?? 0))
  const hours = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const short = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${short}` : short
}

export { ApiError }
