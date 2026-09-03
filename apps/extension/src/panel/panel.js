/* global chrome, document, setInterval */

/**
 * 科应页面 Shadow DOM 悬浮窗（PRODUCT-DESIGN §7，PRD §20/§21/§44）。
 *
 * 以经典脚本形式与 scienceing content script 注入同一隔离世界（manifest content_scripts
 * 的 js 数组按序注入），通过 globalThis.__scienceingPanel 暴露 render(payload)。
 *
 * 缩小面板（本次改造）：
 * - 默认形态为 48×48 白色圆角面板（radius 10px），仅显示「预计释放时间环」，不再遮挡操作区。
 * - 环形逆时针倒计时，环内居中文字「释放时间」（8px）。
 * - 环色随剩余时间变化（阈值由后端 config 下发，管理员可在系统设置调整）：
 *   绿 = 距释放仍 > 即将释放提醒（warningSeconds）/ 黄 = 临界提醒前 / 红 = 临界提醒内（criticalWarningSeconds）。
 * - 环满刻度 = 整个无操作超时租期（inactivityTimeoutSeconds，默认 30min，后端下发，不再本地硬编码）。
 * - 点击面板展开小型浮层（账号 + 预计释放 + 立即归还 / 返回看板），避免常态化遮挡。
 * - 0–1min 自动弹出提醒弹窗（含实时倒计时）：继续使用 / 立即归还；倒计时归零后弹窗切换为
 *   已释放态，仅保留「返回看板」按钮。
 *
 * 行为规则（§7.4）：
 * - 倒计时数据源仅后端 expiresAt，本地只做渲染；连接异常时冻结本地倒计时（§7.4）。
 * - 悬浮窗交互不产生 Activity（scienceing content script 通过 composedPath 排除本 host）。
 * - 中文字体用系统 CJK 回退，不加载字体文件；tabular-nums 对齐时间。
 */

