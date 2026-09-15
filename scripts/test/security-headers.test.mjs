/**
 * 安全响应头回归测试（L2-16）
 *
 * 两个网关都必须下发 CSP / X-Content-Type-Options / X-Frame-Options / Referrer-Policy：
 * CSP 是「前端不再把会话令牌放进 localStorage」之外最廉价的一道补偿。
 *
 * nginx 侧额外验证一个**容易踩的坑**：nginx 的 `add_header` 不继承 ——
 * 子 location 一旦自己写了 add_header，父级的全部失效。因此生成器必须在
 * 每个自带 add_header 的 location 里重复声明，否则那些响应会静默丢掉 CSP。
 *
 * 运行：node --test scripts/test/security-headers.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const GATEWAY = join(REPO_ROOT, 'deploy-lan', 'scripts', 'gateway.mjs');
const SCRIPTS = join(REPO_ROOT, 'deploy-lan', 'scripts');
const MOD = (name) => `file:///${join(SCRIPTS, name).replace(/\\/g, '/')}`;

// 必须在 import 之前设好：NGINX_PREFIX 在 lib.mjs 加载时求值。
//
// 用**独立**的根目录，且清理时只删自己这一个：node --test 会并行跑多个测试文件，
// 若两个文件共用同一个根目录并各自 rmSync 整个父目录，就会互相删掉对方的中间状态
// （表现为「单独跑都过、一起跑就挂」）。
const RT = join(REPO_ROOT, '.workbuddy-ai', 'tmp-test-headers');
process.env.SCIENCEING_RUNTIME_DIR = RT;

const { NGINX_PREFIX } = await import(MOD('lib.mjs'));
const { ensureNginxPrefix } = await import(MOD('nginx-ctl.mjs'));

const REQUIRED = {
  'content-security-policy': ["default-src 'self'", "frame-ancestors 'none'", "script-src 'self'"],
  'x-content-type-options': ['nosniff'],
  'x-frame-options': ['DENY'],
  'referrer-policy': ['same-origin'],
};

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

/** 直连取响应头（node:http 不理会 http_proxy 环境变量）。 */
function head(port, rawPath) {
  return new Promise((res, rej) => {
    const req = httpRequest({ host: '127.0.0.1', port, method: 'GET', path: rawPath }, (r) => {
      r.resume();
      r.on('end', () => res(r.headers));
    });
    req.on('error', rej);
    req.end();
  });
}

async function waitForPing(port, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await head(port, '/__gateway__/ping');
      return;
    } catch {
      /* 尚未监听 */
    }
    if (Date.now() > deadline) throw new Error(`网关未在 ${timeoutMs}ms 内就绪`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

test('gateway.mjs：静态与错误响应都带安全头（L2-16）', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'gw-headers-'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>ok</title>', 'utf8');
  const port = await freePort();
  const child = spawn(process.execPath, [
    GATEWAY, '--root', root, '--api', 'http://127.0.0.1:1', '--port', String(port),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => {
    try { child.kill(); } catch { /* 已退出 */ }
    try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
  });
  await waitForPing(port);

  const cases = [
    ['静态首页 /', '/'],
    ['SPA 回退 /admin/accounts', '/admin/accounts'],
    ['网关探活', '/__gateway__/ping'],
    ['畸形编码 400 响应', '/%'],
  ];
  for (const [label, path] of cases) {
    const headers = await head(port, path);
    for (const [name, needles] of Object.entries(REQUIRED)) {
      const value = headers[name];
      assert.ok(value, `${label} 缺少响应头 ${name}`);
      for (const needle of needles) {
        assert.ok(value.includes(needle), `${label} 的 ${name} 应包含 ${needle}，实际：${value}`);
      }
    }
  }
});

test('nginx.conf：每个自带 add_header 的 location 都重复声明了 CSP（继承陷阱）', (t) => {
  rmSync(RT, { recursive: true, force: true });
  const confDir = join(NGINX_PREFIX, 'conf');
  mkdirSync(confDir, { recursive: true });
  // 预置 mime.types，避免函数去 nginx 安装目录复制（测试环境无 nginx）
  writeFileSync(join(confDir, 'mime.types'), 'types { text/html html; }', 'utf8');
  t.after(() => rmSync(RT, { recursive: true, force: true }));

  const confPath = ensureNginxPrefix({
    nginxExe: 'D:/nonexistent/nginx.exe',
    gatewayPort: 18080,
    webDist: join(REPO_ROOT, 'apps', 'web', 'dist'),
    backendPort: 3000,
  });
  assert.ok(existsSync(confPath), '应生成 nginx.conf');
  const conf = readFileSync(confPath, 'utf8');

  const cspCount = (conf.match(/add_header Content-Security-Policy/g) ?? []).length;
  // server 块 1 处 + /downloads 的 .zip 块 1 处 + /assets 块 1 处 = 至少 3
  assert.ok(cspCount >= 3,
    `CSP 至少需声明 3 处（server + 两个自带 add_header 的 location），实际 ${cspCount} 处`);

  for (const needle of ["default-src 'self'", "frame-ancestors 'none'", "script-src 'self'"]) {
    assert.ok(conf.includes(needle), `nginx CSP 应包含 ${needle}`);
  }
  for (const name of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy']) {
    assert.ok(conf.includes(name), `nginx.conf 缺少 ${name}`);
  }

  // /assets 块自带 Cache-Control 的 add_header → 该块内必须能看到 CSP
  const assetsBlock = conf.slice(conf.indexOf('location /assets/'));
  assert.ok(assetsBlock.includes('Content-Security-Policy'),
    '/assets 块自带 add_header，会切断继承，必须重复声明 CSP');
});
