/**
 * nginx-ctl.mjs —— 自包含 nginx 运行实例管理（隔离 prefix，不影响已装的 80 端口实例）
 *
 * 为什么不用安装目录实例？
 *  - 安装目录已有一个实例在监听 80（默认欢迎页），再改其配置/重载会影响该实例；
 *  - 且写入安装目录可能受权限限制。本方案把 nginx 的 prefix 指向项目内
 *    deploy-lan/nginx-prefix/，配置/日志/临时文件全部与项目共存，启动即验证、失败可回退。
 */
import { spawnSync, spawn } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  NGINX_PREFIX, findNginxExe, log, die, sleep, isPortFree, waitPort, pidOnPort, killPid,
} from './lib.mjs';

export function nginxVersion(nginxExe) {
  const r = spawnSync(nginxExe, ['-v'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
  const text = (r.stderr || r.stdout || '');
  const m = /nginx\/([\d.]+)/.exec(text);
  return m ? m[1] : '?';
}

/** 准备 prefix 目录结构 + mime.types + 渲染 nginx.conf。 */
export function ensureNginxPrefix({ nginxExe, gatewayPort, webDist, backendHost = '127.0.0.1', backendPort }) {
  const confDir = join(NGINX_PREFIX, 'conf');
  const logsDir = join(NGINX_PREFIX, 'logs');
  const tempDir = join(NGINX_PREFIX, 'temp');
  for (const d of [confDir, logsDir, tempDir]) mkdirSync(d, { recursive: true });

  // 清理历史日志，避免旧实例残留误导（保留最近一次 error.log 内容由 nginx 重写覆盖）
  for (const f of readdirSync(logsDir)) {
    try { rmSync(join(logsDir, f), { force: true }); } catch { /* ignore */ }
  }

  // mime.types：从 nginx 安装目录 conf 复制（读操作，无需管理员）
  const mimeSrc = join(dirname(nginxExe), 'conf', 'mime.types');
  const mimeDst = join(confDir, 'mime.types');
  if (!existsSync(mimeDst)) {
    if (!existsSync(mimeSrc)) die(`未找到 nginx mime.types：${mimeSrc}`);
    copyFileSync(mimeSrc, mimeDst);
    log(`已复制 mime.types → ${mimeDst}`);
  }

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

        # 静态资源长缓存
        location /assets/ {
            root ${webDist.replace(/\\/g, '/')};
            expires 7d;
            add_header Cache-Control "public, immutable";
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

export async function nginxStop(nginxExe, confPath, gatewayPort) {
  // 优雅停止（通过 prefix 内的 pid 文件）
  spawnSync(nginxExe, ['-s', 'quit', '-p', NGINX_PREFIX, '-c', confPath], {
    encoding: 'utf8', timeout: 10_000, windowsHide: true,
  });
  for (let i = 0; i < 20; i++) {
    if (await isPortFree(gatewayPort)) return true;
    await sleep(250);
  }
  // 兜底：直接结束占用进程
  const pid = await pidOnPort(gatewayPort);
  if (pid) await killPid(pid);
  return isPortFree(gatewayPort);
}

export async function nginxIsRunning(gatewayPort) {
  return !(await isPortFree(gatewayPort));
}
