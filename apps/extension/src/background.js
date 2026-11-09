/* global chrome, fetch, console, setInterval, setTimeout, clearTimeout, AbortController, URL */

/**
 * 科应共享账号助手 — MV3 Service Worker（核心）。
 *
 * 职责：
 *  t9：握手/版本、BIND_AND_OPEN、多 Tab 继承、状态轮询。
 *  t10：Activity 节流上报（5~10s 合并，POST /api/leases/{id}/activity）、
 *       悬浮窗「立即归还/返回看板」跳转（OPEN_DASHBOARD）、推送带阈值配置的状态。
 *  t11：归还时的本机会话清理（PURGE 链路）——收到 RECYCLING + recycleMode=PURGE 后，
 *       清掉科应域的本机存储并回执 POST /api/leases/{id}/recycle-ack。
 *       这是服务端唯一真正能让旧标签页失效的手段：改密/注销/互踢都不吊销令牌。
 *
 * 安全红线：只保存 leaseToken（PRD §43），绝不保存用户/科应密码；状态用
 * chrome.storage.session（会话级、浏览器关闭即清空，隐私最小化，PRD §44 / PRODUCT-DESIGN §7.4）。
 *
 * 消息契约（content script ↔ worker）：
 *   dashboard → EXTENSION_INFO        → { version, status:'ready'|'outdated'|'error', minimumVersion, latestVersion }
 *   dashboard → CLAIM_LEASE {authToken} → 由扩展申领一次性证明并代发领取请求
 *   dashboard → BIND_AND_OPEN {leaseId, leaseToken, accountCode?} → { ok, leaseId, tabId }
 *   scienceing → GET_TAB_LEASE        → { bound:true, leaseId, accountCode } | { bound:false }
 *   scienceing → GET_LEASE_STATUS {leaseId} → { ok, leaseId, status }
 *   scienceing → REPORT_ACTIVITY {leaseId}  → { ok, reported }（worker 5~10s 节流合并后 POST）
 *   scienceing → OPEN_DASHBOARD {path}      → { ok }（立即归还/返回看板跳转）
 *   worker → scienceing tab: LEASE_STATUS（含 config 阈值）/ LEASE_RELEASED / LEASE_SERVICE_ERROR（推送）
 *   worker → scienceing tab: PURGE_SESSION → { ok, method:'PAGE', detail }（要求清空本机存储并回读复核）
 */
import { compareVersions } from './lib/version.js';
import { claimLeaseThroughExtension } from './lib/claim.js';
import { needsSessionPurge, buildPurgeDetail } from './lib/purge.js';
import {
  API_BASE,
  SCIENCEING_URL,
  SCIENCEING_ORIGINS,
  DASHBOARD_URL,
  POLL_INTERVAL_MS,
  CONFIG_CACHE_MS,
} from './lib/config.js';

/** tabId → { leaseId, accountCode } */
const tabLease = new Map();
/** 新标签网址尚未确定时保存可信父标签的候选绑定。 */
const pendingTabLease = new Map();
/** leaseId → { leaseId, leaseToken, accountCode, status }（leaseToken 仅存内存 + session，不落盘） */
const leases = new Map();
/** leaseId → { lastSentAt, pending, timer }（Activity 节流状态） */
const activityState = new Map();
/** 正在清理中的 leaseId → 任务 Promise：防止轮询与 alarm 同时触发，重复清两遍、发两次回执。 */
const purgeTasks = new Map();

let pollTimer = null;
let configCache = null;
let configCacheAt = 0;

// ---------------------------------------------------------------------------
// 持久化（chrome.storage.session：SW 被回收后仍可恢复映射，浏览器会话内有效）
// ---------------------------------------------------------------------------

async function persist() {
  const tabLeaseObj = {};
  for (const [tabId, binding] of tabLease) tabLeaseObj[String(tabId)] = binding;
  const leasesObj = {};
  const pendingTabLeaseObj = Object.fromEntries(pendingTabLease);
  for (const [leaseId, lease] of leases) {
    leasesObj[String(leaseId)] = { leaseId: lease.leaseId, leaseToken: lease.leaseToken, accountCode: lease.accountCode };
  }
  try {
    if (chrome.storage?.session) await chrome.storage.session.set({ tabLease: tabLeaseObj, leases: leasesObj, pendingTabLease: pendingTabLeaseObj });
  } catch {
    // 会话存储不可用时退化为纯内存（重启后绑定需重建）
  }
}