(() => {
  const HOST_ID = '__scienceing_account_assistant__';

  // 环色（语义色，与主站同源；悬浮窗不依赖 Tailwind 运行时）
  const COLORS = {
    green:  { ring: '#16a34a', label: '#15803d' },
    amber:  { ring: '#f59e0b', label: '#b45309' },
    red:    { ring: '#ef4444', label: '#dc2626' },
    gray:   { ring: '#d4d4d4', label: '#737373' },
  };

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif; }
    .host { position: fixed; z-index: 2147483646; font-size: 12px; line-height: 1.5; color: #171717; }
    .ring-host { position: relative; width: 48px; height: 48px; background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,0.10); display: flex; align-items: center; justify-content: center; cursor: grab; user-select: none; touch-action: none; }
    .ring-host.dragging { cursor: grabbing; }
    .ring { position: absolute; inset: 0; width: 48px; height: 48px; pointer-events: none; }
    .ring .track { fill: none; stroke: #ececec; stroke-width: 3.5; }
    .ring .prog { fill: none; stroke-width: 3.5; stroke-linecap: round; transition: stroke 0.3s ease; }
    .ring-label { position: relative; font-size: 8px; line-height: 1; font-weight: 600; letter-spacing: 0; pointer-events: none; }
    .popover { position: absolute; right: 0; bottom: 56px; width: 216px; background: #fff; border: 1px solid #e5e5e5; border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.12); padding: 14px; }
    .popover .ttl { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; margin-bottom: 8px; }
    .popover .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
    .popover .code { font-size: 15px; font-weight: 600; letter-spacing: 0.3px; margin-bottom: 6px; }
    .popover .row { display: flex; align-items: center; justify-content: space-between; padding: 3px 0; }
    .popover .k { color: #737373; font-size: 11px; }
    .popover .v { font-variant-numeric: tabular-nums; font-weight: 600; font-size: 12px; }
    .popover .acts { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
    .btn { border: 1px solid #171717; background: #171717; color: #fff; border-radius: 18px; height: 32px; padding: 0 14px; font-size: 12px; font-weight: 500; cursor: pointer; }
    .btn.ghost { background: transparent; color: #171717; border-color: #e5e5e5; }
    .btn.danger { background: #e7000b; border-color: #e7000b; }
    .modal { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.32); }
    .modal .box { width: 288px; background: #fff; border-radius: 24px; padding: 18px; box-shadow: 0 12px 40px rgba(0,0,0,0.16); }
    .modal .big { font-size: 16px; font-weight: 600; margin-bottom: 6px; }
    .modal .cap { color: #525252; margin-bottom: 14px; }
    .modal .cap b { font-variant-numeric: tabular-nums; }
    .modal .row { display: flex; gap: 8px; justify-content: flex-end; }
  `;

  let host = null;
  let root = null;
  let wrapper = null;
  let modalEl = null;
  let status = null;
  let config = { warningSeconds: 300, criticalWarningSeconds: 60, inactivityTimeoutSeconds: 1800 };
  let serviceError = false;
  let state = 'unbound';
  let expanded = false;
  let criticalShown = false;
  let modalMode = null; // null | 'critical' | 'released' | 'confirm'
  let tickTimer = null;
  let pos = null; // { x, y } 面板位置（拖拽）
  let dragStart = null; // { x, y, px, py }
  let dragMoved = false;

  const RING_MAX_SECONDS = 1800; // 默认刻度上限（无配置/非法配置时兜底 = 30min；实际值由 config.inactivityTimeoutSeconds 下发）

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

  function isActive() {
    return state === 'normal' || state === 'warning' || state === 'critical';
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
    if (state === 'normal') return COLORS.green.ring;
    if (state === 'released') return COLORS.gray.ring;
    if (state === 'error') return COLORS.amber.ring;
    return COLORS.amber.ring; // warning / critical / unbound
  }

  // 环满刻度 = 当前租期的无操作超时（管理员配置，经 /api/extension/config 随 LEASE_STATUS 推送）
  function ringMaxSeconds() {
    const v = Number(config.inactivityTimeoutSeconds);
    return Number.isFinite(v) && v > 0 ? v : RING_MAX_SECONDS;
  }

  // 环色与状态机 deriveState 同源（绿/黄/红 均按后端下发的 config 阈值切换）；非活跃态用灰/琥珀
  function ringColors(remaining) {
    if (state === 'released' || state === 'unbound') return COLORS.gray;
    if (state === 'error') return COLORS.amber;
    const warning = Number(config.warningSeconds ?? 300);
    const critical = Number(config.criticalWarningSeconds ?? 60);
    if (remaining >= warning) return COLORS.green;
    if (remaining >= critical) return COLORS.amber;
    return COLORS.red;
  }

  function ringRatio(remaining) {
    if (remaining <= 0) return 0;
    return Math.max(0, Math.min(1, remaining / ringMaxSeconds()));
  }

  // 逆时针环形路径（sweep-flag=0 = 屏幕坐标系下逆时针）。ratio=1 画整圆。
  function ringPath(ratio) {
    const cx = 24, cy = 24, r = 19;
    if (ratio >= 0.9999) {
      return `M ${cx} ${(cy - r).toFixed(2)} A ${r} ${r} 0 1 0 ${cx} ${(cy + r).toFixed(2)} A ${r} ${r} 0 1 0 ${cx} ${(cy - r).toFixed(2)} Z`;
    }
    if (ratio <= 0.0001) return '';
    const angle = ratio * 2 * Math.PI; // 自顶部逆时针展开
    const x = cx - r * Math.sin(angle);
    const y = cy - r * Math.cos(angle);
    const largeArc = ratio > 0.5 ? 1 : 0;
    return `M ${cx} ${(cy - r).toFixed(2)} A ${r} ${r} 0 ${largeArc} 0 ${x.toFixed(2)} ${y.toFixed(2)}`;
  }

  // -------------------------------------------------------------------------
  // 视图渲染
  // -------------------------------------------------------------------------

  function ringSvg(progD, progColor, labelText, labelColor) {
    return `<div class="ring-host" title="拖拽移动 · 点击查看使用中信息" role="button" tabindex="0" aria-label="科应账号倒计时 ${esc(labelText)}，拖拽可移动位置，点击查看使用中信息">
      <svg class="ring" viewBox="0 0 48 48" aria-hidden="true">
        <circle class="track" cx="24" cy="24" r="19"></circle>
        <path id="sci-ring" class="prog" d="${progD}" style="stroke:${progColor}"></path>
      </svg>
      <span class="ring-label" id="sci-ring-text" style="color:${labelColor}">${esc(labelText)}</span>
    </div>`;
  }

  function popoverHtml() {
    if (!status) return '';
    const c = ringColors(remainingSeconds());
    return `<div class="popover" role="dialog" aria-label="科应账号详情">
      <div class="ttl"><span class="dot" style="background:${dotColor()}"></span>科应共享账号</div>
      <div class="code">${esc(status.accountCode ?? '—')}</div>
      <div class="row"><span class="k">状态</span><span class="v">使用中 · ACTIVE</span></div>
      <div class="row"><span class="k">无操作</span><span class="v" id="sci-exp-idle">${mmss(idleSeconds())}</span></div>
      <div class="row"><span class="k">预计释放</span><span class="v" id="sci-exp-cd">${mmss(remainingSeconds())}</span></div>
      <div class="acts">
        <button class="btn ghost" data-action="dashboard">返回看板</button>
        <button class="btn danger" data-action="release">立即归还</button>
      </div>
    </div>`;
  }

  function buildView() {
    let ringHtml;
    if (state === 'unbound') {
      ringHtml = ringSvg('', COLORS.gray.ring, '未绑', COLORS.gray.label);
    } else if (state === 'error') {
      ringHtml = ringSvg(ringPath(1), COLORS.amber.ring, '异常', COLORS.amber.label);
    } else if (state === 'released') {
      ringHtml = ringSvg('', COLORS.gray.ring, '已释放', COLORS.gray.label);
    } else {
      // ① 正常 / ② 警告 / ③ 临界：活性态，环色按剩余时间
      const remaining = remainingSeconds();
      const c = ringColors(remaining);
      ringHtml = ringSvg(ringPath(ringRatio(remaining)), c.ring, '释放', c.label);
    }

    const isActive = state === 'normal' || state === 'warning' || state === 'critical';
    const pop = expanded && isActive ? popoverHtml() : '';
    return ringHtml + pop;
  }

  function render() {
    const newState = deriveState();
    const prev = state;
    state = newState;

    // 离开临界/已释放后，允许下次再弹临界提醒
    if (newState !== 'critical' && newState !== 'released') criticalShown = false;

    // 弹窗状态机
    if (newState === 'critical' && !criticalShown && modalMode !== 'released' && modalMode !== 'confirm') {
      criticalShown = true;
      openModal('critical');
    } else if (newState === 'released' && modalMode !== 'released') {
      openModal('released');
    }

    wrapper.innerHTML = buildView();
    updateDynamic();
  }

  function updateRing() {
    if (state === 'error') return; // 连接异常冻结本地倒计时（§7.4）
    const progEl = wrapper.querySelector('#sci-ring');
    const labelEl = wrapper.querySelector('#sci-ring-text');
    if (!progEl && !labelEl) return;
    const remaining = remainingSeconds();
    const c = ringColors(remaining);
    const d = ringPath(ringRatio(remaining));
    if (progEl) { progEl.setAttribute('d', d); progEl.style.stroke = c.ring; }
    if (labelEl) labelEl.style.color = c.label;
  }

  function updateDynamic() {
    updateRing();
    const expCd = wrapper.querySelector('#sci-exp-cd');
    if (expCd) expCd.textContent = mmss(remainingSeconds());
    const expIdle = wrapper.querySelector('#sci-exp-idle');
    if (expIdle) expIdle.textContent = mmss(idleSeconds());
    if (modalMode === 'critical') {
      const mcd = modalEl?.querySelector('#sci-modal-cd');
      if (mcd) mcd.textContent = mmss(remainingSeconds());
    }
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
  // 弹窗（临界提醒 / 已释放 / 归还确认）
  // -------------------------------------------------------------------------

  function modalMarkup(mode) {
    if (mode === 'critical') {
      return `<div class="box">
        <div class="big">⚠ 科应账号即将自动释放</div>
        <div class="cap">预计 <b id="sci-modal-cd">${mmss(remainingSeconds())}</b> 后自动释放。继续操作科应页面即可保持使用。</div>
        <div class="row">
          <button class="btn ghost" data-act="dismiss">继续使用</button>
          <button class="btn danger" data-act="release">立即归还</button>
        </div>
      </div>`;
    }
    if (mode === 'released') {
      return `<div class="box">
        <div class="big">账号已自动释放</div>
        <div class="cap">释放时间已到，账号已重新进入账号池。</div>
        <div class="row">
          <button class="btn" data-act="dashboard">返回看板</button>
        </div>
      </div>`;
    }
    // confirm
    return `<div class="box">
      <div class="big">归还科应账号？</div>
      <div class="cap">归还后将重置密码并退出当前会话。</div>
      <div class="row">
        <button class="btn ghost" data-act="cancel">取消</button>
        <button class="btn danger" data-act="confirm">确认归还</button>
      </div>
    </div>`;
  }

  function openModal(mode) {
    modalMode = mode;
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.className = 'modal';
      root.appendChild(modalEl);
      modalEl.addEventListener('click', onModalClick);
    }
    modalEl.innerHTML = modalMarkup(mode);
  }

  function closeModal() {
    modalMode = null;
    if (modalEl) { modalEl.remove(); modalEl = null; }
  }

  function onModalClick(event) {
    const act = event.target?.closest?.('[data-act]')?.dataset?.act;
    if (!act) return;
    if (act === 'dismiss') {
      // 继续使用：关闭提醒（criticalShown 保持，避免重复弹出）
      closeModal();
    } else if (act === 'release') {
      // 立即归还：进入确认弹窗
      openModal('confirm');
    } else if (act === 'cancel') {
      closeModal();
    } else if (act === 'confirm') {
      closeModal();
      openDashboard('/my');
    } else if (act === 'dashboard') {
      closeModal();
      openDashboard('/');
    }
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
    if (action === 'release') {
      openModal('confirm');
    } else if (action === 'dashboard') {
      openDashboard('/');
    }
  }

  // -------------------------------------------------------------------------
  // 拖拽 + 位置持久化（点击/回车切换信息浮层；拖拽移动不触发切换）
  // -------------------------------------------------------------------------

  function applyPos() {
    if (!wrapper || !pos) return;
    wrapper.style.left = pos.x + 'px';
    wrapper.style.top = pos.y + 'px';
    wrapper.style.right = 'auto';
    wrapper.style.bottom = 'auto';
  }

  async function loadPos() {
    try {
      const d = await chrome.storage?.session?.get(['panelPos']);
      return d?.panelPos ?? null;
    } catch {
      return null;
    }
  }

  function savePos(p) {
    try { void chrome.storage?.session?.set({ panelPos: p }); } catch { /* 忽略 */ }
  }

  function togglePanel() {
    if (!isActive()) { expanded = false; return; }
    expanded = !expanded;
    wrapper.innerHTML = buildView();
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    const hostEl = e.target?.closest?.('.ring-host');
    if (!hostEl) return;
    if (e.target?.closest?.('[data-action]')) return; // 浮层按钮不触发拖拽
    dragStart = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    dragMoved = false;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  }

  function onPointerMove(e) {
    if (!dragStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (!dragMoved && Math.hypot(dx, dy) > 4) {
      dragMoved = true;
      wrapper.classList.add('dragging');
    }
    if (dragMoved) {
      const w = 48, h = 48;
      let nx = dragStart.px + dx;
      let ny = dragStart.py + dy;
      nx = Math.max(0, Math.min(window.innerWidth - w, nx));
      ny = Math.max(0, Math.min(window.innerHeight - h, ny));
      pos.x = nx; pos.y = ny;
      applyPos();
    }
  }

  function onPointerUp() {
    window.removeEventListener('pointermove', onPointerMove);
    const moved = dragMoved;
    dragStart = null;
    dragMoved = false;
    wrapper.classList.remove('dragging');
    if (!moved) togglePanel(); // 未移动 = 点击
    else savePos(pos); // 拖拽结束持久化位置
  }

  function onRingKey(e) {
    const hostEl = e.target?.closest?.('.ring-host');
    if (!hostEl) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      togglePanel();
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
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('keydown', onRingKey);

    pos = await loadPos();
    if (!pos) pos = { x: window.innerWidth - 48 - 16, y: window.innerHeight - 48 - 16 };
    applyPos();

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
