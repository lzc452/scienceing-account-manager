async function responseBody(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function apiFailure(response, body, fallback) {
  const message = Array.isArray(body?.message) ? body.message.join('，') : body?.message;
  return { ok: false, status: response.status, code: body?.code ?? null, error: message || fallback };
}

/** 通过扩展 Origin 申领一次性证明，并立即用它领取账号。authToken 不会持久化。 */
export async function claimLeaseThroughExtension({
  apiBase,
  authToken,
  extensionId,
  extensionVersion,
  request,
}) {
  if (!authToken) return { ok: false, status: 401, error: '缺少登录令牌' };

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
    'X-Scienceing-Extension-Id': extensionId,
    'X-Scienceing-Extension-Version': extensionVersion,
  };

  try {
    const proofResponse = await request(`${apiBase}/api/extension/claim-proof`, {
      method: 'POST',
      headers,
      body: '{}',
    });
    const proofBody = await responseBody(proofResponse);
    if (!proofResponse.ok) return apiFailure(proofResponse, proofBody, '扩展领取证明申请失败');

    const claimResponse = await request(`${apiBase}/api/leases`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ extensionProof: proofBody.proof }),
    });
    const claimBody = await responseBody(claimResponse);
    if (!claimResponse.ok) return apiFailure(claimResponse, claimBody, '领取账号失败');
    return { ok: true, data: claimBody };
  } catch (error) {
    return { ok: false, status: 0, error: error && error.message ? error.message : String(error) };
  }
}