async function loadState() {
  try {
    if (!chrome.storage?.session) return;
    const data = await chrome.storage.session.get(['tabLease', 'leases', 'pendingTabLease']);
    if (data.tabLease) for (const [k, v] of Object.entries(data.tabLease)) tabLease.set(Number(k), v);
    if (data.leases) for (const [k, v] of Object.entries(data.leases)) leases.set(Number(k), v);
    if (data.pendingTabLease) for (const [k, v] of Object.entries(data.pendingTabLease)) pendingTabLease.set(Number(k), v);
  } catch {
    // 忽略读取失败
  }
}

const stateReady = loadState();

// ---------------------------------------------------------------------------
// 绑定与映射
// ---------------------------------------------------------------------------

function bindTab(tabId, { leaseId, accountCode }) {
  pendingTabLease.delete(tabId);
  tabLease.set(tabId, { leaseId, accountCode: accountCode ?? null });
  const lease = leases.get(leaseId) ?? { leaseId, leaseToken: null, accountCode: null };
  lease.accountCode = lease.accountCode ?? accountCode ?? null;
  leases.set(leaseId, lease);
  sendToTab(tabId, { type: 'LEASE_BOUND', leaseId, accountCode: lease.accountCode });
}

function isScienceingUrl(url) {
  try {
    return SCIENCEING_ORIGINS.includes(new URL(url).origin);
  } catch {
    return false;
  }
}

function updateTabBinding(tabId, url) {
  if (!url || url === 'about:blank') return;
  if (!isScienceingUrl(url)) {
    pendingTabLease.delete(tabId);
    if (tabLease.delete(tabId)) sendToTab(tabId, { type: 'LEASE_UNBOUND' });
    return;
  }
  const candidate = pendingTabLease.get(tabId);
  if (candidate && leases.has(candidate.leaseId)) {
    bindTab(tabId, candidate);
    void pollLease(candidate.leaseId);
  }
}

function storeLeaseToken(leaseId, leaseToken, accountCode) {
  const lease = leases.get(leaseId) ?? { leaseId, leaseToken: null, accountCode: null };
  if (leaseToken) lease.leaseToken = leaseToken;
  if (accountCode) lease.accountCode = accountCode;
  leases.set(leaseId, lease);
}

function tabsForLease(leaseId) {
  const tabs = [];
  for (const [tabId, binding] of tabLease) if (binding.leaseId === leaseId) tabs.push(tabId);
  return tabs;
}

