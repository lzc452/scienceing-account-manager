/* global chrome, window, localStorage, sessionStorage */

/**
 * 科应域 Content Script（document_idle）。
 *
 * t10 职责：
 * - Activity 监听：pointerdown/keydown/wheel/touchstart，仅 event.isTrusted===true（PRD §17），
 *   通过 composedPath 排除插件悬浮窗 UI（PRD §44），未绑定 Tab 不参与续期（PRD §16）。
 * - 本地轻量节流（2s，仅「有操作」信号）→ 交由 worker 做 5~10s 合并后 POST /api/leases/{id}/activity。
 * - 接收 worker 推送（LEASE_STATUS / LEASE_RELEASED / LEASE_SERVICE_ERROR）并驱动
 *   globalThis.__scienceingPanel（由 src/panel/panel.js 注入同一隔离世界）渲染五态。
 */
(() => {
  const PANEL_HOST_ID = '__scienceing_account_assistant__';
  const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
  const LOCAL_THROTTLE_MS = 2000;

  let leaseId = null;
  let bound = false;
  let lastLocalActivityAt = 0;
  let activityListenersAttached = false;
  let receivedLeaseState = false;
  let config = { warningSeconds: 7200, criticalWarningSeconds: 3600, inactivityTimeoutSeconds: 86400 };

  // -------------------------------------------------------------------------
  // Activity 监听（PRD §17 / §44）
  // -------------------------------------------------------------------------

  function isPanelEvent(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (const node of path) {
      if (node && node.id === PANEL_HOST_ID) return true;
    }
    return false;
  }

  function onActivity(event) {
    if (!event.isTrusted) return;            // 排除脚本自动产生的事件
    if (!bound || leaseId == null) return;   // 未绑定不参与续期（PRD §16）
    if (isPanelEvent(event)) return;         // 排除插件 UI（PRD §44）
    const now = Date.now();
    if (now - lastLocalActivityAt < LOCAL_THROTTLE_MS) return;
    lastLocalActivityAt = now;
    void chrome.runtime.sendMessage({ type: 'REPORT_ACTIVITY', leaseId }).catch(() => {});
  }

  function attachActivityListeners() {
    if (activityListenersAttached) return;
    activityListenersAttached = true;
    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, onActivity, { passive: true, capture: true });
    }
  }

  // -------------------------------------------------------------------------
  // 本机会话清理（t11）：worker 下发 PURGE_SESSION，在此清空存储并回读复核
  //
  // 为什么要在页面上下文做：localStorage 按 origin 存储，内容脚本（隔离世界）
  // 与页面共享同一份 Storage，因此这里 clear() 与页面自己 clear() 等价；
  // 而「回读确认没有残留令牌键」只有能访问 Storage 的上下文才做得到。
  // -------------------------------------------------------------------------

  /** 形似令牌的键名（只用于复核残留，不读取、不输出任何值）。 */
  const TOKEN_KEY_PATTERN = /authorization|token|jwt|session/i;

  function purgeLocalSession() {
    const detail = [];
    let ok = true;

    try {
      const before = localStorage.length;
      localStorage.clear();
      detail.push(`localStorage cleared(${before})`);
    } catch (error) {
      ok = false;
      detail.push(`localStorage error: ${error && error.message ? error.message : String(error)}`);
    }

    try {
      // 令牌也有被复制到 sessionStorage 的可能，一并清掉
      sessionStorage.clear();
    } catch {
      // 极少数环境禁用 sessionStorage，忽略
    }

    // 回读复核：清完再扫一遍键名，确认没有残留的令牌键
    const residual = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i) ?? '';
        if (TOKEN_KEY_PATTERN.test(key)) residual.push(key);
      }
    } catch {
      // 读不了就按失败算：拿不到证据不能声称清干净了
      ok = false;
      detail.push('readback failed');
    }
    if (residual.length > 0) {
      ok = false;
      detail.push(`residual=${residual.join(',')}`);
    }

    detail.push(`remain=${localStorage.length}`);
    return { ok, method: 'PAGE', detail: detail.join(' | ') };
  }

  // -------------------------------------------------------------------------
  // 状态推送接收 → 驱动悬浮窗渲染
  // -------------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message) return;
    if (message.type === 'LEASE_BOUND') {
      receivedLeaseState = true;
      leaseId = message.leaseId;
      bound = true;
      attachActivityListeners();
      void chrome.runtime.sendMessage({ type: 'GET_LEASE_STATUS', leaseId }).catch(() => {});
    } else if (message.type === 'LEASE_STATUS') {
      receivedLeaseState = true;
      leaseId = message.leaseId;
      bound = message.status?.status === 'ACTIVE';
      if (bound) attachActivityListeners();
      config = message.config ?? config;
      globalThis.__scienceingPanel?.render({ status: message.status, config, serviceError: false });
    } else if (message.type === 'LEASE_RELEASED') {
      receivedLeaseState = true;
      leaseId = message.leaseId;
      bound = false;
      globalThis.__scienceingPanel?.render({ status: message.status ?? { status: 'RELEASED' }, config, serviceError: false });
    } else if (message.type === 'LEASE_UNBOUND') {
      receivedLeaseState = true;
      bound = false;
      leaseId = null;
      globalThis.__scienceingPanel?.render({ status: null, config, serviceError: false });
    } else if (message.type === 'LEASE_SERVICE_ERROR') {
      globalThis.__scienceingPanel?.render({ status: null, config, serviceError: true });
    } else if (message.type === 'PURGE_SESSION') {
      // 同步返回：清理是本地存储操作，没有异步 IO，没必要占住消息通道
      bound = false;
      if (sendResponse) sendResponse(purgeLocalSession());
      return false;
    }
  });

  // -------------------------------------------------------------------------
  // 初始化：查询绑定；未绑定显示提示且不监听续期（PRD §16）
  // -------------------------------------------------------------------------

  async function init() {
    try {
      const info = await chrome.runtime.sendMessage({ type: 'GET_TAB_LEASE' });
      if (receivedLeaseState) return;
      if (info && info.bound) {
        leaseId = info.leaseId;
        bound = true;
        attachActivityListeners();
        // 触发一次状态拉取，worker 会推送 LEASE_STATUS 回来驱动首帧
        void chrome.runtime.sendMessage({ type: 'GET_LEASE_STATUS', leaseId }).catch(() => {});
      } else if (!bound) {
        globalThis.__scienceingPanel?.render({ status: null, config, serviceError: false });
      }
    } catch {
      // worker 不可达：按未绑定处理，不挂 Activity 监听
      if (!receivedLeaseState) globalThis.__scienceingPanel?.render({ status: null, config, serviceError: false });
    }
  }

  void init();
})();
