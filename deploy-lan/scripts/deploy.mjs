#!/usr/bin/env node
/**
 * deploy.mjs —— 内网生产部署主 CLI（首次部署 / 更新 / 启停 / 状态 / 扩展打包）
 *
 * 用法：
 *   node deploy-lan/scripts/deploy.mjs <subcommand>
 *
 * 子命令：
 *   deploy            首次/全量部署：构建 server+web+worker → 迁移/种子 → 起后端 → 起网关 → 打扩展zip
 *   update            更新：同 deploy（建议先手动 git pull；也可 --pull 自动拉取）
 *   start             快速启动（跳过构建，仅用已有产物；未构建过会报错提示先 deploy）
 *   stop              停止后端与网关
 *   status            状态自检：进程/端口/健康/局域网访问地址
 *   build             只构建不启动（server/web/worker + 扩展 zip）
 *   nginx:test        测试隔离 nginx 实例配置（含输出）
 *   extension:pack    仅把扩展替换为 LAN 地址并打包 zip
 *   db:reset-admin    把 admin 口令重置为仓库 .env 的 ADMIN_INITIAL_PASSWORD
 *   env:print         打印解析后的关键环境配置（不含密码明文以外的敏感值结构）
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, openSync, rmSync, mkdirSync, copyFileSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  log, die, section, sleep, run, mergedEnv, readEnvFile, findNodeBin, loadConfig,
  detectLanIp, httpGet, waitPort, isPortFree, pidOnPort, processCmdline, killPid, processAlive,
  writeJson, readJson, findNginxExe, psJson, dirFilesRecursive, writeZip,
  REPO_ROOT, APP_SERVER, APP_WEB, APP_EXTENSION, WORKER_DIR, WEB_DIST, RUN_DIR, DIST_DIR, ENV_FILE,
  EXT_LAN_DIR, BACKEND_DEFAULT_PORT, GATEWAY_DEFAULT_PORT,
} from './lib.mjs';
import {
  ensureNginxPrefix, nginxTest, nginxStart, nginxStop, nginxVersion,
} from './nginx-ctl.mjs';

// ───────────────────────── 运行时解析 ─────────────────────────

async function resolveRuntime() {
  const nodeBin = findNodeBin();
  if (!nodeBin) die('未找到可用的 Node.js（需 >= 22.5 且内置 node:sqlite）。\n  请安装 Node 24，或把 deploy-lan/config.env 的 NODE_BIN 指到 node.exe 绝对路径。');
  const cfg = loadConfig();
  const backendPort = Number(readEnvFile(ENV_FILE).PORT || process.env.PORT || BACKEND_DEFAULT_PORT);
  const gatewayPort = Number(cfg.GATEWAY_PORT || GATEWAY_DEFAULT_PORT);
  let lan = null;
  const explicit = (cfg.LAN_IP || '').trim();
  if (explicit) lan = { ip: explicit, alias: 'manual' };
  else lan = await detectLanIp();
  if (!lan) die('未能自动探测局域网 IP，请在 deploy-lan/config.env 中手动设置 LAN_IP。');
  return { nodeBin, cfg, backendPort, gatewayPort, lan };
}

function cfgBool(v, def = false) {
  if (v === undefined || v === '') return def;
  return String(v).toLowerCase() === 'true' || String(v) === '1';
}

// ───────────────────────── 后端 ─────────────────────────

const BACKEND_PID = join(RUN_DIR, 'backend.pid');
const BACKEND_LOG = join(RUN_DIR, 'backend.log');

async function stopBackend({ backendPort, force = false }) {
  const pidFile = BACKEND_PID;
  let pid = readJson(pidFile);
  let stopped = false;
  if (pid && (await processAlive(pid.pid))) {
    log(`停止后端（pid ${pid.pid}，来自 pid 文件）…`);
    await killPid(pid.pid);
    stopped = true;
  }
  const owner = await pidOnPort(backendPort);
  if (owner) {
    const cmd = await processCmdline(owner);
    const ours = /scienceing|dist[\\/]main\.js|apps[\\/]server/i.test(cmd || '');
    if (ours || force) {
      log(`停止后端端口 ${backendPort} 占用进程（pid ${owner}${ours ? '' : '，--force' }）…`);
      await killPid(owner);
      stopped = true;
    } else {
      die(`端口 ${backendPort} 被其它程序占用（pid ${owner}：${(cmd || '').slice(0, 120)}）。\n` +
        `  如确认要结束请加 --force；或修改仓库 .env 的 PORT 换端口。`);
    }
  }
  if (pid) tryRm(pidFile);
  for (let i = 0; i < 20 && !(await isPortFree(backendPort)); i++) await sleep(200);
  return stopped;
}

async function startBackend({ nodeBin, backendPort }) {
  section('启动生产后端');
  const distMain = join(APP_SERVER, 'dist', 'main.js');
  if (!existsSync(distMain)) die(`后端未构建：${distMain}（请先执行 deploy/build）`);
  const env = mergedEnv({ NODE_ENV: 'production' });
  const logFd = openSync(BACKEND_LOG, 'a');
  const child = spawn(nodeBin, [distMain], {
    cwd: APP_SERVER, env, detached: true, windowsHide: true, stdio: ['ignore', logFd, logFd],
  });
  child.unref();
  writeJson(BACKEND_PID, { pid: child.pid, startedAt: new Date().toISOString() });
  log(`后端已拉起（pid ${child.pid}，日志 ${BACKEND_LOG}）`);

  if (!(await waitPort(backendPort, 30_000))) {
    const tail = readFileSync(BACKEND_LOG, 'utf8').split(/\r?\n/).filter(Boolean).slice(-10).join('\n');
    die(`后端 30s 内未监听 ${backendPort}。日志尾部：\n${tail}`);
  }
  const probe = await waitHttp(`http://127.0.0.1:${backendPort}/api/extension/config`, 25_000);
  if (!probe.ok || probe.status >= 500) {
    const tail = readFileSync(BACKEND_LOG, 'utf8').split(/\r?\n/).filter(Boolean).slice(-10).join('\n');
    die(`后端健康检查失败（/api/extension/config → ${probe.status ?? probe.error}）。日志尾部：\n${tail || '（日志为空，请稍后查看 ' + BACKEND_LOG + '）'}`);
  }
  log(`后端就绪：http://0.0.0.0:${backendPort}/api（局域网地址 http://<本机IP>:${backendPort}/api）`);
  return true;
}

// ───────────────────────── 网关（nginx 优先，node 兜底） ─────────────────────────

const NODE_GATEWAY_PID = join(RUN_DIR, 'gateway-node.pid');
const NODE_GATEWAY_LOG = join(RUN_DIR, 'gateway.log');

async function stopGateway({ gatewayPort, nginxExe, force = false }) {
  // 1) 先按 pid 文件停 node 网关
  const pid = readJson(NODE_GATEWAY_PID);
  if (pid && (await processAlive(pid.pid))) {
    log(`停止 node 网关（pid ${pid.pid}）…`);
    await killPid(pid.pid);
    tryRm(NODE_GATEWAY_PID);
  }
  // 2) 回收所有“本项目隔离 nginx”进程（按命令行特征，覆盖无端口/僵尸 master）
  try {
    const rows = await psList(`Get-CimInstance Win32_Process -Filter "Name='nginx.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'nginx-prefix' } | Select-Object ProcessId,CommandLine`);
    for (const row of rows || []) {
      log(`停止隔离 nginx 实例（pid ${row.ProcessId}）…`);
      await killPid(Number(row.ProcessId));
    }
  } catch { /* 查询失败继续 */ }
  // 3) 若端口仍被占：按占用者决定处理
  const owner = await pidOnPort(gatewayPort);
  if (owner) {
    const cmd = await processCmdline(owner);
    const isOurNginx = /nginx-prefix|deploy-lan/i.test(cmd || '');
    if (isOurNginx || /nginx\.exe/i.test(cmd || '') || force) {
      log(`停止网关端口 ${gatewayPort} 占用进程（pid ${owner}，${isOurNginx ? '本项目 nginx' : 'nginx/force'}）…`);
      if (nginxExe && /nginx\.exe/i.test(cmd || '')) {
        spawnSync(nginxExe, ['-s', 'quit', '-p', join(REPO_ROOT, 'deploy-lan', 'nginx-prefix'), '-c', join(REPO_ROOT, 'deploy-lan', 'nginx-prefix', 'conf', 'nginx.conf')], { encoding: 'utf8', timeout: 8000, windowsHide: true });
        await sleep(1200);
      }
      const still = await pidOnPort(gatewayPort);
      if (still) await killPid(still);
    } else {
      die(`网关端口 ${gatewayPort} 被其它程序占用（pid ${owner}），请换 GATEWAY_PORT 或 --force`);
    }
  }
  // 4) 等待端口真正释放
  for (let i = 0; i < 30; i++) {
    if (await isPortFree(gatewayPort)) return true;
    await sleep(200);
  }
  log(`⚠ 网关端口 ${gatewayPort} 未能释放（仍有进程占用），继续尝试启动。`);
  return true;
}