function sendToTab(tabId, message) {
  try {
    const p = chrome.tabs.sendMessage(tabId, message);
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {
    // Tab 尚未就绪（内容脚本未注入）时忽略，后续轮询会再推送
  }
}

// ---------------------------------------------------------------------------
// 版本 / 配置
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getExtensionConfig() {
  const now = Date.now();
  if (configCache && now - configCacheAt < CONFIG_CACHE_MS) return configCache;
  try {
    // 2.5s 超时：确保握手 EXTENSION_READY 能在看板 3s 判定内返回（后端慢时回 status='error' 而非误判未安装）
    const res = await fetchWithTimeout(`${API_BASE}/api/extension/config`, { cache: 'no-store' }, 2500);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    configCache = { ok: true, minimumVersion: data.minimumVersion ?? '1.0.0', latestVersion: data.latestVersion ?? '', ...data };
    configCacheAt = now;
    return configCache;
  } catch (error) {
    configCacheAt = 0; // 失败不缓存，允许快速重试
    return { ok: false, error: error && error.message ? error.message : String(error) };
  }
}

async function handleExtensionInfo() {
  const version = chrome.runtime.getManifest().version;
  const cfg = await getExtensionConfig();
  if (cfg.ok) {
    const status = compareVersions(version, cfg.minimumVersion) < 0 ? 'outdated' : 'ready';
    return {
      version,
      status,
      minimumVersion: cfg.minimumVersion,
      latestVersion: cfg.latestVersion,
      supportsAccountSelection: compareVersions(version, '1.4.0') >= 0,
      // 1.5.0 起支持归还时清理本机会话；服务端据此决定该租约走 PURGE 还是 ROTATE
      supportsSessionPurge: compareVersions(version, '1.5.0') >= 0,
    };
  }
  // 后端不可达：扩展仍在，但无法核对版本（PRD §45 系统不可用 → 看板应禁领取）
  return { version, status: 'error', minimumVersion: null, latestVersion: null, configError: true };
}

/**
 * 领取由扩展 Service Worker 代发：后端可依据浏览器管理的 chrome-extension:// Origin
 * 签发并消费一次性证明，网页不再自行提交可伪造的 extensionVersion。
 */
async function handleClaimLease(message) {
  const result = await claimLeaseThroughExtension({
    apiBase: API_BASE,
    authToken: message?.authToken,
    accountId: message?.accountId,
    extensionId: chrome.runtime.id,
    extensionVersion: chrome.runtime.getManifest().version,
    request: (url, options) => fetchWithTimeout(url, options, 5000),
  });
  if (result.ok) {
    storeLeaseToken(result.data.lease.id, result.data.leaseToken, result.data.account.code);
    await persist();
  }
  return result;
}

// ---------------------------------------------------------------------------
// BIND_AND_OPEN（PRD §15）
// ---------------------------------------------------------------------------

async function handleBindAndOpen(message) {
  const { leaseId, leaseToken, accountCode } = message ?? {};
  if (!leaseId || !leaseToken) return { ok: false, error: '缺少 leaseId / leaseToken' };

  const tab = await chrome.tabs.create({ url: SCIENCEING_URL, active: true });
  if (!tab || tab.id == null) return { ok: false, error: '创建科应页签失败' };

  storeLeaseToken(leaseId, leaseToken, accountCode ?? null);
  bindTab(tab.id, { leaseId, accountCode: accountCode ?? null });
  await persist();
  console.log('[scienceing-extension] BIND_AND_OPEN', { tabId: tab.id, leaseId, accountCode: accountCode ?? null });

  // 立即拉取一次状态并推送给新 Tab（新 Tab 内容脚本可能尚未就绪，失败由轮询兜底）
  void pollLease(leaseId);
  return { ok: true, leaseId, tabId: tab.id };
}

// ---------------------------------------------------------------------------
// Tab 继承与回收（PRD §16）
// ---------------------------------------------------------------------------

chrome.tabs.onCreated.addListener(async (tab) => {
  await stateReady;
  if (tab.id == null || tab.openerTabId == null) return;
  const parent = tabLease.get(tab.openerTabId);
  if (!parent || !leases.has(parent.leaseId)) return;
  pendingTabLease.set(tab.id, { ...parent });
  updateTabBinding(tab.id, tab.url);
  await persist();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  await stateReady;
  if (!tabLease.has(tabId) && !pendingTabLease.has(tabId)) return;
  if (!changeInfo.url && !tab?.url) return;
  updateTabBinding(tabId, changeInfo.url ?? tab.url);
  await persist();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await stateReady;
  tabLease.delete(tabId);
  pendingTabLease.delete(tabId);
  await persist();
});

// ---------------------------------------------------------------------------
// 状态轮询（PRD §15 GET /api/leases/{id}/status）
// ---------------------------------------------------------------------------

async function thresholdConfig() {
  const cfg = await getExtensionConfig();
  return {
    warningSeconds: cfg.ok ? Number(cfg.warningSeconds ?? 7200) : 7200,
    criticalWarningSeconds: cfg.ok ? Number(cfg.criticalWarningSeconds ?? 3600) : 3600,
    inactivityTimeoutSeconds: cfg.ok ? Number(cfg.inactivityTimeoutSeconds ?? 86400) : 86400,
  };
}

async function pollLease(leaseId) {
  const lease = leases.get(leaseId);
  if (!lease || !lease.leaseToken) return;
  const token = lease.leaseToken;
  try {
    const res = await fetch(`${API_BASE}/api/leases/${leaseId}/status`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (leases.get(leaseId) !== lease || lease.leaseToken !== token) return;
    if (res.status === 401 || res.status === 403) {
      markLeaseEnded(leaseId);
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const status = await res.json();
    if (leases.get(leaseId) !== lease || lease.leaseToken !== token) return;
    if (status.status !== 'ACTIVE') {
      // 归还后的收尾分两种：服务端要求清理（PURGE）就先清再结束，
      // 否则（ROTATE：服务端直接改密）什么都不用做。
      // 顺序不能反：purgeLeaseSession 需要 lease 里的 token 发回执，markLeaseEnded 会把它删掉。
      if (needsSessionPurge(status)) {
        try {
          await purgeLeaseSession(leaseId, status);
        } catch (error) {
          console.log('[scienceing-extension] purge failed', String(error));
        }
      }
      markLeaseEnded(leaseId, status);
      return;
    }
    lease.accountCode = status.accountCode ?? lease.accountCode ?? null;
    lease.status = status;
    await persist();
    const config = await thresholdConfig();
    if (leases.get(leaseId) !== lease || lease.leaseToken !== token) return;
    for (const tabId of tabsForLease(leaseId)) {
      sendToTab(tabId, { type: 'LEASE_STATUS', leaseId, status, config });
    }
  } catch (error) {
    if (leases.get(leaseId) !== lease || lease.leaseToken !== token) return;
    const message = error && error.message ? error.message : String(error);
    for (const tabId of tabsForLease(leaseId)) sendToTab(tabId, { type: 'LEASE_SERVICE_ERROR', leaseId, error: message });
  }
}

function markLeaseEnded(leaseId, status = { status: 'RELEASED' }) {
  // 幂等：并发的两次 poll 都会走到这里，第二次不应重复推送与写存储
  if (!leases.has(leaseId) && tabsForLease(leaseId).length === 0) return;
  for (const tabId of tabsForLease(leaseId)) sendToTab(tabId, { type: 'LEASE_RELEASED', leaseId, status });
  for (const [tabId, binding] of [...tabLease]) if (binding.leaseId === leaseId) tabLease.delete(tabId);
  for (const [tabId, binding] of [...pendingTabLease]) if (binding.leaseId === leaseId) pendingTabLease.delete(tabId);
  leases.delete(leaseId);
  const activity = activityState.get(leaseId);
  if (activity?.timer) clearTimeout(activity.timer);
  activityState.delete(leaseId);
  void persist();
  console.log('[scienceing-extension] lease ended', { leaseId });
}

// ---------------------------------------------------------------------------
// 归还清理（t11）：清本机会话 → 回执
//
// 为什么必须做：实测确认改密、真实退出登录、单点互踢都不会吊销已签发的 JWT，
// 服务端没有任何 kill switch。唯一能让那台机器停下来的，是把它的本地令牌删掉。
// ---------------------------------------------------------------------------

/** 带超时地给标签页发消息；标签页未注入内容脚本时返回 null 而不是抛错。 */
async function sendToTabAwait(tabId, message, timeoutMs = 3000) {
  let timer = null;
  try {
    const reply = chrome.tabs.sendMessage(tabId, message);
    if (!reply || typeof reply.then !== 'function') return reply ?? null;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    return await Promise.race([reply, timeout]);
  } catch {
    return null;
  } finally {
    // 成功路径也要清掉：SW 里残留的 timer 会拖住生命周期，也让测试的定时器计数失真
    if (timer !== null) clearTimeout(timer);
  }
}

/** 重载标签页。旧桩 / 受限环境没有 tabs.reload 时静默跳过。 */
async function reloadTab(tabId) {
  try {
    if (typeof chrome.tabs?.reload === 'function') await chrome.tabs.reload(tabId);
  } catch {
    // 标签页已关闭或不允许重载：清理本身已经完成，不影响结论
  }
}

/**
 * 执行一次清理，返回 { ok, method, detail }。
 *
 * 两条通道，优先用能**回读复核**的那条：
 *  - `PAGE`：让已注入的内容脚本在页面上下文里清空 localStorage/sessionStorage，
 *    再读一遍确认没有残留令牌键。只有这条能给出「确实清干净了」的证据。
 *  - `BROWSING_DATA`：标签页已关闭（或内容脚本不可达）时按 origin 清。
 *    Chrome 不提供回读接口，因此只能以「API 没有报错」为准——
 *    这也是为什么它排在 PAGE 之后，而不是反过来。
 */
async function runPurge(leaseId) {
  const tabIds = tabsForLease(leaseId);
  const attempts = [];

  for (const tabId of tabIds) {
    const reply = await sendToTabAwait(tabId, { type: 'PURGE_SESSION', leaseId });
    if (reply && reply.ok) {
      // 清完立刻重载：页面内存里可能还握着旧 token，只是存储空了。
      // 重载后 SPA 从空存储重新初始化，才真的没有登录态。
      await reloadTab(tabId);
      return { ok: true, method: 'PAGE', detail: buildPurgeDetail([reply.detail]) };
    }
    attempts.push(reply?.detail ?? 'no-reply');
  }

  try {
    if (typeof chrome.browsingData?.remove !== 'function') {
      throw new Error('browsingData 不可用');
    }
    // origins 只传科应两域：权限本身是全局的，但实际作用范围由这里限制。
    await chrome.browsingData.remove(
      { origins: [...SCIENCEING_ORIGINS], since: 0 },
      { localStorage: true, indexedDB: true, cacheStorage: true, serviceWorkers: true },
    );
    return {
      ok: true,
      method: 'BROWSING_DATA',
      detail: buildPurgeDetail([
        tabIds.length === 0 ? 'no-open-tab' : 'page-channel-failed',
        ...attempts.slice(0, 2),
      ]),
    };
  } catch (error) {
    return {
      ok: false,
      method: 'FAILED',
      detail: buildPurgeDetail([error && error.message ? error.message : String(error), ...attempts.slice(0, 2)]),
    };
  }
}

/** 把清理结果回执给服务端。失败不重试：服务端有 ack 超时兜底（会转改密）。 */
async function ackRecycle(leaseId, result) {
  const lease = leases.get(leaseId);
  if (!lease || !lease.leaseToken) return null;
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/leases/${leaseId}/recycle-ack`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lease.leaseToken}` },
        body: JSON.stringify({ ok: result.ok, method: result.method, detail: result.detail }),
        cache: 'no-store',
      },
      5000,
    );
    const data = await res.json().catch(() => ({}));
    console.log('[scienceing-extension] recycle-ack', { leaseId, ok: result.ok, method: result.method, http: res.status });
    return data;
  } catch (error) {
    // 网络失败：服务端会在 purge_ack_timeout_seconds 后自动转改密，不需要这里重试
    console.log('[scienceing-extension] recycle-ack failed', String(error));
    return null;
  }
}

