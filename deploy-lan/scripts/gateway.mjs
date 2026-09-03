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

function log(msg) {
  const line = `[gateway ${new Date().toISOString()}] ${msg}`;
  if (LOG_FILE) {
    import('node:fs').then((fs) => fs.appendFileSync(LOG_FILE, line + '\n')).catch(() => {});
  }
  console.log(line);
}

/** 路径穿越防护：解析后必须仍在 ROOT 内。 */
function safePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const p = normalize(join(ROOT, decoded.replace(/^\/+/, '')));
  return p.startsWith(ROOT + sep) || p === ROOT ? p : null;
}

async function serveStatic(req, res) {
  let pathname = req.url.split('?')[0];
  if (pathname === '/') pathname = '/index.html';
  let filePath = safePath(pathname);
  if (!filePath) { res.writeHead(403); res.end('Forbidden'); return; }

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

const server = createServer((req, res) => {
  if (req.url === '/__gateway__/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }
  if (req.url.startsWith('/api/')) proxyApi(req, res);
  else serveStatic(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  log(`gateway listening on 0.0.0.0:${PORT}  root=${ROOT}  api=${API_TARGET}`);
});
