/* global chrome, window */

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
  let config = { warningSeconds: 300, criticalWarningSeconds: 60, inactivityTimeoutSeconds: 1800 };

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
    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, onActivity, { passive: true, capture: true });
    }
  }

  // -------------------------------------------------------------------------
  // 状态推送接收 → 驱动悬浮窗渲染
  // -------------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((message) => {
    if (!message) return;
    if (message.type === 'LEASE_STATUS') {
      leaseId = message.leaseId;
      bound = true;
      config = message.config ?? config;
      globalThis.__scienceingPanel?.render({ status: message.status, config, serviceError: false });
    } else if (message.type === 'LEASE_RELEASED') {
      leaseId = message.leaseId;
      bound = true;
      globalThis.__scienceingPanel?.render({ status: message.status ?? { status: 'RELEASED' }, config, serviceError: false });
    } else if (message.type === 'LEASE_SERVICE_ERROR') {
      globalThis.__scienceingPanel?.render({ status: null, config, serviceError: true });
    }
  });

  // -------------------------------------------------------------------------
  // 初始化：查询绑定；未绑定显示提示且不监听续期（PRD §16）
  // -------------------------------------------------------------------------

  async function init() {
    try {
      const info = await chrome.runtime.sendMessage({ type: 'GET_TAB_LEASE' });
      if (info && info.bound) {
        leaseId = info.leaseId;
        bound = true;
        attachActivityListeners();
        // 触发一次状态拉取，worker 会推送 LEASE_STATUS 回来驱动首帧
        void chrome.runtime.sendMessage({ type: 'GET_LEASE_STATUS', leaseId }).catch(() => {});
      } else {
        globalThis.__scienceingPanel?.render({ status: null, config, serviceError: false });
      }
    } catch {
      // worker 不可达：按未绑定处理，不挂 Activity 监听
      globalThis.__scienceingPanel?.render({ status: null, config, serviceError: false });
    }
  }

  void init();
})();