/** 列出进程（psJson 的便捷封装，返回数组）。 */
async function psList(body) {
  const out = await psJson(body);
  if (!out) return [];
  return Array.isArray(out) ? out : [out];
}

async function startGateway({ nodeBin, cfg, gatewayPort, backendPort, lanIp }) {
  section('启动生产网关（静态 + /api 反代）');
  if (!existsSync(join(WEB_DIST, 'index.html'))) die(`前端未构建：${join(WEB_DIST, 'index.html')}（请先 deploy/build）`);
  await stopGateway({ gatewayPort, nginxExe: cfg.NGINX_EXE });

  const mode = String(cfg.GATEWAY_MODE || 'nginx').toLowerCase();
  let chosen = 'node';
  if (mode !== 'node') {
    const nginxExe = findNginxExe(cfg);
    if (nginxExe) {
      log(`使用 nginx ${nginxVersion(nginxExe)}（${nginxExe}）`);
      const confPath = ensureNginxPrefix({
        nginxExe, gatewayPort, webDist: WEB_DIST, backendPort,
      });
      const t = nginxTest(nginxExe, confPath);
      if (!t.ok) {
        log(`⚠ nginx 配置自检未通过，自动回退 node 网关。输出：\n${t.text}`);
      } else {
        const started = await nginxStart(nginxExe, confPath, gatewayPort);
        if (started.ok) {
          chosen = 'nginx';
          log(`nginx 网关已启动：http://0.0.0.0:${gatewayPort}（prefix: deploy-lan/nginx-prefix）`);
        } else {
          log(`⚠ nginx 启动失败（${started.error}），自动回退 node 网关。`);
        }
      }
    } else {
      log('⚠ 未找到 nginx 可执行文件，使用内置 node 网关。');
    }
  }
  if (chosen === 'node') {
    const logFd = openSync(NODE_GATEWAY_LOG, 'a');
    const child = spawn(nodeBin, [
      join(REPO_ROOT, 'deploy-lan', 'scripts', 'gateway.mjs'),
      '--root', WEB_DIST,
      '--api', `http://127.0.0.1:${backendPort}`,
      '--port', String(gatewayPort),
      '--log', NODE_GATEWAY_LOG,
    ], { cwd: REPO_ROOT, env: mergedEnv(), detached: true, windowsHide: true, stdio: ['ignore', logFd, logFd] });
    child.unref();
    writeJson(NODE_GATEWAY_PID, { pid: child.pid, startedAt: new Date().toISOString() });
    if (!(await waitPort(gatewayPort, 10_000))) die(`node 网关未在 ${gatewayPort} 监听`);
    chosen = 'node';
    log(`node 网关已启动：http://0.0.0.0:${gatewayPort}`);
  }
  // 健康自检（带重试，等服务/nginx 稳定应答）
  const root = await waitHttp(`http://127.0.0.1:${gatewayPort}/`, 15_000);
  const api = await waitHttp(`http://127.0.0.1:${gatewayPort}/api/extension/config`, 15_000);
  const ping = await httpGet(`http://127.0.0.1:${gatewayPort}/__gateway__/ping`, 3000);
  log(`网关自检：/ → ${root.status ?? root.error}，/api/extension/config → ${api.status ?? api.error}${ping.status ? `，ping → ${ping.status}` : ''}`);
  if (root.status !== 200 || api.status !== 200) {
    die('网关健康自检未通过，请查看日志（deploy-lan/run/*.log、nginx-prefix/logs/error.log）。');
  }
  return chosen;
}

