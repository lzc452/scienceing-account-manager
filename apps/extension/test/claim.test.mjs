import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claimLeaseThroughExtension } from '../src/lib/claim.js';

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

test('领取由扩展先申领一次性证明再提交，版本只来自扩展头', async () => {
  const calls = [];
  const result = await claimLeaseThroughExtension({
    apiBase: 'http://localhost:3000',
    authToken: 'user-session-token',
    extensionId: 'abcdefghijklmnopabcdefghijklmnop',
    extensionVersion: '1.3.0',
    request: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/extension/claim-proof')) return response(201, { proof: 'one-time-proof' });
      return response(201, { leaseToken: 'lease-token', lease: { id: 7 }, account: { code: 'KY-01' } });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers['X-Scienceing-Extension-Version'], '1.3.0');
  assert.deepEqual(JSON.parse(calls[1].options.body), { extensionProof: 'one-time-proof' });
  assert.equal(JSON.stringify(calls[1].options.body).includes('extensionVersion'), false);
});

test('证明签发失败时不会继续调用领取接口', async () => {
  let calls = 0;
  const result = await claimLeaseThroughExtension({
    apiBase: 'http://localhost:3000',
    authToken: 'user-session-token',
    extensionId: 'abcdefghijklmnopabcdefghijklmnop',
    extensionVersion: '1.3.0',
    request: async () => {
      calls += 1;
      return response(409, { code: 'EXTENSION_REQUIRED', message: '扩展未授权' });
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'EXTENSION_REQUIRED');
  assert.equal(calls, 1);
});
