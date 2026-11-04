#!/usr/bin/env node
/**
 * 冒烟测试：对「单容器形态」的实例做端到端核心检查。
 *
 *   node deploy-cloudbase/scripts/smoke.mjs --base http://127.0.0.1:8080
 *   node deploy-cloudbase/scripts/smoke.mjs --base https://xxx.service.tcloudbase.com \
 *     --username admin --password '***'
 *
 * 覆盖：健康检查、静态首页、SPA 回退、下载包 404 语义、API 404 语义、安全响应头、
 *      扩展配置端点、登录 + 会话 cookie。--username/--password 缺省时跳过登录用例。
 */
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://127.0.0.1:8080' },
    username: { type: 'string' },
    password: { type: 'string' },
    timeout: { type: 'string', default: '15000' },
  },
});

const BASE = values.base.replace(/\/+$/, '');
const TIMEOUT = Number(values.timeout) || 15000;
const results = [];

async function request(path, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    return await fetch(`${BASE}${path}`, { ...init, signal: controller.signal, redirect: 'manual' });
  } finally {
    clearTimeout(timer);
  }
}

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function check(name, fn) {
  try {
    await fn();
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
  }
}

await check('GET /api/health 返回 200 且数据库就绪', async () => {
  const res = await request('/api/health');
  const body = await res.json().catch(() => null);
  if (res.status !== 200) throw new Error(`HTTP ${res.status} ${JSON.stringify(body)}`);
  if (!body || body.checks?.database !== 'ok') throw new Error(`数据库检查未通过：${JSON.stringify(body?.checks)}`);
  if (body.checks?.schema !== 'ok') throw new Error(`迁移版本不一致：db=${body.schemaVersion} code=${body.expectedSchemaVersion}`);
  record('GET /api/health 返回 200 且数据库就绪', true, `journal=${body.database?.journalMode} v${body.version}`);
});

await check('GET / 返回前端首页', async () => {
  const res = await request('/');
  const html = await res.text();
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  if (!html.includes('id="app"')) throw new Error('返回内容不是 SPA 首页（缺少 #app 挂载点）');
  record('GET / 返回前端首页', true);
});

await check('GET /admin/accounts 走 SPA 回退', async () => {
  const res = await request('/admin/accounts');
  const html = await res.text();
  if (res.status !== 200 || !html.includes('id="app"')) throw new Error(`HTTP ${res.status}（history 回退失效）`);
  record('GET /admin/accounts 走 SPA 回退', true);
});

await check('缺失的 /downloads/* 必须 404', async () => {
  const res = await request('/downloads/__not-exist__.zip');
  if (res.status !== 404) throw new Error(`HTTP ${res.status}（应 404，否则用户会下到一个 HTML）`);
  record('缺失的 /downloads/* 必须 404', true);
});

await check('未知 /api 路径返回 JSON 404', async () => {
  const res = await request('/api/__not-exist__');
  if (res.status !== 404) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) throw new Error(`content-type=${type}（API 404 不应回落到 index.html）`);
  record('未知 /api 路径返回 JSON 404', true);
});

await check('首页带安全响应头', async () => {
  const res = await request('/');
  const csp = res.headers.get('content-security-policy') ?? '';
  if (!csp.includes("default-src 'self'")) throw new Error('缺少 Content-Security-Policy');
  if (res.headers.get('x-frame-options') !== 'DENY') throw new Error('缺少 X-Frame-Options: DENY');
  record('首页带安全响应头', true);
});

await check('GET /api/extension/config 可匿名访问', async () => {
  const res = await request('/api/extension/config');
  const body = await res.json().catch(() => null);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  if (typeof body?.inactivityTimeoutSeconds !== 'number') throw new Error('响应缺少 inactivityTimeoutSeconds');
  record('GET /api/extension/config 可匿名访问', true, `v${body.latestVersion}`);
});

if (values.username && values.password) {
  await check('POST /api/auth/login 登录并拿到会话', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: values.username, password: values.password }),
    });
    const body = await res.json().catch(() => null);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}：${JSON.stringify(body)}`);
    const cookie = (res.headers.getSetCookie?.() ?? []).join('; ');
    if (!cookie) throw new Error('响应没有 Set-Cookie');

    const me = await request('/api/auth/me', { headers: { cookie } });
    const payload = await me.json().catch(() => null);
    // /auth/me 直接返回 AuthUser；兼容将来包一层 { user } 的形态。
    const user = payload?.user ?? payload;
    if (me.status !== 200 || !user?.username) {
      throw new Error(`会话未生效：HTTP ${me.status} ${JSON.stringify(payload)}`);
    }
    record('POST /api/auth/login 登录并拿到会话', true, `${user.username}(${user.role})`);
  });
} else {
  console.log('SKIP  登录用例（未提供 --username/--password）');
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length === 0 ? 0 : 1);
