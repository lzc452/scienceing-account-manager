/**
 * gateway.mjs 韧性回归测试（L0-2）
 *
 * 背景：GET /% 会让 decodeURIComponent 抛 URIError。此前 serveStatic 是 async 且调用处
 * 未挂 .catch()，异常逃逸成 unhandledRejection → Node 退出 → 整站下线直到人工重启。
 *
 * 本测试断言：
 *  1) 畸形百分号编码返回 400（而非 403/500，也不是进程退出）
 *  2) 越界路径返回 403
 *  3) 畸形请求之后进程仍然存活、正常路由不受影响
 *  4) 后端不可达时 /api/* 返回 502 且不拖垮进程
 *
 * 运行：node --test scripts/test/gateway-resilience.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const GATEWAY = join(REPO_ROOT, 'deploy-lan', 'scripts', 'gateway.mjs');

/** 取一个空闲端口：先监听 0 拿系统分配的端口，再释放给网关使用。 */
function freePort() {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.on('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

/**
 * 直连 127.0.0.1 发请求（不经 http_proxy 环境变量，node:http 默认不使用代理）。
 * 返回 { status, body }。
 */
function get(port, rawPath, extraHeaders = {}) {
  return new Promise((res, rej) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, method: 'GET', path: rawPath, headers: extraHeaders },
      (r) => {
        let body = '';
        r.setEncoding('utf8');
        r.on('data', (c) => { body += c; });
        r.on('end', () => res({ status: r.statusCode, body }));
      },
    );
    req.on('error', rej);
    req.end();
  });
}

async function waitForPing(port, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const r = await get(port, '/__gateway__/ping');
      if (r.status === 200) return;
    } catch {
      /* 尚未监听，继续重试 */
    }
    if (Date.now() > deadline) throw new Error(`网关未在 ${timeoutMs}ms 内就绪`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

test('gateway.mjs：畸形 URL 与越界路径不再打挂进程（L0-2）', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gw-root-'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>ok</title>', 'utf8');

  const port = await freePort();
  // 后端指向一个必然不可达的端口，用于验证 /api/* 的 502 分支
  const child = spawn(process.execPath, [
    GATEWAY,
    '--root', root,
    '--api', 'http://127.0.0.1:1',
    '--port', String(port),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let exited = null;
  child.on('exit', (code, signal) => { exited = { code, signal }; });

  t.after(() => {
    try { child.kill(); } catch { /* 已退出 */ }
    try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  await waitForPing(port);

  // 1) 畸形百分号编码 → 400（原缺陷：进程直接退出）
  for (const bad of ['/%', '/%zz', '/%E0%A4%A', '/%C0%AF']) {
    const r = await get(port, bad);
    assert.equal(r.status, 400, `${bad} 应返回 400，实际 ${r.status}`);
  }

  // 2) 越界路径 → 403（编码形式，绕过客户端路径归一化）
  const traversal = await get(port, '/%2e%2e%2f%2e%2e%2fetc%2fpasswd');
  assert.equal(traversal.status, 403, `编码穿越应返回 403，实际 ${traversal.status}`);

  // 3) 畸形请求之后，正常路由仍然可用 —— 这是 L0-2 的核心断言
  assert.equal(exited, null, '网关进程不应在畸形请求后退出');
  const home = await get(port, '/');
  assert.equal(home.status, 200, `GET / 应仍返回 200，实际 ${home.status}`);
  const ping = await get(port, '/__gateway__/ping');
  assert.equal(ping.status, 200);
  assert.equal(ping.body, '{"ok":true}');

  // 4) SPA history 回退仍然生效（未知路由不 404）
  const spa = await get(port, '/admin/accounts');
  assert.equal(spa.status, 200, `SPA 回退应返回 200，实际 ${spa.status}`);

  // 5) 后端不可达 → 502，且不拖垮进程
  const api = await get(port, '/api/health');
  assert.equal(api.status, 502, `/api/* 后端不可达应返回 502，实际 ${api.status}`);
  assert.equal(exited, null, '网关进程不应在代理失败后退出');

  const finalPing = await get(port, '/__gateway__/ping');
  assert.equal(finalPing.status, 200, '全部异常请求后网关仍应存活');
});

test('gateway.mjs：客户端伪造的转发头不得透传给后端（L1-21）', async (t) => {
  // 假后端：记录实际收到的转发头
  let seenXff = null;
  let seenProto = null;
  const backend = createServer((req, res) => {
    seenXff = req.headers['x-forwarded-for'] ?? null;
    seenProto = req.headers['x-forwarded-proto'] ?? null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
  });
  await new Promise((resolve) => backend.listen(0, '127.0.0.1', resolve));
  t.after(() => backend.close());

  const root = mkdtempSync(join(tmpdir(), 'gw-xff-'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>ok</title>', 'utf8');

  const port = await freePort();
  const child = spawn(process.execPath, [
    GATEWAY,
    '--root', root,
    '--api', `http://127.0.0.1:${backend.address().port}`,
    '--port', String(port),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  t.after(() => {
    try { child.kill(); } catch { /* 已退出 */ }
    try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  await waitForPing(port);

  const res = await get(port, '/api/anything', {
    'X-Forwarded-For': '1.2.3.4',
    'X-Forwarded-Proto': 'https',
  });
  assert.equal(res.status, 200);

  // 后端设了 trust proxy: loopback，会采信来自网关的这两个头。
  // 因此网关必须覆盖而不是透传，否则 audit_logs.ip 可被任意伪造。
  assert.notEqual(seenXff, '1.2.3.4', `客户端声称的 X-Forwarded-For 不得透传，实际 ${seenXff}`);
  assert.match(String(seenXff), /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/,
    `后端应看到真实 socket 地址，实际 ${seenXff}`);
  assert.equal(seenProto, 'http', 'X-Forwarded-Proto 应以网关自身这一跳为准（决定 cookie 是否带 Secure）');
});
