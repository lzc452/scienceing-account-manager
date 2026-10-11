/* global setImmediate, AbortController */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { URL } from 'node:url';
import * as config from '../src/lib/config.js';
import { compareVersions } from '../src/lib/version.js';
import { claimLeaseThroughExtension } from '../src/lib/claim.js';

const background = readFileSync(new URL('../src/background.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from '[^']+';\r?\n/gm, '');
const content = readFileSync(new URL('../src/content/scienceing/scienceing.js', import.meta.url), 'utf8');
const flush = () => new Promise((done) => setImmediate(done));
const clone = (value) => JSON.parse(JSON.stringify(value));
const sender = (id, url = 'https://www.scienceing.com/knowledge') => ({ tab: { id, url }, url });
const initialState = () => ({
  tabLease: { 10: { leaseId: 7, accountCode: 'KY-03' } },
  leases: { 7: { leaseId: 7, leaseToken: 'lease-token', accountCode: 'KY-03' } },
});

function worker({ stored = initialState(), restore, overrideFetch } = {}) {
  const events = {};
  const event = (name) => ({ addListener: (fn) => { events[name] = fn; } });
  const messages = [], requests = [], timers = new Map();
  let timerId = 0;
  const state = { stored: clone(stored), status: 'ACTIVE' };
  const fetch = async (url, options = {}) => {
    requests.push({ url, options });
    const overridden = overrideFetch?.(url, options);
    if (overridden) return overridden;
    let data;
    if (url.endsWith('/extension/config')) data = { minimumVersion: '1.0.0', latestVersion: '1.4.0' };
    else if (url.endsWith('/claim-proof')) data = { proof: 'one-time-proof' };
    else if (url.endsWith('/api/leases')) data = { lease: { id: 7 }, leaseToken: 'replacement-token', account: { code: 'KY-03' } };
    else if (url.endsWith('/activity')) data = { result: 'ACTIVE' };
    else data = { status: state.status, accountCode: 'KY-03' };
    return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
  };
  const chrome = {
    storage: { session: {
      get: async () => { if (restore) await restore; return clone(state.stored); },
      set: async (value) => { Object.assign(state.stored, clone(value)); },
    } },
    runtime: { id: 'abcdefghijklmnopabcdefghijklmnop', getManifest: () => ({ version: '1.4.0' }), onMessage: event('message') },
    tabs: {
      onCreated: event('created'), onUpdated: event('updated'), onRemoved: event('removed'),
      sendMessage: async (id, message) => { messages.push({ id, message: clone(message) }); },
      create: async () => ({ id: 99 }),
    },
  };
  const context = vm.createContext({
    ...config, compareVersions, claimLeaseThroughExtension, chrome, fetch, URL, AbortController,
    console: { log() {}, warn() {} },
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn) => { events.poll = fn; return 100; },
  });
  vm.runInContext(background, context);
  const request = (message, from = sender(10)) => new Promise((resolve) => {
    assert.equal(events.message(message, from, (result) => resolve(clone(result))), true);
  });
  return { state, events, messages, requests, timers, request };
}

test('后台恢复完成前事件和查询等待；网址延迟、父页关闭和再次恢复后仍继承', async () => {
  let finishRestore;
  const h = worker({ restore: new Promise((resolve) => { finishRestore = resolve; }) });
  let resolved = false;
  const query = h.request({ type: 'GET_TAB_LEASE' }).then((value) => { resolved = true; return value; });
  const created = h.events.created({ id: 11, openerTabId: 10, url: 'about:blank' });
  await flush();
  assert.equal(resolved, false);
  finishRestore();
  assert.equal((await query).bound, true);
  await created;
  await h.events.removed(10);
  const resumed = worker({ stored: h.state.stored });
  const binding = await resumed.request({ type: 'GET_TAB_LEASE' }, sender(11));
  assert.equal(binding.bound, true);
  assert.equal(binding.leaseId, 7);
  assert.ok(resumed.state.stored.tabLease['11']);
  assert.ok(resumed.messages.some((m) => m.id === 11 && m.message.type === 'LEASE_BOUND'));
});

test('只绑定可信父页打开的科应标签，外部网址与无法确认的页面不绑定', async () => {
  const h = worker();
  await h.events.created({ id: 11, openerTabId: 10 });
  await h.events.updated(11, { url: 'https://scienceing.com/subscriptions' }, { url: 'https://scienceing.com/subscriptions' });
  assert.equal((await h.request({ type: 'GET_TAB_LEASE' }, sender(11, 'https://scienceing.com/subscriptions'))).bound, true);
  await h.events.removed(10);
  assert.equal((await h.request({ type: 'GET_TAB_LEASE' }, sender(11, 'https://scienceing.com/subscriptions'))).bound, true);
  await h.events.created({ id: 12, openerTabId: 11, url: 'https://www.scienceing.com.evil.example/' });
  assert.equal((await h.request({ type: 'GET_TAB_LEASE' }, sender(12))).bound, false);
  assert.equal((await h.request({ type: 'GET_TAB_LEASE' }, sender(13))).bound, false);
  await h.events.updated(11, { url: 'https://example.org' }, { url: 'https://example.org' });
  assert.equal((await h.request({ type: 'GET_TAB_LEASE' }, sender(11))).bound, false);
});

test('归还清除全部绑定及待发续期，其他标签和伪造租约不能续期', async () => {
  const h = worker();
  await h.events.created({ id: 11, openerTabId: 10, url: 'https://www.scienceing.com/scihelp' });
  await h.events.created({ id: 12, openerTabId: 10 });
  await flush();
  assert.equal((await h.request({ type: 'REPORT_ACTIVITY', leaseId: 7 }, sender(99))).ok, false);
  assert.equal((await h.request({ type: 'REPORT_ACTIVITY', leaseId: 8 })).ok, false);
  assert.equal((await h.request({ type: 'REPORT_ACTIVITY', leaseId: 7 }, sender(10, 'https://example.org'))).ok, false);
  await h.request({ type: 'REPORT_ACTIVITY', leaseId: 7 });
  await flush();
  await h.request({ type: 'REPORT_ACTIVITY', leaseId: 7 });
  assert.equal(h.timers.size, 1);
  const pending = [...h.timers.values()][0].fn;
  h.state.status = 'RECYCLING';
  await h.events.poll();
  await flush();
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.state.stored.tabLease, {});
  assert.deepEqual(h.state.stored.pendingTabLease, {});
  assert.deepEqual(h.state.stored.leases, {});
  assert.ok(h.messages.some((m) => m.id === 11 && m.message.type === 'LEASE_RELEASED' && m.message.status.status === 'RECYCLING'));
  const reports = h.requests.filter((r) => r.url.endsWith('/activity')).length;
  pending();
  await h.request({ type: 'REPORT_ACTIVITY', leaseId: 7 });
  await flush();
  assert.equal(h.requests.filter((r) => r.url.endsWith('/activity')).length, reports);
});

