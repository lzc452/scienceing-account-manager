#!/usr/bin/env node
/**
 * 数据持久化验证（必须通过才能宣称具备生产运行能力）。
 *
 * 原理：登录会写 sessions 表。写阶段拿到 cookie，重启实例后再用同一 cookie 取会话：
 *   · 会话仍有效 → 数据库确实落在持久卷上，且重启没有重置数据目录；
 *   · 401/403     → 数据目录是容器临时盘（或库被重建），绝对不能上线。
 * 同时比对 /api/health 的 uptimeSeconds，确认中间真的发生过重启，避免「假装验证」。
 *
 * 用法（两次执行之间，在云托管控制台重启实例 / 缩容到 0 再启动）：
 *   node deploy-cloudbase/scripts/verify-persistence.mjs --base https://xxx --username admin --password '***' --phase write
 *   # ← 重启实例
 *   node deploy-cloudbase/scripts/verify-persistence.mjs --base https://xxx --phase verify
 *
 * --state 默认 /tmp/scienceing-persist.json（容器外执行时用本机临时目录即可）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://127.0.0.1:8080' },
    phase: { type: 'string', default: 'auto' },
    username: { type: 'string' },
    password: { type: 'string' },
    state: { type: 'string', default: '/tmp/scienceing-persist.json' },
  },
});

const BASE = values.base.replace(/\/+$/, '');
const STATE = values.state;

async function request(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, init);
  return res;
}

async function write() {
  if (!values.username || !values.password) {
    console.error('写阶段需要 --username 与 --password');
    process.exit(2);
  }
  const res = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: values.username, password: values.password }),
  });
  const body = await res.json().catch(() => null);
  if (res.status !== 200) {
    console.error(`登录失败：HTTP ${res.status} ${JSON.stringify(body)}`);
    process.exit(1);
  }
  const cookie = (res.headers.getSetCookie?.() ?? []).join('; ');
  if (!cookie) {
    console.error('登录成功但响应没有 Set-Cookie，无法做会话持久化验证');
    process.exit(1);
  }
  writeFileSync(STATE, JSON.stringify({
    base: BASE,
    cookie,
    userId: body?.user?.id,
    username: body?.user?.username,
    loginAt: Date.now(),
  }, null, 2));
  console.log(`写阶段完成：已登录 ${body?.user?.username}，状态写入 ${STATE}`);
  console.log('下一步：重启实例（云托管控制台「停止/重启」或实例数 0 → 1），再执行 --phase verify');
}

async function verify() {
  let state;
  try {
    state = JSON.parse(readFileSync(STATE, 'utf8'));
  } catch {
    console.error(`找不到状态文件 ${STATE}，请先执行 --phase write`);
    process.exit(2);
  }
  if (state.base.replace(/\/+$/, '') !== BASE) {
    console.error(`状态文件记录的目标是 ${state.base}，与当前 --base ${BASE} 不一致`);
    process.exit(2);
  }

  const health = await request('/api/health');
  const info = await health.json().catch(() => null);
  const elapsed = Math.round((Date.now() - state.loginAt) / 1000);
  const uptime = Number(info?.uptimeSeconds ?? -1);

  const me = await request('/api/auth/me', { headers: { cookie: state.cookie } });
  const user = await me.json().catch(() => null);
  const sessionAlive = me.status === 200 && (user?.id ?? user?.user?.id) === state.userId;

  // 未重启时 uptime ≥ 登录至今的秒数；留 5s 容差（取整与时钟误差）。
  const restarted = uptime >= 0 && uptime + 5 < elapsed;

  console.log(`健康检查：HTTP ${health.status}，journal=${info?.database?.journalMode}，uptime=${uptime}s`);
  console.log(`重启判定：登录距今 ${elapsed}s，实例 uptime ${uptime}s → ${restarted ? '已重启' : '未观察到重启'}`);
  console.log(`会话复用：HTTP ${me.status} → ${sessionAlive ? '数据仍在' : '数据丢失'}`);

  if (!sessionAlive) {
    console.error('\nFAIL：重启后会话失效。数据目录很可能没有挂载持久卷，或库被重新初始化——禁止宣称可生产运行。');
    process.exit(1);
  }
  if (!restarted) {
    console.error('\nFAIL：没有观察到实例重启，本次验证无效（先重启实例再执行 verify）。');
    process.exit(1);
  }
  console.log('\nPASS：重启后同一会话仍有效，SQLite 数据位于持久化存储。');
}

const phase = values.phase === 'auto' ? (() => {
  try {
    readFileSync(STATE);
    return 'verify';
  } catch {
    return 'write';
  }
})() : values.phase;

if (phase === 'write') await write();
else if (phase === 'verify') await verify();
else {
  console.error('--phase 只能是 auto|write|verify');
  process.exit(2);
}