// ───────────────────────── 构建步骤 ─────────────────────────

async function buildServer({ nodeBin }) {
  section('构建后端（tsc）');
  const tsc = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  await run(nodeBin, [tsc, '-p', join(APP_SERVER, 'tsconfig.json')], { cwd: REPO_ROOT });
}

async function buildWeb({ nodeBin }) {
  section('构建前端（vite build）');
  const vite = join(APP_WEB, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(vite)) die(`vite 不存在：${vite}（请先安装依赖 node_modules）`);
  const env = mergedEnv({ VITE_USE_MOCK: 'false', NODE_ENV: 'production' });
  await run(nodeBin, [vite, 'build', '--configLoader', 'native', '--emptyOutDir', 'false'], { cwd: APP_WEB, env });
  if (!existsSync(join(WEB_DIST, 'index.html'))) die('前端构建产物缺失 index.html');
  log(`前端产物就绪：${WEB_DIST}`);
}

async function buildWorker({ nodeBin }) {
  section('构建 Playwright Worker（tsc）');
  const tsc = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  await run(nodeBin, [tsc, '-p', join(WORKER_DIR, 'tsconfig.json')], { cwd: REPO_ROOT });
}

async function setupDatabase({ nodeBin }) {
  section('数据库迁移与种子（幂等）');
  mkdirSync(join(REPO_ROOT, 'data'), { recursive: true });
  const env = mergedEnv();
  await run(nodeBin, [join(APP_SERVER, 'dist', 'db', 'migrate.js')], { cwd: APP_SERVER, env });
  await run(nodeBin, [join(APP_SERVER, 'dist', 'db', 'seed.js')], { cwd: APP_SERVER, env });
  log('数据库迁移/种子完成');
}