test('定向参数贯穿后台，重入轮换 token 后旧轮询不能清除新绑定', async () => {
  let oldResponse;
  const h = worker({ overrideFetch: (url, options) => {
    if (url.endsWith('/status') && options.headers.Authorization === 'Bearer lease-token') {
      return new Promise((resolve) => { oldResponse = resolve; });
    }
  } });
  await flush();
  const info = await h.request({ type: 'EXTENSION_INFO' });
  assert.equal(info.supportsAccountSelection, true);
  const result = await h.request({ type: 'CLAIM_LEASE', authToken: 'user-token', accountId: 3 });
  assert.equal(result.ok, true);
  const submitted = h.requests.find((r) => r.url.endsWith('/api/leases'));
  assert.deepEqual(JSON.parse(submitted.options.body), { extensionProof: 'one-time-proof', accountId: 3 });
  oldResponse({ status: 401, ok: false });
  await flush();
  assert.equal((await h.request({ type: 'GET_TAB_LEASE' })).bound, true);
  assert.equal(h.state.stored.leases['7'].leaseToken, 'replacement-token');
});

test('旧续期响应解析迟到时不能结束重新领取的当前租约', async () => {
  let finishBody;
  const h = worker({ overrideFetch: (url) => {
    if (url.endsWith('/activity')) return { ok: true, status: 200,
      json: () => new Promise((resolve) => { finishBody = resolve; }) };
  } });
  await flush();
  await h.request({ type: 'REPORT_ACTIVITY', leaseId: 7 });
  await flush();
  assert.equal(typeof finishBody, 'function');
  await h.request({ type: 'CLAIM_LEASE', authToken: 'user-token', accountId: 3 });
  finishBody({ result: 'LEASE_EXPIRED' });
  await flush();
  assert.equal((await h.request({ type: 'GET_TAB_LEASE' })).bound, true);
  assert.equal(h.state.stored.leases['7'].leaseToken, 'replacement-token');
});

