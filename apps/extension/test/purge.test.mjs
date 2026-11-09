/* global setImmediate, AbortController, process, console */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { URL } from 'node:url';
import * as config from '../src/lib/config.js';
import * as purge from '../src/lib/purge.js';
import { compareVersions } from '../src/lib/version.js';
import { claimLeaseThroughExtension } from '../src/lib/claim.js';
import { needsSessionPurge, buildPurgeDetail } from '../src/lib/purge.js';

const background = readFileSync(new URL('../src/background.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from '[^']+';\r?\n/gm, '');
const flush = () => new Promise((done) => setImmediate(done));
/** 清理链路里有 5~8 个 await，固定 flush 次数不够稳定，统一排空微任务队列。 */
const settle = async (times = 30) => { for (let i = 0; i < times; i += 1) await flush(); };
const clone = (value) => JSON.parse(JSON.stringify(value));
const sender = (id, url = 'https://www.scienceing.com/knowledge') => ({ tab: { id, url }, url });

const initialState = () => ({
  tabLease: { 10: { leaseId: 7, accountCode: 'KY-03' } },
  leases: { 7: { leaseId: 7, leaseToken: 'lease-token', accountCode: 'KY-03' } },
});

/**
 * 构造 worker 运行环境。
 * `pageReply` 是内容脚本对 PURGE_SESSION 的应答；传 null 表示标签页不可达。
 */
function worker({
  stored = initialState(),
  pageReply = { ok: true, method: 'PAGE', detail: 'localStorage cleared(3) | remain=0' },
  browsingDataError = null,
  overrideFetch,
} = {}) {
  const events = {};
  const event = (name) => ({ addListener: (fn) => { events[name] = fn; } });
  const messages = [];
  const requests = [];
  const reloaded = [];
  const browsingDataCalls = [];
  const state = { stored: clone(stored), status: 'ACTIVE', recycleMode: 'PURGE' };

  const fetch = async (url, options = {}) => {
    requests.push({ url, options });
    const overridden = overrideFetch?.(url, options);
    if (overridden) return overridden;
    let data;
    if (url.endsWith('/extension/config')) data = { minimumVersion: '1.0.0', latestVersion: '1.5.0' };
    else if (url.endsWith('/activity')) data = { result: 'ACTIVE' };
    else if (url.includes('/recycle-ack')) data = { ok: true, alreadyDone: false, accountStatus: 'AVAILABLE' };
    else data = { status: state.status, accountCode: 'KY-03', recycleMode: state.recycleMode };
    return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
  };

  const chrome = {
    storage: {
      session: {
        get: async () => clone(state.stored),
        set: async (value) => { Object.assign(state.stored, clone(value)); },
      },
    },
    runtime: {
      id: 'abcdefghijklmnopabcdefghijklmnop',
      getManifest: () => ({ version: '1.5.0' }),
      onMessage: event('message'),
    },
    tabs: {
      onCreated: event('created'),
      onUpdated: event('updated'),
      onRemoved: event('removed'),
      sendMessage: async (id, message) => {
        messages.push({ id, message: clone(message) });
        if (message?.type === 'PURGE_SESSION') return pageReply;
        return undefined;
      },
      create: async () => ({ id: 99 }),
      reload: async (id) => { reloaded.push(id); },
    },
    browsingData: {
      remove: async (options, types) => {
        browsingDataCalls.push({ options: clone(options), types: clone(types) });
        if (browsingDataError) throw new Error(browsingDataError);
      },
    },
  };

  const context = vm.createContext({
    // background.js 的 import 已被剥离，所有依赖必须显式注入；
    // 少注入一个就会在运行到该分支时抛 TypeError（只在特定用例里暴露）。
    ...config, ...purge, compareVersions, claimLeaseThroughExtension, chrome, fetch, URL, AbortController,
    console: {
      log: (...args) => { if (process.env.PURGE_DEBUG) console.error('[bg]', ...args); },
      warn: (...args) => { if (process.env.PURGE_DEBUG) console.error('[bg warn]', ...args); },
    },
    setTimeout: (fn) => ({ fn }),
    clearTimeout: () => {},
    setInterval: (fn) => { events.poll = fn; return 100; },
  });
  vm.runInContext(background, context);
  const request = (message, from = sender(10)) => new Promise((resolve) => {
    events.message(message, from, (result) => resolve(clone(result)));
  });
  return { state, events, messages, requests, reloaded, browsingDataCalls, request };
}

// ---------------------------------------------------------------------------
// 判定与文本拼装（纯函数）
// ---------------------------------------------------------------------------

test('needsSessionPurge：只有 RECYCLING + PURGE 才清理', () => {
  assert.equal(needsSessionPurge({ status: 'RECYCLING', recycleMode: 'PURGE' }), true);
  assert.equal(needsSessionPurge({ status: 'RECYCLING', recycleMode: 'ROTATE' }), false);
  assert.equal(needsSessionPurge({ status: 'RECYCLING' }), false, '缺 recycleMode 时按 ROTATE 处理');
  assert.equal(needsSessionPurge({ status: 'ACTIVE', recycleMode: 'PURGE' }), false);
  // RELEASED 是终态：服务端早已收尾，再发回执会把已归档的租约重新拉回流程
  assert.equal(needsSessionPurge({ status: 'RELEASED', recycleMode: 'PURGE' }), false);
  assert.equal(needsSessionPurge(null), false);
});

test('buildPurgeDetail：压成单行、跳过空值、超长截断', () => {
  assert.equal(buildPurgeDetail(['a', null, '', 'b']), 'a | b');
  assert.equal(buildPurgeDetail(['line1\nline2']), 'line1 line2');
  const long = buildPurgeDetail(['x'.repeat(500)], 20);
  assert.equal(long.length, 21, '截断后应带省略号');
  assert.ok(long.endsWith('…'));
});

// ---------------------------------------------------------------------------
// 端到端（worker 行为）
// ---------------------------------------------------------------------------

test('收到 RECYCLING + PURGE：先让页面清理，再回执 PAGE 并重载', async () => {
  const h = worker();
  h.state.status = 'RECYCLING';
  h.state.recycleMode = 'PURGE';

  await h.events.poll();
  await settle();

  const purgeMsg = h.messages.find((m) => m.message.type === 'PURGE_SESSION');
  assert.ok(purgeMsg, '必须向绑定标签页下发清理指令');
  assert.equal(purgeMsg.id, 10);

  const ack = h.requests.find((r) => r.url.includes('/recycle-ack'));
  assert.ok(ack, '清理后必须回执');
  assert.equal(ack.options.method, 'POST');
  assert.equal(ack.options.headers.Authorization, 'Bearer lease-token');
  const body = JSON.parse(ack.options.body);
  assert.equal(body.ok, true);
  assert.equal(body.method, 'PAGE');

  assert.deepEqual(h.reloaded, [10], '清理后要重载，丢掉页面内存里的旧 token');
  assert.deepEqual(h.state.stored.leases, {}, '收尾后本地不应残留租约');
});

test('标签页不可达：退回 browsingData，且只清科应两域', async () => {
  const h = worker({ pageReply: null });
  h.state.status = 'RECYCLING';
  h.state.recycleMode = 'PURGE';

  await h.events.poll();
  await settle();

  assert.equal(h.browsingDataCalls.length, 1);
  const call = h.browsingDataCalls[0];
  assert.deepEqual(call.options.origins, ['https://www.scienceing.com', 'https://scienceing.com']);
  assert.equal(call.types.localStorage, true);
  assert.equal(call.types.indexedDB, true);
  assert.equal(call.types.serviceWorkers, true);

  const body = JSON.parse(h.requests.find((r) => r.url.includes('/recycle-ack')).options.body);
  assert.equal(body.ok, true);
  assert.equal(body.method, 'BROWSING_DATA');
  assert.equal(h.reloaded.length, 0, '没有页面就不该重载');
});

test('两条通道都失败：回执 ok=false，交给服务端改密兜底', async () => {
  const h = worker({
    pageReply: { ok: false, method: 'PAGE', detail: 'readback failed' },
    browsingDataError: 'browsingData 不可用',
  });
  h.state.status = 'RECYCLING';
  h.state.recycleMode = 'PURGE';

  await h.events.poll();
  await settle();

  const body = JSON.parse(h.requests.find((r) => r.url.includes('/recycle-ack')).options.body);
  assert.equal(body.ok, false);
  assert.equal(body.method, 'FAILED');
  assert.match(body.detail, /browsingData/);
});

test('ROTATE 模式：不发清理指令、不回执', async () => {
  const h = worker();
  h.state.status = 'RECYCLING';
  h.state.recycleMode = 'ROTATE';

  await h.events.poll();
  await settle();

  assert.equal(h.messages.some((m) => m.message.type === 'PURGE_SESSION'), false);
  assert.equal(h.requests.some((r) => r.url.includes('/recycle-ack')), false);
  assert.deepEqual(h.state.stored.leases, {}, '即使不清理，也要结束本地租约');
});

test('同一租约不会被清理两遍', async () => {
  const h = worker();
  h.state.status = 'RECYCLING';
  h.state.recycleMode = 'PURGE';

  // 轮询与 alarm 同时触发是真实场景（SW 被回收后恢复时会立刻 poll 一次）
  await Promise.all([h.events.poll(), h.events.poll()]);
  await settle();

  assert.equal(h.requests.filter((r) => r.url.includes('/recycle-ack')).length, 1);
});