// ───────────────────────── 扩展打包（LAN 版） ─────────────────────────

/** 删除失败仅告警（某些受限环境禁删除，不影响覆盖式打包逻辑）。 */
function tryRm(p) {
  try { rmSync(p, { recursive: true, force: true }); } catch (e) { log(`⚠ 清理失败（可忽略）：${p}`); }
}

function cpTree(src, dst, exclude = []) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (exclude.includes(entry.name)) continue;
    const s = join(src, entry.name);
    const d = join(dst, entry.name);
    if (entry.isDirectory()) cpTree(s, d, exclude);
    else copyFileSync(s, d);
  }
}

function patchExtensionForLan(extDir, lanOrigin, apiOrigin, gatewayPort) {
  // 1) manifest.json：解析 → 追加 LAN origin → 回写（保持键序）
  const manifestPath = join(extDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const httpOrigin = `${lanOrigin}/*`;
  if (manifest.host_permissions && !manifest.host_permissions.includes(httpOrigin)) {
    manifest.host_permissions.push(httpOrigin);
  }
  for (const cs of manifest.content_scripts || []) {
    const targets = cs.matches || [];
    if (targets.some((m) => /localhost|127\.0\.0\.1|5173/.test(m)) && !targets.includes(httpOrigin)) {
      targets.push(httpOrigin);
    }
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // 2) src/lib/config.js：看板/后端域指向 LAN 网关
  const cfgPath = join(extDir, 'src', 'lib', 'config.js');
  let cfg = readFileSync(cfgPath, 'utf8');
  const repl = (re, val) => { cfg = cfg.replace(re, val); };
  repl(/export const DASHBOARD_ORIGINS = \[[^\]]*\]/, `export const DASHBOARD_ORIGINS = ['${apiOrigin}', 'http://localhost:5173', 'http://127.0.0.1:5173'];`);
  repl(/export const DASHBOARD_URL = '[^']*'/, `export const DASHBOARD_URL = '${apiOrigin}'`);
  repl(/export const DASHBOARD_MY_URL = '[^']*'/, `export const DASHBOARD_MY_URL = '${apiOrigin}/my'`);
  repl(/export const API_BASE = '[^']*'/, `export const API_BASE = '${apiOrigin}'`);
  writeFileSync(cfgPath, cfg, 'utf8');
}

async function packLanExtension({ cfg, gatewayPort, lanIp, nodeBin }) {
  const shouldPack = cfgBool(cfg.PACK_LAN_EXTENSION, true);
  if (!shouldPack) { log('PACK_LAN_EXTENSION=false，跳过扩展 LAN 打包'); return null; }
  if (!lanIp) { log('未获得局域网 IP，跳过扩展 LAN 打包'); return null; }
  section('打包浏览器扩展（LAN 版）');
  if (!existsSync(join(APP_EXTENSION, 'manifest.json'))) die(`扩展目录不存在：${APP_EXTENSION}`);
  // 覆盖式复制到 deploy-lan/extension-lan 再打补丁（不动开发原版 apps/extension）。
  // 不做整目录删除：受限环境可能禁止删除；陈旧文件不会被 zip 收录（zip 按源清单）。
  const srcFiles = dirFilesRecursive(APP_EXTENSION);
  cpTree(APP_EXTENSION, EXT_LAN_DIR, []);
  const lanOrigin = `http://${lanIp}:${gatewayPort}`;
  patchExtensionForLan(EXT_LAN_DIR, lanOrigin, lanOrigin, gatewayPort);
  // 结构校验（基于副本运行，校验副本自身）
  const validator = join(EXT_LAN_DIR, 'scripts', 'validate.mjs');
  const r = spawnSync(nodeBin, [validator], { encoding: 'utf8', timeout: 20_000, cwd: EXT_LAN_DIR, windowsHide: true });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
  if (r.status !== 0) die(`扩展校验失败：\n${out}`);
  log(out);
  // 版本号
  const manifest = JSON.parse(readFileSync(join(EXT_LAN_DIR, 'manifest.json'), 'utf8'));
  const zipName = `scienceing-extension-lan-v${manifest.version}.zip`;
  const zipPath = join(DIST_DIR, zipName);
  writeZip(zipPath, srcFiles.map((f) => ({ absPath: join(EXT_LAN_DIR, f.relPath.replace(/\//g, '\\')), relPath: f.relPath })));
  log(`扩展 LAN 版已打包：${zipPath}`);
  log(`  · 看板/后端域：${lanOrigin}`);
  log(`  · 已解压目录（可直接“加载已解压的扩展程序”）：${EXT_LAN_DIR}`);
  return zipPath;
}

// ───────────────────────── 状态与信息 ─────────────────────────

/** 轮询式 HTTP 健康探测：等服务真正开始应答（避免监听就绪但应用未完全起好的竞态）。 */
async function waitHttp(url, timeoutMs = 25_000, stepMs = 500) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await httpGet(url, 3000);
    if (last.status && last.status > 0) return last;   // 服务已应答（2xx/4xx/5xx 都算起来）
    await sleep(stepMs);
  }
  return last;
}

function makeUrls(lanIp, gatewayPort, backendPort) {  const origin = `http://${lanIp}:${gatewayPort}`;
  return {
    dashboard: `${origin}/`,
    my: `${origin}/my`,
    admin: `${origin}/admin`,
    api: `http://${lanIp}:${backendPort}/api`,
  };
}

async function collectStatus() {
  const rt = await resolveRuntime();
  const urls = makeUrls(rt.lan.ip, rt.gatewayPort, rt.backendPort);
  const state = readJson(join(RUN_DIR, 'state.json')) || {};
  const backendOwner = await pidOnPort(rt.backendPort);
  const gwOwner = await pidOnPort(rt.gatewayPort);
  const results = {};
  if (backendOwner) {
    results.backend = { running: true, local: (await httpGet(`http://127.0.0.1:${rt.backendPort}/api/extension/config`, 5000)).status };
  } else results.backend = { running: false };
  if (gwOwner) {
    results.gateway = {
      running: true, mode: state.mode || '?',
      root: (await httpGet(`http://127.0.0.1:${rt.gatewayPort}/`, 5000)).status,
      api: (await httpGet(`http://127.0.0.1:${rt.gatewayPort}/api/extension/config`, 5000)).status,
      lanRoot: (await httpGet(urls.dashboard, 5000)).status,
    };
  } else results.gateway = { running: false };
  return { rt, urls, results };
}

async function cmdStatus() {
  const { rt, urls, results } = await collectStatus();
  console.log('');
  console.log('═'.repeat(60));
  console.log('  科应共享账号管理平台 · 内网部署状态');
  console.log('═'.repeat(60));
  console.log(`  本机局域网 IP : ${rt.lan.ip} (${rt.lan.alias})`);
  console.log(`  网关端口      : ${rt.gatewayPort}（模式：${results.gateway.running ? results.gateway.mode : '未运行'}）`);
  console.log(`  后端端口      : ${rt.backendPort}`);
  console.log('');
  console.log('  同事访问地址：');
  console.log(`    看板     ${urls.dashboard}`);
  console.log(`    管理后台 ${urls.admin}`);
  console.log(`    我的账号 ${urls.my}`);
  console.log(`    后端 API ${urls.api}`);
  console.log('');
  console.log(`  后端  ${results.backend.running ? `运行中（自检 ${results.backend.local ?? '?'}）` : '未运行'}`);
  if (results.gateway.running) {
    console.log(`  网关  ${results.gateway.mode}：/ → ${results.gateway.root ?? '?'}，/api → ${results.gateway.api ?? '?'}，局域网 / → ${results.gateway.lanRoot ?? '?'}`);
  } else {
    console.log('  网关  未运行');
  }
  const adminPwd = readEnvFile(ENV_FILE).ADMIN_INITIAL_PASSWORD;
  console.log(`  管理员账号 admin / ${adminPwd || '（见仓库 .env ADMIN_INITIAL_PASSWORD）'}（首次登录后请修改）`);
  console.log('═'.repeat(60));
}

// ───────────────────────── 子命令实现 ─────────────────────────

async function fullDeploy({ nodeBin, cfg, backendPort, gatewayPort, lan }) {
  const startedAt = Date.now();
  log('');
  log(`部署目标：看板 http://${lan.ip}:${gatewayPort}/   API http://${lan.ip}:${backendPort}/api`);
  log(`node：${nodeBin}`);

  // 0) 停止旧服务（避免文件占用/端口冲突）
  await stopBackend({ backendPort });
  await stopGateway({ gatewayPort, nginxExe: cfg.NGINX_EXE });

  // 1) 构建
  await buildServer({ nodeBin });
  await buildWorker({ nodeBin });

  // 2) 数据库
  await setupDatabase({ nodeBin });

  // 3) 前端
  await buildWeb({ nodeBin });

  // 4) 启动后端 → 网关
  await startBackend({ nodeBin, backendPort });
  const mode = await startGateway({ nodeBin, cfg, gatewayPort, backendPort, lanIp: lan.ip });

  // 5) 扩展 LAN 版
  const zipPath = await packLanExtension({ cfg, gatewayPort, lanIp: lan.ip, nodeBin });

  writeJson(join(RUN_DIR, 'state.json'), {
    mode, backendPort, gatewayPort, lanIp: lan.ip, startedAt: new Date().toISOString(),
    deploySeconds: ((Date.now() - startedAt) / 1000).toFixed(1), zipPath,
  });
  const urls = makeUrls(lan.ip, gatewayPort, backendPort);

  log('');
  log('✔ 部署完成 ✔');
  log('─'.repeat(60));
  log(`  同事访问（同一 WiFi 下浏览器打开）：`);
  log(`    看板     ${urls.dashboard}`);
  log(`    管理后台 ${urls.admin}`);
  log(`    我的账号 ${urls.my}`);
  if (zipPath) log(`  浏览器扩展 LAN 版：${zipPath}`);
  log('─'.repeat(60));
}

async function cmdDeploy(argv) {
  const rt = await resolveRuntime();
  await fullDeploy({ ...rt, force: argv.includes('--force') });
}

async function cmdUpdate(argv) {
  const rt = await resolveRuntime();
  if (argv.includes('--pull')) {
    section('git pull');
    try { await run('git', ['pull', '--ff-only'], { cwd: REPO_ROOT }); }
    catch (e) { log(`⚠ git pull 失败（继续部署）：${e.message}`); }
  }
  await fullDeploy({ ...rt, force: argv.includes('--force') });
}

async function cmdStart(argv) {
  const rt = await resolveRuntime();
  const { nodeBin, cfg, backendPort, gatewayPort, lan } = rt;
  const need = [
    join(APP_SERVER, 'dist', 'main.js'),
    join(WEB_DIST, 'index.html'),
    join(WORKER_DIR, 'dist', 'cli.js'),
  ].filter((p) => !existsSync(p));
  if (need.length > 0) {
    log(`以下产物缺失，请先执行 deploy（或 build 后再 start）：\n${need.join('\n')}`);
    die('产物缺失');
  }
  await stopBackend({ backendPort });
  await stopGateway({ gatewayPort, nginxExe: cfg.NGINX_EXE });
  await startBackend({ nodeBin, backendPort });
  const mode = await startGateway({ nodeBin, cfg, gatewayPort, backendPort, lanIp: lan.ip });
  writeJson(join(RUN_DIR, 'state.json'), { mode, backendPort, gatewayPort, lanIp: lan.ip, startedAt: new Date().toISOString() });
  await cmdStatus();
}

async function cmdStop(argv) {
  const rt = await resolveRuntime();
  const force = argv.includes('--force');
  await stopGateway({ gatewayPort: rt.gatewayPort, nginxExe: rt.cfg.NGINX_EXE, force });
  await stopBackend({ backendPort: rt.backendPort, force });
  log('已停止后端与网关。');
}

async function cmdBuild(argv) {
  const rt = await resolveRuntime();
  const { nodeBin, cfg, gatewayPort, lan } = rt;
  await buildServer({ nodeBin });
  await buildWorker({ nodeBin });
  await setupDatabase({ nodeBin });
  await buildWeb({ nodeBin });
  await packLanExtension({ cfg, gatewayPort, lanIp: lan.ip, nodeBin });
  log('build 完成（未启动服务，可执行 start）。');
}

async function cmdNginxTest(argv) {
  const rt = await resolveRuntime();
  const { cfg, gatewayPort, backendPort } = rt;
  const { findNginxExe } = await import('./lib.mjs');
  const nginxExe = findNginxExe(cfg);
  if (!nginxExe) die('未找到 nginx');
  const confPath = ensureNginxPrefix({ nginxExe, gatewayPort, webDist: WEB_DIST, backendPort });
  const t = nginxTest(nginxExe, confPath);
  console.log(`nginx ${nginxVersion(nginxExe)} @ ${nginxExe}`);
  console.log(`配置：${confPath}`);
  console.log(t.text);
  process.exit(t.ok ? 0 : 1);
}

async function cmdPackExt(argv) {
  const rt = await resolveRuntime();
  const zip = await packLanExtension({ cfg: rt.cfg, gatewayPort: rt.gatewayPort, lanIp: rt.lan.ip, nodeBin: rt.nodeBin });
  if (!zip) die('未生成 zip（检查 PACK_LAN_EXTENSION / LAN_IP）');
  console.log(`OK: ${zip}`);
}

async function cmdResetAdmin(argv) {
  const rt = await resolveRuntime();
  const env = mergedEnv();
  const pwd = env.ADMIN_INITIAL_PASSWORD || 'admin12345';
  const script = `
    const { openDatabase } = require('${join(APP_SERVER, 'dist', 'db', 'connection.js').replace(/\\/g, '/')}');
    const { defaultDatabasePath } = require('${join(APP_SERVER, 'dist', 'db', 'config.js').replace(/\\/g, '/')}');
    const { hashPassword } = require('${join(APP_SERVER, 'dist', 'crypto', 'password.js').replace(/\\/g, '/')}');
    (async () => {
      const db = openDatabase(defaultDatabasePath());
      try {
        const row = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
        if (!row) { console.log('admin 不存在，请先执行部署初始化数据库'); process.exit(1); }
        const hash = await hashPassword(${JSON.stringify(pwd)});
        db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE username = 'admin'").run(hash, new Date().toISOString());
        console.log('admin 口令已重置（ADMIN_INITIAL_PASSWORD）');
      } finally { db.close(); }
    })().catch((e) => { console.error(e.message); process.exit(1); });`;
  const r = spawnSync(rt.nodeBin, ['-e', script], { encoding: 'utf8', timeout: 30_000, cwd: APP_SERVER, windowsHide: true });
  console.log(`${r.stdout || ''}${r.stderr || ''}`);
  process.exit(r.status ?? 1);
}

async function cmdEnvPrint() {
  const rt = await resolveRuntime();
  const env = readEnvFile(ENV_FILE);
  console.log('仓库 .env 关键项：');
  for (const k of ['PORT', 'SCIENCEING_MASTER_KEY', 'ADMIN_INITIAL_PASSWORD', 'SCIENCING_ADMIN_URL', 'SCIENCING_WORKER_CLI', 'SCIENCING_STORAGE_STATE']) {
    if (env[k] !== undefined) console.log(`  ${k}=${/PASSWORD|KEY|SECRET/i.test(k) ? '(已设置，略)' : env[k]}`);
  }
  console.log(`node = ${rt.nodeBin}`);
  console.log(`局域网 IP = ${rt.lan.ip} (${rt.lan.alias})`);
  console.log(`网关端口 = ${rt.gatewayPort}，后端端口 = ${rt.backendPort}`);
}

// ───────────────────────── CLI 分发 ─────────────────────────

const SUB = {
  deploy: cmdDeploy,
  update: cmdUpdate,
  start: cmdStart,
  stop: cmdStop,
  status: cmdStatus,
  build: cmdBuild,
  'nginx:test': cmdNginxTest,
  'extension:pack': cmdPackExt,
  'db:reset-admin': cmdResetAdmin,
  'env:print': cmdEnvPrint,
};

async function main() {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  if (!sub || sub === 'help' || sub === '-h' || sub === '--help' || !SUB[sub]) {
    console.log(`用法：node deploy-lan/scripts/deploy.mjs <${Object.keys(SUB).join('|')}>`);
    process.exit(sub ? 1 : 0);
  }
  try {
    await SUB[sub](argv.slice(1));
  } catch (e) {
    die(e.message);
  }
}

main();
