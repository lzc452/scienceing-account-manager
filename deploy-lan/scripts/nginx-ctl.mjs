/**
 * nginx-ctl.mjs —— 自包含 nginx 运行实例管理（隔离 prefix，不影响已装的 80 端口实例）
 *
 * 为什么不用安装目录实例？
 *  - 安装目录已有一个实例在监听 80（默认欢迎页），再改其配置/重载会影响该实例；
 *  - 且写入安装目录可能受权限限制。本方案把 nginx 的 prefix 指向项目内
 *    deploy-lan/nginx-prefix/，配置/日志/临时文件全部与项目共存，启动即验证、失败可回退。
 */
import { spawnSync, spawn } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync, writeFileSync, rmSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  NGINX_PREFIX, log, die, isPortFree, waitPort,
} from './lib.mjs';

export function nginxVersion(nginxExe) {
  const r = spawnSync(nginxExe, ['-v'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
  const text = (r.stderr || r.stdout || '');
  const m = /nginx\/([\d.]+)/.exec(text);
  return m ? m[1] : '?';
}

/** logs/ 下必须保留、不得删除的文件（运行中实例仍在使用）。 */
const LOG_KEEP = new Set(['nginx.pid']);

/** 轮转文件保留天数；超过即删除，避免 .bak 无限累积。 */
const LOG_RETENTION_DAYS = 7;

/**
 * 日志轮转：把历史日志改名归档，而不是清空目录。
 *
 * 此前这里无条件删除 logs/ 下的**所有**文件，包括运行中实例的 nginx.pid。后果有二：
 *  ① 优雅停止（nginx -s quit）依赖 pid 文件，被删后退化成强杀；
 *  ② 失败路径指引用户去读的 error.log 被一并销毁，排障线索直接消失。
 *
 * 现在保留 pid，其余改名归档；被占用而改不动的文件跳过（清理是尽力而为，不阻断部署）。
 */
function rotateNginxLogs(logsDir) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  for (const name of readdirSync(logsDir)) {
    if (LOG_KEEP.has(name)) continue;
    try {
      renameSync(join(logsDir, name), join(logsDir, `${name}.${stamp}.bak`));
    } catch {
      // 文件被运行中的 nginx 占用 / 权限不足：保留原状即可
    }
  }

  // 清理超期归档，保证目录不会无限增长。
  const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const name of readdirSync(logsDir)) {
    if (!name.endsWith('.bak')) continue;
    try {
      if (statSync(join(logsDir, name)).mtimeMs < cutoff) rmSync(join(logsDir, name), { force: true });
    } catch {
      // 忽略单个文件的清理失败
    }
  }
}

