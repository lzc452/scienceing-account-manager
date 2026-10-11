/* global queueMicrotask */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { URL } from 'node:url';

test('Mock 领取、历史和管理操作共享账号状态，并隔离各用户的活动租约', async () => {
  const recycling = [];
  const globals = {
    reactive: (value) => value,
    setTimeout: (callback, ms) => { if (ms === 5000) recycling.push(callback); else queueMicrotask(callback); },
    isPasswordAllowed: () => true, passwordPolicyMessage: () => '',
  };
  const source = readFileSync(new URL('../../apps/web/src/api/mock.js', import.meta.url), 'utf8')
    .replace(/^import[^\n]*\n/gm, '')
    .replace('export { state as mockState }', 'globalThis.mockState = state')
    .replace('export const mockApi =', 'globalThis.mockApi =');
  const context = vm.createContext(globals);
  vm.runInContext(source, context);
  const { mockApi, mockState } = context;
  const adminSource = readFileSync(new URL('../../apps/web/src/api/admin-mock.js', import.meta.url), 'utf8')
    .replace(/^import[^\n]*\n/gm, '').replace('export const adminMockApi =', 'globalThis.adminMockApi =');
  const adminContext = vm.createContext({ ...globals, mockState, ACTION_LABELS: {}, authState: { user: { id: 1, role: 'ADMIN' } } });
  vm.runInContext(adminSource, adminContext);
  const admin = adminContext.adminMockApi;

  assert.throws(mockApi.mine, (e) => e.status === 401);
  await mockApi.login('zhangsan', 'mock-user');
  await assert.rejects(() => mockApi.claim(2), (e) => e.code === 'TARGET_ACCOUNT_UNAVAILABLE');
  await assert.rejects(() => mockApi.claim(99999), (e) => e.status === 404);
  await assert.rejects(() => mockApi.claim('6'), (e) => e.status === 400);
  const unused = await admin.createAccount({ code: 'UNUSED', username: 'unused-account' });
  await assert.rejects(() => mockApi.claim(unused.id), (e) => e.code === 'ACCOUNT_NOT_PROVISIONED');
  await admin.renameAccount(unused.id, { username: 'corrected-unused' });
  await admin.deleteAccount(unused.id);
  assert.equal(mockState.pool.some((a) => a.id === unused.id), false);
  assert.equal(mockState.leases.length, 0);

  const first = await mockApi.claim(6);
  assert.equal(first.account.accountId, 6);
  assert.equal((await mockApi.claim(6)).lease.id, first.lease.id);
  await assert.rejects(() => mockApi.claim(7), (e) => e.code === 'ACTIVE_LEASE_CONFLICT');
  await mockApi.release(first.lease.id);
  await admin.disable(6);
  recycling.pop()();
  const disabled = mockApi.mine().find((a) => a.accountId === 6);
  assert.equal(disabled.enabled, false);
  assert.ok(disabled.lastUsedAt);
  await assert.rejects(() => admin.deleteAccount(6), (e) => e.status === 409);
  await assert.rejects(() => admin.renameAccount(6, { username: 'different-login' }), (e) => e.status === 409);
  await admin.renameAccount(6, { code: 'DISPLAY-06' });
  await admin.enable(6);
  assert.equal((await mockApi.claim(6)).account.code, 'DISPLAY-06');
  assert.equal(mockApi.mine().filter((a) => a.lastUsedAt).length, 1);
  assert.equal((await admin.listAccounts()).find((a) => a.id === 6).hasUsageHistory, true);

  await mockApi.logout();
  await mockApi.login('admin', 'mock-admin');
  assert.equal((await mockApi.current()).lease, null);
  assert.equal(mockApi.mine().find((a) => a.accountId === 6).lastUsedAt, null);
  assert.equal((await mockApi.claim(7)).account.accountId, 7);
  await mockApi.logout();
  await mockApi.login('zhangsan', 'mock-user');
  assert.equal((await mockApi.current()).account.accountId, 6);
  assert.equal(mockApi.mine().find((a) => a.accountId === 7).lastUsedAt, null);
});
