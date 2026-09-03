/* global chrome, fetch, console, setInterval, setTimeout, clearTimeout, AbortController */

/**
 * 科应共享账号助手 — MV3 Service Worker（核心）。
 *
 * 职责：
 *  t9：握手/版本、BIND_AND_OPEN、多 Tab 继承、状态轮询。
 *  t10：Activity 节流上报（5~10s 合并，POST /api/leases/{id}/activity）、
 *       悬浮窗「立即归还/返回看板」跳转（OPEN_DASHBOARD）、推送带阈值配置的状态。
 *
 * 安全红线：只保存 leaseToken（PRD §43），绝不保存用户/科应密码；状态用
 * chrome.storage.session（会话级、浏览器关闭即清空，隐私最小化，PRD §44 / PRODUCT-DESIGN §7.4）。
 *
 * 消息契约（content script ↔ worker）：
 *   dashboard → EXTENSION_INFO        → { version, status:'ready'|'outdated'|'error', minimumVersion, latestVersion }
 *   dashboard → BIND_AND_OPEN {leaseId, leaseToken, accountCode?} → { ok, leaseId, tabId }
 *   scienceing → GET_TAB_LEASE        → { bound:true, leaseId, accountCode } | { bound:false }
 *   scienceing → GET_LEASE_STATUS {leaseId} → { ok, leaseId, status }
 *   scienceing → REPORT_ACTIVITY {leaseId}  → { ok, reported }（worker 5~10s 节流合并后 POST）
 *   scienceing → OPEN_DASHBOARD {path}      → { ok }（立即归还/返回看板跳转）
 *   worker → scienceing tab: LEASE_STATUS（含 config 阈值）/ LEASE_RELEASED / LEASE_SERVICE_ERROR（推送）
 */
import { compareVersions } from './lib/version.js';
import {
  API_BASE,
  SCIENCEING_URL,
  DASHBOARD_URL,
  POLL_INTERVAL_MS,
  CONFIG_CACHE_MS,
} from './lib/config.js';

/** tabId → { leaseId, accountCode } */
const tabLease = new Map();
/** leaseId → { leaseId, leaseToken, accountCode, status }（leaseToken 仅存内存 + session，不落盘） */
const leases = new Map();
/** leaseId → { lastSentAt, pending, timer }（Activity 节流状态） */
const activityState = new Map();

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
  for (const [leaseId, lease] of leases) {
    leasesObj[String(leaseId)] = { leaseId: lease.leaseId, leaseToken: lease.leaseToken, accountCode: lease.accountCode };
  }
  try {
    if (chrome.storage?.session) await chrome.storage.session.set({ tabLease: tabLeaseObj, leases: leasesObj });
  } catch {
    // 会话存储不可用时退化为纯内存（重启后绑定需重建）
  }
}

async function loadState() {
  try {
    if (!chrome.storage?.session) return;
    const data = await chrome.storage.session.get(['tabLease', 'leases']);
    if (data.tabLease) for (const [k, v] of Object.entries(data.tabLease)) tabLease.set(Number(k), v);
    if (data.leases) for (const [k, v] of Object.entries(data.leases)) leases.set(Number(k), v);
  } catch {
    // 忽略读取失败
  }
}

// ---------------------------------------------------------------------------
// 绑定与映射
// ---------------------------------------------------------------------------

function bindTab(tabId, { leaseId, accountCode }) {
  tabLease.set(tabId, { leaseId, accountCode: accountCode ?? null });
  const lease = leases.get(leaseId) ?? { leaseId, leaseToken: null, accountCode: null };
  lease.accountCode = lease.accountCode ?? accountCode ?? null;
  leases.set(leaseId, lease);
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
    return { version, status, minimumVersion: cfg.minimumVersion, latestVersion: cfg.latestVersion };
  }
  // 后端不可达：扩展仍在，但无法核对版本（PRD §45 系统不可用 → 看板应禁领取）
  return { version, status: 'error', minimumVersion: null, latestVersion: null, configError: true };
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

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id == null || tab.openerTabId == null) return;
  const parent = tabLease.get(tab.openerTabId);
  if (!parent) return;
  bindTab(tab.id, { leaseId: parent.leaseId, accountCode: parent.accountCode });
  void persist();
  console.log('[scienceing-extension] inherit', { tabId: tab.id, openerTabId: tab.openerTabId, leaseId: parent.leaseId });
  void pollLease(parent.leaseId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const binding = tabLease.get(tabId);
  if (!binding) return;
  tabLease.delete(tabId);
  void persist();
  console.log('[scienceing-extension] unbind', { tabId, leaseId: binding.leaseId });
});