/** 准备 prefix 目录结构 + mime.types + 渲染 nginx.conf。 */
export function ensureNginxPrefix({ nginxExe, gatewayPort, webDist, backendHost = '127.0.0.1', backendPort }) {
  const confDir = join(NGINX_PREFIX, 'conf');
  const logsDir = join(NGINX_PREFIX, 'logs');
  const tempDir = join(NGINX_PREFIX, 'temp');
  for (const d of [confDir, logsDir, tempDir]) mkdirSync(d, { recursive: true });

  // 日志轮转（保留 nginx.pid；详见 rotateNginxLogs 注释）
  rotateNginxLogs(logsDir);

  // mime.types：从 nginx 安装目录 conf 复制（读操作，无需管理员）
  const mimeSrc = join(dirname(nginxExe), 'conf', 'mime.types');
  const mimeDst = join(confDir, 'mime.types');
  if (!existsSync(mimeDst)) {
    if (!existsSync(mimeSrc)) die(`未找到 nginx mime.types：${mimeSrc}`);
    copyFileSync(mimeSrc, mimeDst);
    log(`已复制 mime.types → ${mimeDst}`);
  }

  // 安全响应头（与 gateway.mjs 的 SECURITY_HEADERS 保持一致）。
  //
  // ⚠ nginx 的 add_header **不继承**：子 location 一旦自己写了 add_header，
  // 父级（server/http）的全部失效。因此凡是自带 add_header 的 location
  // 都必须重复声明一次，否则那些响应会静默丢掉 CSP。
  const securityHeaders = [
    `add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;`,
    'add_header X-Content-Type-Options "nosniff" always;',
    'add_header X-Frame-Options "DENY" always;',
    'add_header Referrer-Policy "same-origin" always;',
  ].join('\n        ');

  // nginx 配置相对路径以 prefix 为基准；include 用绝对路径，杜绝歧义
  const conf = `# 科应共享账号管理平台 内网网关（由 deploy-lan 自动生成）
worker_processes  1;
pid               logs/nginx.pid;
error_log         logs/error.log info;
events { worker_connections 256; }
http {
    include       ${mimeDst.replace(/\\/g, '/')};
    default_type  application/octet-stream;
    sendfile      on;
    keepalive_timeout 65;
    access_log    logs/access.log;

    server {
        listen       ${gatewayPort};
        server_name  _;

        root   ${webDist.replace(/\\/g, '/')};
        index  index.html;

        # 安全响应头（含 CSP）；带 add_header 的子 location 需各自重复声明
        ${securityHeaders}

        # SPA history 路由回退：直接访问 /admin/xxx 或刷新不 404
        location / {
            try_files $uri $uri/ /index.html;
        }

        # API 反代到本机后端（与前端同源 /api，浏览器无需 CORS）
        location /api/ {
            proxy_pass         http://${backendHost}:${backendPort};
            proxy_http_version 1.1;
            proxy_set_header   Host $host;
            proxy_set_header   X-Real-IP $remote_addr;
            proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header   X-Forwarded-Proto $scheme;
            proxy_read_timeout 180s;
        }

        # 扩展分发：/downloads/scienceing-extension.zip（部署时由 extension:pack 生成）
        # 缺失必须 404，不能走 SPA 回退，否则用户会下载到 index.html。
        location /downloads/ {
            try_files $uri =404;
            location ~ \.zip$ {
                default_type application/zip;
                add_header Content-Disposition 'attachment';
                # 本块自带 add_header → 必须重复声明，否则此处响应丢失 CSP
                ${securityHeaders}
            }
        }

        # 静态资源长缓存
        location /assets/ {
            root ${webDist.replace(/\\/g, '/')};
            expires 7d;
            add_header Cache-Control "public, immutable";
            # 同上：自带 add_header 会切断继承
            ${securityHeaders}
            try_files $uri =404;
        }
    }
}
`;
  const confPath = join(confDir, 'nginx.conf');
  writeFileSync(confPath, conf, 'utf8');
  return confPath;
}

export function nginxTest(nginxExe, confPath) {
  const r = spawnSync(nginxExe, ['-t', '-p', NGINX_PREFIX, '-c', confPath], {
    encoding: 'utf8', timeout: 15_000, windowsHide: true,
  });
  const text = `${r.stderr || ''}${r.stdout || ''}`;
  return { ok: r.status === 0 && /test is successful/.test(text), text: text.trim() };
}

/** 启动隔离 nginx 实例（阻塞直到端口就绪或失败）。 */
export async function nginxStart(nginxExe, confPath, gatewayPort) {
  if (!(await isPortFree(gatewayPort))) {
    return { ok: false, error: `网关端口 ${gatewayPort} 已被占用` };
  }
  const r = spawn(nginxExe, ['-p', NGINX_PREFIX, '-c', confPath], {
    detached: true, stdio: 'ignore', windowsHide: true,
  });
  r.unref();
  const ok = await waitPort(gatewayPort, 8000);
  if (!ok) {
    const err = existsSync(join(NGINX_PREFIX, 'logs', 'error.log'))
      ? readFileSync(join(NGINX_PREFIX, 'logs', 'error.log'), 'utf8').split(/\r?\n/).filter(Boolean).slice(-6).join(' | ')
      : '未知错误（请查看 deploy-lan/nginx-prefix/logs/error.log）';
    return { ok: false, error: err };
  }
  return { ok: true };
}

