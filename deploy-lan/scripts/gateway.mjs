/**
 * gateway.mjs —— 零依赖 Node 生产网关（nginx 不可用时的兜底，也可作为唯一网关）
 *
 * 能力：
 *  1. 静态托管前端构建产物（SPA history 回退：未知路由一律返回 index.html，刷新不 404）
 *  2. /api/* 反向代理到本机后端（保持 method/header/body 透传，流式转发）
 *  3. GET /__gateway__/ping 返回 {"ok":true}，供 status/自检使用
 *
 * 启动方式（由 deploy.mjs 拉起）：
 *   node gateway.mjs --root <webDist> --api http://127.0.0.1:3000 --port 18080 --log <file>
 */
import { createServer, request } from 'node:http';
import { appendFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ROOT = resolve(arg('--root', join(SCRIPT_DIR, '..', '..', 'apps', 'web', 'dist')));
const API_TARGET = arg('--api', 'http://127.0.0.1:3000');
const PORT = Number(arg('--port', '18080'));
const LOG_FILE = arg('--log', '');
const API = new URL(API_TARGET);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
  '.zip': 'application/zip',
  '.crx': 'application/x-chrome-extension',
};

/**
 * 安全响应头。
 *
 * CSP 是「前端不再把会话令牌放进 localStorage」之外最廉价的一道补偿：
 * 即使仍有 XSS 注入点，也能拦住外连脚本、内联脚本执行与页面被第三方内嵌。
 *
 * 取值依据（已核对构建产物 apps/web/dist/index.html）：
 *  - 页面只加载 1 个外链 module script + 1 个外链样式表 + favicon，**没有内联脚本**，
 *    因此 script-src 可以收紧到 'self'；
 *  - 但界面里有若干行内 style 属性（进度条/布局），style-src 必须保留 'unsafe-inline'，
 *    否则这些元素会错位；
 *  - 手册正文支持 data URL 内联插图，故 img-src 需要 data:。
 */
const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
};

function log(msg) {
  const line = `[gateway ${new Date().toISOString()}] ${msg}`;
  if (LOG_FILE) {
    // 顶层 import 一次即可：此前每写一行日志都动态 import('node:fs')，
    // 高频请求下会反复走一遍模块解析（模块缓存虽能兜住，仍是无谓开销）。
    try {
      appendFileSync(LOG_FILE, line + '\n');
    } catch {
      // 日志写失败不能影响服务
    }
  }
  console.log(line);
}

/** 请求级 HTTP 错误：携带期望状态码，供统一响应出口使用。 */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** 统一响应出口：已发送响应头时不再重复写，避免二次 writeHead 抛错。 */
function respond(res, status, body, headers = {}) {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

/**
 * 路径穿越防护：解析后必须仍在 ROOT 内。
 * 畸形百分号编码（如 GET /%）会让 decodeURIComponent 抛 URIError——
 * 这类请求是「非法输入」而非「越权访问」，返回 400；越界才返回 403。
 */
function safePath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, 'Bad Request: malformed percent-encoding');
  }
  const p = normalize(join(ROOT, decoded.replace(/^\/+/, '')));
  if (p.startsWith(ROOT + sep) || p === ROOT) return p;
  throw new HttpError(403, 'Forbidden');
}