// ---------------------------------------------------------------------------
// 状态轮询（PRD §15 GET /api/leases/{id}/status）
// ---------------------------------------------------------------------------

async function thresholdConfig() {
  const cfg = await getExtensionConfig();
  return {
    warningSeconds: cfg.ok ? Number(cfg.warningSeconds ?? 300) : 300,
    criticalWarningSeconds: cfg.ok ? Number(cfg.criticalWarningSeconds ?? 60) : 60,
    inactivityTimeoutSeconds: cfg.ok ? Number(cfg.inactivityTimeoutSeconds ?? 1800) : 1800,
  };
}

async function pollLease(leaseId) {
  const lease = leases.get(leaseId);
  if (!lease || !lease.leaseToken) return;
  try {
    const res = await fetch(`${API_BASE}/api/leases/${leaseId}/status`, {
      headers: { Authorization: `Bearer ${lease.leaseToken}` },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) {
      markLeaseEnded(leaseId);
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const status = await res.json();
    lease.accountCode = status.accountCode ?? lease.accountCode ?? null;
    lease.status = status;
    await persist();
    const config = await thresholdConfig();
    for (const tabId of tabsForLease(leaseId)) {
      sendToTab(tabId, { type: 'LEASE_STATUS', leaseId, status, config });
    }
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    for (const tabId of tabsForLease(leaseId)) sendToTab(tabId, { type: 'LEASE_SERVICE_ERROR', leaseId, error: message });
  }
}

function markLeaseEnded(leaseId) {
  for (const tabId of tabsForLease(leaseId)) sendToTab(tabId, { type: 'LEASE_RELEASED', leaseId, status: { status: 'RELEASED' } });
  for (const [tabId, binding] of [...tabLease]) if (binding.leaseId === leaseId) tabLease.delete(tabId);
  leases.delete(leaseId);
  activityState.delete(leaseId);
  void persist();
  console.log('[scienceing-extension] lease ended', { leaseId });
}

function pollAllLeases() {
  for (const leaseId of [...leases.keys()]) void pollLease(leaseId);
}

function ensurePolling() {
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
  try {
    const res = await fetch(`${API_BASE}/api/leases/${lease.leaseId}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lease.leaseToken}` },
      body: JSON.stringify({ leaseToken: lease.leaseToken, event: 'activity' }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json().catch(() => ({}));
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
  const tab = await chrome.tabs.create({ url, active: true });
  return { ok: true, tabId: tab?.id ?? null };
}

// ---------------------------------------------------------------------------
// 消息分发
// ---------------------------------------------------------------------------

async function handleMessage(message, sender) {
  switch (message?.type) {
    case 'EXTENSION_INFO':
      return handleExtensionInfo();
    case 'BIND_AND_OPEN':
      return handleBindAndOpen(message);
    case 'GET_TAB_LEASE': {
      const tabId = sender?.tab?.id;
      const binding = tabId != null ? tabLease.get(tabId) : undefined;
      if (!binding) return { bound: false };
      const lease = leases.get(binding.leaseId);
      return { bound: true, leaseId: binding.leaseId, accountCode: binding.accountCode ?? lease?.accountCode ?? null };
    }
    case 'GET_LEASE_STATUS': {
      const leaseId = message.leaseId;
      const lease = leases.get(leaseId);
      if (!lease) return { ok: false, error: '未知 Lease' };
      void pollLease(leaseId);
      return { ok: true, leaseId, status: lease.status ?? null };
    }
    case 'REPORT_ACTIVITY':
      return handleActivity(message.leaseId);
    case 'OPEN_DASHBOARD':
      return handleOpenDashboard(message);
    default:
      return null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;
  const known = ['EXTENSION_INFO', 'BIND_AND_OPEN', 'GET_TAB_LEASE', 'GET_LEASE_STATUS', 'REPORT_ACTIVITY', 'OPEN_DASHBOARD'];
  if (!known.includes(message.type)) return false;
  Promise.resolve(handleMessage(message, sender)).then(sendResponse, (error) => {
    sendResponse({ ok: false, error: error && error.message ? error.message : String(error) });
  });
  return true; // 保持消息通道，异步 sendResponse
});

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

void loadState(); // 异步恢复映射，不阻塞 SW 启动（MV3 顶层 await 会导致 SW 注册失败）
ensurePolling();
console.log('[scienceing-extension] service worker ready, version', chrome.runtime.getManifest().version);