test('内容脚本晚绑定后才上报真实操作，重复绑定不重复监听，失效立即停止', async () => {
  const listeners = {}, requests = [];
  let receive;
  const context = vm.createContext({
    chrome: { runtime: {
      onMessage: { addListener: (fn) => { receive = fn; } },
      sendMessage: async (message) => { requests.push(clone(message)); return { bound: false }; },
    } },
    window: { addEventListener: (type, fn) => { assert.equal(listeners[type], undefined); listeners[type] = fn; } },
    __scienceingPanel: { render() {} },
  });
  vm.runInContext(content, context);
  await flush();
  assert.deepEqual(Object.keys(listeners), []);
  receive({ type: 'LEASE_BOUND', leaseId: 7 });
  receive({ type: 'LEASE_BOUND', leaseId: 7 });
  assert.equal(Object.keys(listeners).length, 4);
  listeners.pointerdown({ isTrusted: false });
  listeners.pointerdown({ isTrusted: true, composedPath: () => [{ id: '__scienceing_account_assistant__' }] });
  assert.equal(requests.filter((r) => r.type === 'REPORT_ACTIVITY').length, 0);
  listeners.pointerdown({ isTrusted: true });
  assert.equal(requests.filter((r) => r.type === 'REPORT_ACTIVITY').length, 1);
  receive({ type: 'LEASE_RELEASED', leaseId: 7, status: { status: 'RECYCLING' } });
  listeners.pointerdown({ isTrusted: true });
  assert.equal(requests.filter((r) => r.type === 'REPORT_ACTIVITY').length, 1);
});

test('迟到的初始化响应不能覆盖归还或未绑定状态', async () => {
  for (const type of ['LEASE_RELEASED', 'LEASE_UNBOUND']) {
    const requests = [], renders = [], listeners = {};
    let receive, resolveInitial;
    const context = vm.createContext({
      chrome: { runtime: {
        onMessage: { addListener: (fn) => { receive = fn; } },
        sendMessage: (message) => {
          requests.push(clone(message));
          return message.type === 'GET_TAB_LEASE'
            ? new Promise((resolve) => { resolveInitial = resolve; }) : Promise.resolve();
        },
      } },
      window: { addEventListener: (event, fn) => { listeners[event] = fn; } },
      __scienceingPanel: { render: (state) => renders.push(clone(state)) },
    });
    vm.runInContext(content, context);
    receive({ type, leaseId: 7 });
    resolveInitial({ bound: true, leaseId: 7 });
    await flush();
    assert.equal(renders.length, 1);
    assert.deepEqual(Object.keys(listeners), []);
    assert.equal(requests.length, 1);
  }
});

test('看板内容脚本完整转发指定账号及请求 id', async () => {
  let receive;
  const forwarded = [], replies = [];
  const window = { location: { origin: 'http://localhost:5173' },
    addEventListener: (_type, fn) => { receive = fn; }, postMessage: (value) => replies.push(clone(value)) };
  const context = vm.createContext({ window, document: { dispatchEvent() {} }, CustomEvent: class {},
    chrome: { runtime: { sendMessage: async (message) => { forwarded.push(clone(message)); return { ok: true }; } } } });
  vm.runInContext(readFileSync(new URL('../src/content/dashboard.js', import.meta.url), 'utf8'), context);
  await receive({ source: window, data: { source: 'scienceing-dashboard', type: 'CLAIM_LEASE', requestId: 'request-3', authToken: 'user-token', accountId: 3 } });
  assert.deepEqual(forwarded.at(-1), { type: 'CLAIM_LEASE', authToken: 'user-token', accountId: 3 });
  assert.equal(replies.at(-1).requestId, 'request-3');
});
