import { computed, reactive } from 'vue'
import { mockApi } from './mock'

/**
 * 统一 API 层。
 *
 * USE_MOCK：默认 mock（无后端时开发不受影响）。
 * 真实联调：设环境变量 VITE_USE_MOCK=false（.env 或命令行），并保证后端监听 3000
 * （vite dev 已代理 /api → http://localhost:3000）。
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'
const API_BASE = '/api'

export const authState = reactive({
  token: localStorage.getItem('scienceing_token') || '',
  user: safeParse(localStorage.getItem('scienceing_user')),
})

export const isLoggedIn = computed(() => Boolean(authState.token))
export const isAdmin = computed(() => authState.user?.role === 'ADMIN')

/** 插件状态（§4.4）。mock 模式默认就绪；真实联调时经扩展握手（t9）检测。 */
export const pluginState = reactive({
  status: USE_MOCK ? 'ready' : 'detecting',
  version: USE_MOCK ? '1.0.0' : '',
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
    extensionPackage.version = '1.2.0'
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

function persist() {
  if (authState.token) localStorage.setItem('scienceing_token', authState.token)
  else localStorage.removeItem('scienceing_token')
  if (authState.user) localStorage.setItem('scienceing_user', JSON.stringify(authState.user))
  else localStorage.removeItem('scienceing_user')
}

class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

export async function http(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  if (authState.token) headers.Authorization = `Bearer ${authState.token}`
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
    throw new ApiError(message, res.status)
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

export async function fetchMe() {
  if (USE_MOCK) {
    return mockApi.me()
  }
  const user = await http('GET', '/auth/me')
  authState.user = user
  persist()
  return user
}

export function getAvailability() {
  return USE_MOCK ? Promise.resolve(mockApi.availability()) : http('GET', '/accounts/availability')
}

export function getPool() {
  // 公开池列表（GET /api/accounts/pool，游客可访问）：[{ code, status, estimatedReleaseAt }]
  return USE_MOCK ? Promise.resolve(mockApi.pool()) : http('GET', '/accounts/pool')
}

export function claimLease(extensionVersion) {
  return USE_MOCK ? mockApi.claim(extensionVersion) : http('POST', '/leases', { extensionVersion })
}

export function getCurrentLease() {
  return USE_MOCK ? mockApi.current() : http('GET', '/leases/current')
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

/** mm:ss（§4.2 全站唯一倒计时格式，tabular-nums） */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds ?? 0))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export { ApiError }
