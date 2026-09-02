/* global chrome, window, document, CustomEvent */

/**
 * 看板域 Content Script（document_start，早于页面脚本，避免握手竞态）。
 *
 * 与看板页面通过受控 window.postMessage 通信（PRD §10）：
 *   看板 → 扩展：{ source:'scienceing-dashboard', type:'EXTENSION_PING' }
 *   看板 → 扩展：{ source:'scienceing-dashboard', type:'BIND_AND_OPEN', leaseId, leaseToken, accountCode? }
 *   扩展 → 看板：{ source:'scienceing-extension', type:'EXTENSION_READY', version, status, minimumVersion, latestVersion }
 *   扩展 → 看板：{ source:'scienceing-extension', type:'BIND_ACK', ok, leaseId?, tabId?, error? }
 *
 * 额外提供 document 自定义事件 `scienceing:extension-ready`（detail 同 EXTENSION_READY），
 * 供看板在未实现 ping 广播时也能直接监听（二者并存，互不冲突）。
 */
(() => {
  const PAGE_SOURCE = 'scienceing-dashboard';

  let lastInfo = null;

  function post(message) {
    const targetOrigin = window.location.origin || '*';
    window.postMessage({ source: 'scienceing-extension', ...message }, targetOrigin);
  }

  function announce() {
    try {
      document.dispatchEvent(new CustomEvent('scienceing:extension-ready', { detail: lastInfo }));
    } catch {
      // 忽略自定义事件不支持场景
    }
  }

  async function queryInfo() {
    try {
      const info = await chrome.runtime.sendMessage({ type: 'EXTENSION_INFO' });
      lastInfo = info;
      announce();
      return info;
    } catch (error) {
      lastInfo = { version: '', status: 'error', minimumVersion: null, latestVersion: null, error: String(error) };
      announce();
      return lastInfo;
    }
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== PAGE_SOURCE) return;

    if (data.type === 'EXTENSION_PING') {
      const info = await queryInfo();
      post({ type: 'EXTENSION_READY', ...info });
    } else if (data.type === 'BIND_AND_OPEN') {
      try {
        const result = await chrome.runtime.sendMessage({
          type: 'BIND_AND_OPEN',
          leaseId: data.leaseId,
          leaseToken: data.leaseToken,
          accountCode: data.accountCode,
        });
        post({ type: 'BIND_ACK', ok: true, ...result });
      } catch (error) {
        post({ type: 'BIND_ACK', ok: false, error: String(error) });
      }
    }
  });

  // 主动探测一次：让看板无论是否实现 ping 广播都能感知扩展（PRODUCT-DESIGN §5.1 插件状态条）。
  void queryInfo();
})();