/**
 * 清理并回执。
 *
 * 并发保护用「共享同一个 Promise」而不是布尔锁：
 * 启动时的首次 poll 与 10s 定时 poll 很容易同时看到同一条 RECYCLING 租约。
 * 若只是简单跳过第二次，第二次会立刻走到 markLeaseEnded 把 lease 删掉，
 * 而第一次的 ack 还需要 lease 里的 token —— 回执直接丢失，服务端只能等 120s 改密。
 * 复用同一个 Promise 能让两个调用者都等清理结束再收尾。
 */
async function purgeLeaseSession(leaseId, status) {
  if (!leases.has(leaseId)) return null; // 已被别的路径收尾
  const existing = purgeTasks.get(leaseId);
  if (existing) return existing;

  const task = (async () => {
    const result = await runPurge(leaseId);
    await ackRecycle(leaseId, result);
    for (const tabId of tabsForLease(leaseId)) {
      sendToTab(tabId, { type: 'LEASE_RELEASED', leaseId, status: status ?? { status: 'RELEASED' } });
    }
    return result;
  })();

  purgeTasks.set(leaseId, task);
  try {
    return await task;
  } finally {
    purgeTasks.delete(leaseId);
  }
}

async function pollAllLeases() {
  await stateReady;
  for (const leaseId of [...leases.keys()]) void pollLease(leaseId);
}function ensurePolling() {
  if (pollTimer) return;
  pollTimer = setInterval(pollAllLeases, POLL_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Activity 上报（t10，PRD §17/§18/§22）：5~10s 节流合并，只报「有操作」
// ---------------------------------------------------------------------------

async function activityThrottleMs() {
  const cfg = await getExtensionConfig();
  const seconds = cfg.ok ? Number(cfg.activityThrottleSeconds ?? 5) : NaN;
  const clamped = Number.isFinite(seconds) && seconds >= 5 && seconds <= 10 ? seconds : 5;
  return clamped * 1000;
}

async function postActivity(lease) {
  if (leases.get(lease.leaseId) !== lease) return;
  const token = lease.leaseToken;
  try {
    const res = await fetch(`${API_BASE}/api/leases/${lease.leaseId}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ leaseToken: token, event: 'activity' }),
      cache: 'no-store',
    });
    if (leases.get(lease.leaseId) !== lease || lease.leaseToken !== token) return;
    if (res.status === 401 || res.status === 403) {
      markLeaseEnded(lease.leaseId);
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json().catch(() => ({}));
    if (leases.get(lease.leaseId) !== lease || lease.leaseToken !== token) return;
    if (data.result === 'LEASE_EXPIRED') {
      markLeaseEnded(lease.leaseId);
    } else if (data.expiresAt) {
      void pollLease(lease.leaseId); // 拉取最新 expiresAt 并推送给悬浮窗刷新倒计时
    }
  } catch (error) {
    // 网络异常不致命（PRD §45）：下次真实操作会再触发
    console.log('[scienceing-extension] activity report failed', String(error));
  }
}

async function handleActivity(leaseId) {
  const lease = leases.get(leaseId);
  if (!lease || !lease.leaseToken) return { ok: false, error: '未知 Lease' };
  const now = Date.now();
  const state = activityState.get(leaseId) ?? { lastSentAt: 0, pending: false, timer: null };
  activityState.set(leaseId, state);

  const throttleMs = await activityThrottleMs();
  if (leases.get(leaseId) !== lease) return { ok: false, error: 'Lease 已失效' };
  const elapsed = now - state.lastSentAt;
  if (elapsed >= throttleMs && !state.timer) {
    state.lastSentAt = now;
    void postActivity(lease);
    return { ok: true, reported: true };
  }
  // 合并：只保留「有操作」标志，到点补发一次，不逐次上报
  state.pending = true;
  if (!state.timer) {
    const delay = Math.max(0, throttleMs - elapsed);
    state.timer = setTimeout(() => {
      state.timer = null;
      state.pending = false;
      state.lastSentAt = Date.now();
      void postActivity(lease);
    }, delay);
  }
  return { ok: true, reported: false };
}

// ---------------------------------------------------------------------------
// 悬浮窗跳转（立即归还确认 / 返回看板）
// ---------------------------------------------------------------------------

async function handleOpenDashboard(message) {
  const path = message?.path ?? '/';
  const url = `${DASHBOARD_URL}${path.startsWith('/') ? path : `/${path}`}`;

  // 优先复用已打开的看板标签页：用户从看板点「打开科应」后，原看板 tab 仍留在后台，
  // 悬浮窗的「归还账号 / 返回看板」应当聚焦那个 tab（目标 path 不同才导航过去），
  // 而不是每次点击都新开一个标签页/窗口。仅当不存在任何看板标签时才新建。
  let origin = '';
  try {
    origin = new URL(url).origin;
  } catch {
    /* URL 异常时直接走兜底新建 */
  }
  if (origin) {
    try {
      const matches = await chrome.tabs.query({ url: `${origin}/*` });
      if (matches.length > 0) {
        // 多开场景选最近访问的 tab（lastAccessed Chrome 111+；缺失时退化为取最新 id）
        const tab = matches.reduce(
          (best, t) => (t.lastAccessed ?? t.id) > (best.lastAccessed ?? best.id) ? t : best,
          matches[0],
        );
        if (tab.id != null) {
          const patch = { active: true };
          if (tab.url !== url) patch.url = url; // URL 一致则不刷新，仅聚焦
          await chrome.tabs.update(tab.id, patch);
          if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
          console.log('[scienceing-extension] OPEN_DASHBOARD 复用看板标签页', { tabId: tab.id, url });
          return { ok: true, tabId: tab.id, reused: true };
        }
      }
    } catch (err) {
      console.warn('[scienceing-extension] OPEN_DASHBOARD 查找看板标签失败，退回新建:', err);
    }
  }

  const tab = await chrome.tabs.create({ url, active: true });
  return { ok: true, tabId: tab?.id ?? null, reused: false };
}

// ---------------------------------------------------------------------------
// 消息分发
// ---------------------------------------------------------------------------

async function handleMessage(message, sender) {
  await stateReady;
  switch (message?.type) {
    case 'EXTENSION_INFO':
      return handleExtensionInfo();
    case 'CLAIM_LEASE':
      return handleClaimLease(message);
    case 'BIND_AND_OPEN':
      return handleBindAndOpen(message);
    case 'GET_TAB_LEASE': {
      const tabId = sender?.tab?.id;
      const url = sender?.url ?? sender?.tab?.url;
      if (tabId == null || !isScienceingUrl(url)) return { bound: false };
      updateTabBinding(tabId, url);
      await persist();
      const binding = tabId != null ? tabLease.get(tabId) : undefined;
      if (!binding) return { bound: false };
      const lease = leases.get(binding.leaseId);
      return { bound: true, leaseId: binding.leaseId, accountCode: binding.accountCode ?? lease?.accountCode ?? null };
    }
    case 'GET_LEASE_STATUS': {
      const leaseId = message.leaseId;
      if (!isScienceingUrl(sender?.url ?? sender?.tab?.url) || tabLease.get(sender?.tab?.id)?.leaseId !== leaseId) {
        return { ok: false, error: '当前页面未绑定该 Lease' };
      }
      const lease = leases.get(leaseId);
      if (!lease) return { ok: false, error: '未知 Lease' };
      void pollLease(leaseId);
      return { ok: true, leaseId, status: lease.status ?? null };
    }
    case 'REPORT_ACTIVITY': {
      const binding = tabLease.get(sender?.tab?.id);
      if (!isScienceingUrl(sender?.url ?? sender?.tab?.url) || binding?.leaseId !== message.leaseId) {
        return { ok: false, error: '当前页面未绑定该 Lease' };
      }
      return handleActivity(message.leaseId);
    }
    case 'OPEN_DASHBOARD':
      return handleOpenDashboard(message);
    default:
      return null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;
  const known = ['EXTENSION_INFO', 'CLAIM_LEASE', 'BIND_AND_OPEN', 'GET_TAB_LEASE', 'GET_LEASE_STATUS', 'REPORT_ACTIVITY', 'OPEN_DASHBOARD'];
  if (!known.includes(message.type)) return false;
  Promise.resolve(handleMessage(message, sender)).then(sendResponse, (error) => {
    sendResponse({ ok: false, error: error && error.message ? error.message : String(error) });
  });
  return true; // 保持消息通道，异步 sendResponse
});

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

/**
 * MV3 的 Service Worker 空闲约 30 秒就会被回收，`setInterval` 随之停止。
 * 归还后用户很可能不再操作浏览器，此时轮询停摆 → 清理指令发不出去 →
 * 只能等服务端 120 秒后改密。用 alarms 做分钟级兜底，把这个窗口压回来。
 * 浏览器活跃时仍以 setInterval（10s）为主，alarm 只是「SW 被回收后能醒过来」的保险。
 */
const POLL_ALARM_NAME = 'lease-poll';

function ensurePollAlarm() {
  try {
    if (typeof chrome.alarms?.create !== 'function') return;
    chrome.alarms.create(POLL_ALARM_NAME, { periodInMinutes: 1 });
  } catch {
    // 权限缺失或被策略禁用：退化为纯 setInterval
  }
}

if (typeof chrome.alarms?.onAlarm?.addListener === 'function') {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name !== POLL_ALARM_NAME) return;
    void pollAllLeases();
  });
}

ensurePolling();
ensurePollAlarm();
void pollAllLeases();
console.log('[scienceing-extension] service worker ready, version', chrome.runtime.getManifest().version);
