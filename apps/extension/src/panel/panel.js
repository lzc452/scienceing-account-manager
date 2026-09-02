/* global chrome, document, setInterval */

/**
 * 科应页面 Shadow DOM 悬浮窗（PRODUCT-DESIGN §7，PRD §20/§21/§44）。
 *
 * 以经典脚本形式与 scienceing content script 注入同一隔离世界（manifest content_scripts
 * 的 js 数组按序注入），通过 globalThis.__scienceingPanel 暴露 render(payload)。
 *
 * 五态（§7.3）：① 正常（蓝点）② 警告（琥珀 soft，≥25min 无操作）③ 临界（琥珀，弹一次 Modal）
 * ④ 已释放（灰 outline）⑤ 连接异常（琥珀，冻结本地倒计时）；另有未绑定提示（PRD §16）。
 *
 * 行为规则（§7.4）：
 * - 倒计时数据源仅后端 expiresAt，本地只做渲染；连接异常时冻结。
 * - 悬浮窗/Modal 内交互不产生 Activity（由 scienceing content script 通过 composedPath 排除本 host）。
 * - 折叠记忆存 chrome.storage.session。
 * - 中文字体用系统 CJK 回退，不加载字体文件；tabular-nums 对齐时间。
 */
(() => {
  const HOST_ID = '__scienceing_account_assistant__';
  const STORAGE_KEY = 'panelCollapsed';

  // §4.1 语义色（十六进制内嵌，与主站同源；悬浮窗不依赖 Tailwind 运行时）
  const C = {
    blue: '#2563eb', blueBg: '#eff6ff', blueText: '#1d4ed8',
    amber: '#d97706', amberBg: '#fffbeb', amberText: '#b45309',
    gray: '#737373',
    ink: '#171717', mid: '#525252', faint: '#a3a3a3',
    border: '#e5e5e5', canvas: '#ffffff', ember: '#e7000b',
  };

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif; }
    .host { position: fixed; right: 16px; bottom: 16px; z-index: 2147483646; width: 280px; font-size: 12px; line-height: 1.5; color: ${C.ink}; }
    .card { background: ${C.canvas}; border: 1px solid ${C.border}; border-radius: 24px; box-shadow: 0 6px 24px rgba(0,0,0,0.08); padding: 16px; }
    .pill { display: flex; align-items: center; gap: 8px; height: 36px; border-radius: 18px; background: ${C.canvas}; border: 1px solid ${C.border}; padding: 0 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); cursor: pointer; user-select: none; }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
    .dot.hollow { background: transparent; border: 1.5px solid currentColor; }
    .badge { display: inline-flex; align-items: center; gap: 4px; border-radius: 999px; padding: 2px 8px; font-size: 11px; font-weight: 500; white-space: nowrap; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
    .title { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; color: ${C.ink}; }
    .collapse { cursor: pointer; border: 0; background: transparent; color: ${C.faint}; font-size: 14px; line-height: 1; padding: 2px 4px; }
    .code { font-size: 16px; font-weight: 600; letter-spacing: 0.2px; margin: 2px 0; }
    .divider { height: 1px; background: ${C.border}; margin: 10px 0; }
    .row { display: flex; align-items: center; justify-content: space-between; padding: 2px 0; }
    .row .k { color: ${C.mid}; }
    .row .v { font-variant-numeric: tabular-nums; font-weight: 500; }
    .progress { height: 4px; border-radius: 2px; background: ${C.border}; margin: 10px 0 12px; overflow: hidden; }
    .progress > i { display: block; height: 100%; border-radius: 2px; background: ${C.blue}; width: 100%; }
    .progress.warn > i { background: ${C.amber}; }
    .actions { display: flex; justify-content: flex-end; }
    .btn { border: 1px solid ${C.ink}; background: ${C.ink}; color: #fff; border-radius: 18px; height: 32px; padding: 0 14px; font-size: 12px; font-weight: 500; cursor: pointer; }
    .btn.ghost { background: transparent; color: ${C.ink}; border-color: ${C.border}; }
    .btn.danger { background: ${C.ember}; border-color: ${C.ember}; }
    .notice { display: flex; flex-direction: column; gap: 6px; }
    .notice .big { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .notice .cap { color: ${C.mid}; }
    .modal { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.32); }
    .modal .box { width: 288px; background: ${C.canvas}; border-radius: 24px; padding: 18px; box-shadow: 0 12px 40px rgba(0,0,0,0.16); }
    .modal .big { font-size: 16px; font-weight: 600; margin-bottom: 6px; }
    .modal .cap { color: ${C.mid}; margin-bottom: 14px; }
    .modal .row { display: flex; gap: 8px; justify-content: flex-end; }
  `;

  let host = null;
  let root = null;
  let wrapper = null;
  let collapsed = false;
  let status = null;
  let config = { warningSeconds: 300, criticalWarningSeconds: 60 };
  let serviceError = false;
  let state = 'unbound';
  let criticalShown = false;
  let modalOpen = false;
  let tickTimer = null;

  // -------------------------------------------------------------------------
  // 状态推导（倒计时仅来自后端 expiresAt；连接异常时冻结）
  // -------------------------------------------------------------------------

  function remainingSeconds() {
    if (!status || !status.expiresAt) return 0;
    return Math.max(0, Math.floor((new Date(status.expiresAt).getTime() - Date.now()) / 1000));
  }

  function idleSeconds() {
    if (!status || !status.lastActivityAt) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(status.lastActivityAt).getTime()) / 1000));
  }

  function deriveState() {
    if (serviceError) return 'error';
    if (!status) return 'unbound';
    const s = String(status.status || '').toUpperCase();
    if (s !== 'ACTIVE') return 'released';
    const remaining = remainingSeconds();
    if (remaining <= 0) return 'released';
    const critical = Number(config.criticalWarningSeconds ?? 60);
    const warning = Number(config.warningSeconds ?? 300);
    if (remaining <= critical) return 'critical';
    if (remaining <= warning) return 'warning';
    return 'normal';
  }

  function mmss(total) {
    const s = Math.max(0, Math.floor(total ?? 0));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  function dotColor() {
    if (state === 'normal') return C.blue;
    if (state === 'released') return C.gray;
    return C.amber; // warning / critical / error / unbound
  }

  function softBadge(text, bg, fg) {
    return `<span class="badge" style="background:${bg};color:${fg}">${esc(text)}</span>`;
  }

  // -------------------------------------------------------------------------
  // 视图渲染
  // -------------------------------------------------------------------------

  function buildView() {
    if (collapsed && (state === 'normal' || state === 'warning' || state === 'critical')) {
      return `<div class="pill" data-action="toggle">
        <span class="dot" style="background:${dotColor()}"></span>
        <span style="font-weight:500;flex:none">${esc(status?.accountCode ?? '—')}</span>
        <span style="flex:1"></span>
        <span id="sci-pill-cd" style="font-variant-numeric:tabular-nums;color:${C.mid}">${mmss(remainingSeconds())}</span>
        <span style="color:${C.faint}">▸</span>
      </div>`;
    }

    if (state === 'unbound') {
      return `<div class="card">
        <div class="head"><div class="title"><span class="dot" style="background:${C.amber}"></span>科应共享账号</div></div>
        <div class="notice">
          <div class="badge" style="background:${C.amberBg};color:${C.amberText}">未绑定租约</div>
          <div class="cap">当前科应页面未与账号租约绑定，请从「科应账号看板」重新打开。</div>
        </div>
      </div>`;
    }

    if (state === 'released') {
      return `<div class="card">
        <div class="head"><div class="title"><span class="dot hollow" style="color:${C.gray}"></span>账号已自动释放</div></div>
        <div class="cap" style="color:${C.mid}">${esc(status?.accountCode ?? '')} 已重新进入账号池</div>
        <div class="divider"></div>
        <div class="actions"><button class="btn" data-action="dashboard">返回看板</button></div>
      </div>`;
    }

    if (state === 'error') {
      return `<div class="card">
        <div class="head"><div class="title"><span class="dot" style="background:${C.amber}"></span>科应共享账号</div></div>
        <div class="notice">
          ${softBadge('账号管理服务连接异常', C.amberBg, C.amberText)}
          <div class="cap">已有租约不受影响，恢复后将按最后活动时间计算。</div>
        </div>
      </div>`;
    }

    if (state === 'warning' || state === 'critical') {
      const label = state === 'critical' ? '科应账号即将自动释放' : '已连续 25 分钟无操作';
      return `<div class="card">
        <div class="head"><div class="title"><span class="dot" style="background:${C.amber}"></span>科应共享账号</div>
          <button class="collapse" data-action="toggle">−</button></div>
        <div class="notice">
          ${softBadge(label, C.amberBg, C.amberText)}
          <div class="big">${mmss(remainingSeconds())} 后自动释放</div>
          <div class="cap">继续操作科应页面即可保持使用。</div>
        </div>
      </div>`;
    }

    // ① 正常（ACTIVE）
    const progressClass = state === 'warning' || state === 'critical' ? ' warn' : '';
    return `<div class="card">
      <div class="head">
        <div class="title"><span class="dot" style="background:${C.blue}"></span>科应共享账号</div>
        <button class="collapse" data-action="toggle">−</button>
      </div>
      <div class="code">${esc(status?.accountCode ?? '')}</div>
      ${softBadge('使用中', C.blueBg, C.blueText)}
      <div class="divider"></div>
      <div class="row"><span class="k">无操作</span><span class="v" id="sci-idle">${mmss(idleSeconds())}</span></div>
      <div class="row"><span class="k">预计释放</span><span class="v" id="sci-countdown">${mmss(remainingSeconds())}</span></div>
      <div class="progress${progressClass}"><i id="sci-progress" style="width:${progressRatio()}%"></i></div>
      <div class="actions"><button class="btn" data-action="release">立即归还</button></div>
    </div>`;
  }

  function progressRatio() {
    if (!status || !status.expiresAt || !status.lastActivityAt) return 100;
    const totalMs = new Date(status.expiresAt).getTime() - new Date(status.lastActivityAt).getTime();
    if (!(totalMs > 0)) return 0;
    return Math.max(0, Math.min(100, Math.round((remainingSeconds() * 1000 / totalMs) * 100)));
  }

  function render() {
    const newState = deriveState();
    const showCritical = newState === 'critical' && !criticalShown;
    state = newState;

    if (showCritical) criticalShown = true;
    if (newState !== 'critical') criticalShown = false;

    if (!modalOpen) wrapper.innerHTML = buildView();
    if (showCritical && !modalOpen) showCriticalModal();
  }

  function updateDynamic() {
    if (serviceError) return; // 连接异常冻结本地倒计时（§7.4）
    const idleEl = wrapper.querySelector('#sci-idle');
    const cdEl = wrapper.querySelector('#sci-countdown');
    const pillCdEl = wrapper.querySelector('#sci-pill-cd');
    const pEl = wrapper.querySelector('#sci-progress');
    if (idleEl) idleEl.textContent = mmss(idleSeconds());
    if (cdEl) cdEl.textContent = mmss(remainingSeconds());
    if (pillCdEl) pillCdEl.textContent = mmss(remainingSeconds());
    if (pEl) pEl.style.width = `${progressRatio()}%`;
  }

  function tick() {
    const newState = deriveState();
    if (newState !== state) {
      render();
      return;
    }
    updateDynamic();
  }

  // -------------------------------------------------------------------------
  // 临界弹窗（弹一次）/ 归还确认弹窗
  // -------------------------------------------------------------------------

  function showCriticalModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="box">
      <div class="big">⚠ 科应账号即将自动释放</div>
      <div class="cap">已连续 29 分钟无操作，${mmss(remainingSeconds())} 后自动释放。继续操作页面即可保持使用。</div>
      <div class="row">
        <button class="btn ghost" data-act="dismiss">继续使用</button>
        <button class="btn" data-act="release">立即归还</button>
      </div>
    </div>`;
    wrapper.appendChild(modal);
    modalOpen = true;
    modal.addEventListener('click', (e) => {
      const act = e.target?.closest?.('[data-act]')?.dataset?.act;
      if (act === 'dismiss') {
        modalOpen = false;
        modal.remove();
        render();
      } else if (act === 'release') {
        modalOpen = false;
        modal.remove();
        openDashboard('/my');
        render();
      }
    });
  }

  function showReleaseConfirm() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="box">
      <div class="big">归还科应账号？</div>
      <div class="cap">归还后将重置密码并退出当前会话。</div>
      <div class="row">
        <button class="btn ghost" data-act="cancel">取消</button>
        <button class="btn danger" data-act="confirm">确认归还</button>
      </div>
    </div>`;
    wrapper.appendChild(modal);
    modalOpen = true;
    modal.addEventListener('click', (e) => {
      const act = e.target?.closest?.('[data-act]')?.dataset?.act;
      if (act === 'cancel') {
        modalOpen = false;
        modal.remove();
        render();
      } else if (act === 'confirm') {
        modalOpen = false;
        modal.remove();
        openDashboard('/my');
        render();
      }
    });
  }

  function openDashboard(path) {
    void chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD', path }).catch(() => {});
  }

  // -------------------------------------------------------------------------
  // 挂载 + 事件委托
  // -------------------------------------------------------------------------

  function onClick(event) {
    const el = event.target?.closest?.('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'toggle') {
      collapsed = !collapsed;
      try {
        if (chrome.storage?.session) void chrome.storage.session.set({ [STORAGE_KEY]: collapsed });
      } catch {
        // 忽略
      }
      render();
    } else if (action === 'release') {
      showReleaseConfirm();
    } else if (action === 'dashboard') {
      openDashboard('/');
    }
  }

  async function mount() {
    if (host) return;
    host = document.createElement('div');
    host.id = HOST_ID;
    root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);
    wrapper = document.createElement('div');
    wrapper.className = 'host';
    root.appendChild(wrapper);
    (document.body || document.documentElement).appendChild(host);
    root.addEventListener('click', onClick);

    try {
      const data = await chrome.storage?.session?.get([STORAGE_KEY]);
      collapsed = Boolean(data?.[STORAGE_KEY]);
    } catch {
      collapsed = false;
    }

    if (!tickTimer) tickTimer = setInterval(tick, 1000);
  }

  // 供 scienceing content script 调用（manifest 按序注入同一隔离世界）
  globalThis.__scienceingPanel = {
    async render(payload) {
      status = payload?.status ?? status;
      config = payload?.config ?? config;
      serviceError = Boolean(payload?.serviceError);
      await mount();
      render();
    },
  };
})();