async function serveStatic(req, res) {
  let pathname = req.url.split('?')[0];
  if (pathname === '/') pathname = '/index.html';

  let filePath;
  try {
    filePath = safePath(pathname);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    respond(res, status, status === 400 ? 'Bad Request' : 'Forbidden');
    return;
  }

  // /downloads/* 是真实文件分发（扩展 zip）：缺失必须 404，
  // 不能回退 index.html，否则用户会下载到一个 HTML。
  const isDownload = pathname.startsWith('/downloads/');

  try {
    let st = await stat(filePath);
    if (st.isDirectory()) { filePath = join(filePath, 'index.html'); st = await stat(filePath); }
  } catch {
    if (isDownload) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not Found'); return; }
    // 文件不存在：SPA history 回退（刷新 /admin/accounts 等不 404）
    filePath = join(ROOT, 'index.html');
  }

  try {
    const body = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    const isAsset = /\/assets\//.test(req.url);
    const headers = {
      ...SECURITY_HEADERS,
      'Content-Type': type,
      'Cache-Control': isAsset ? 'public, max-age=604800, immutable' : (isDownload ? 'no-cache' : 'no-cache'),
    };
    if (isDownload) headers['Content-Disposition'] = `attachment; filename="${filePath.split(/[\\/]/).pop()}"`;
    res.writeHead(200, headers);
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end('Internal Server Error');
  }
}

function proxyApi(req, res) {
  const pathname = req.url.split('?')[0];
  const search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const headers = { ...req.headers };
  headers.host = `${API.host}`;

  // 覆盖而非透传转发头。
  //
  // 后端设了 `trust proxy: loopback`，因此来自本网关（回环）的 X-Forwarded-For
  // 会被原样采信为客户端地址——而这里此前是直接透传客户端自带的值，
  // 于是任何客户端都能伪造 audit_logs.ip（nginx 模式本身是正确的，仅 node 网关有此问题）。
  // 网关就是边界，只写真实 socket 地址，不保留客户端声称的链路。
  const remoteAddress = req.socket && req.socket.remoteAddress;
  if (remoteAddress) headers['x-forwarded-for'] = remoteAddress;
  else delete headers['x-forwarded-for'];

  // 同理覆盖 X-Forwarded-Proto：它决定会话 cookie 是否带 Secure。
  // 以本网关自己这一跳的加密状态为准；若将来把网关置于 TLS 终止反代之后，
  // 需要改为信任该反代并显式配置，否则 cookie 会退回不带 Secure。
  headers['x-forwarded-proto'] = req.socket && req.socket.encrypted ? 'https' : 'http';

  const preq = request(
    { protocol: API.protocol, hostname: API.hostname, port: API.port || 80, method: req.method, path: pathname + search, headers },
    (pres) => {
      res.writeHead(pres.statusCode || 502, pres.headers);
      pres.pipe(res);
    },
  );
  preq.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway: backend unreachable');
  });
  req.pipe(preq);
}

/**
 * 请求分发。所有分支统一走 Promise 链并挂 .catch()：
 * 网关是单点，任何未捕获的异步拒绝都会让 Node 退出、整站下线直到人工重启，
 * 因此这里宁可降级为 500 也不能让异常逃逸出请求作用域。
 */
async function handleRequest(req, res) {
  if (req.url === '/__gateway__/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
    res.end('{"ok":true}');
    return;
  }
  if (req.url.startsWith('/api/')) {
    proxyApi(req, res);
    return;
  }
  await serveStatic(req, res);
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    log(`请求处理异常 ${req.method} ${req.url}：${err && err.message ? err.message : err}`);
    respond(res, 500, 'Internal Server Error');
  });
});

// 客户端在请求解析完成前断开、或发送畸形报文：回 400 并关闭连接，不影响进程。
server.on('clientError', (err, socket) => {
  log(`客户端连接错误：${err && err.code ? err.code : err}`);
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

// 最后一道兜底。网关宕机的代价（整站下线直到人工重启）远高于继续服务，
// 故记录后继续运行；真正的修复在各自的 .catch() 里，这两个处理器只用于兜底观测。
process.on('unhandledRejection', (reason) => {
  log(`unhandledRejection：${reason && reason.stack ? reason.stack : reason}`);
});
process.on('uncaughtException', (err) => {
  log(`uncaughtException：${err && err.stack ? err.stack : err}`);
});

server.listen(PORT, '0.0.0.0', () => {
  log(`gateway listening on 0.0.0.0:${PORT}  root=${ROOT}  api=${API_TARGET}`);
});
