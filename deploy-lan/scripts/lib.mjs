/**
 * lib.mjs —— 内网部署共享工具（零第三方依赖）
 *
 * 设计原则：
 *  - 全部能力基于 Node 内置模块 + Windows 自带 PowerShell（只读查询/结束进程用），
 *    不依赖 pnpm / 全局命令 / 管理员权限。
 *  - 所有对外部进程的调用都返回可解析结果并写入运行日志，便于双击 .bat 后排查。
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, appendFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ───────────────────────── 路径常量 ─────────────────────────

export const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
export const DEPLOY_DIR = resolve(SCRIPTS_DIR, '..');           // <repo>/deploy-lan
export const REPO_ROOT = resolve(DEPLOY_DIR, '..');             // 仓库根
export const RUN_DIR = join(DEPLOY_DIR, 'run');
export const DIST_DIR = join(DEPLOY_DIR, 'dist');
export const NGINX_PREFIX = join(DEPLOY_DIR, 'nginx-prefix');
export const EXT_LAN_DIR = join(DEPLOY_DIR, 'extension-lan');

export const APP_SERVER = join(REPO_ROOT, 'apps', 'server');
export const APP_WEB = join(REPO_ROOT, 'apps', 'web');
export const APP_EXTENSION = join(REPO_ROOT, 'apps', 'extension');
export const WORKER_DIR = join(REPO_ROOT, 'playwright', 'worker');
export const WEB_DIST = join(APP_WEB, 'dist');
export const DATA_DIR = join(REPO_ROOT, 'data');
export const DB_FILE = join(DATA_DIR, 'scienceing.db');

export const ENV_FILE = join(REPO_ROOT, '.env');
export const CFG_FILE = join(DEPLOY_DIR, 'config.env');

export const BACKEND_DEFAULT_PORT = 3000;
export const GATEWAY_DEFAULT_PORT = 18080;

export const DEPLOY_LOG = join(RUN_DIR, 'deploy.log');

// ───────────────────────── 日志 ─────────────────────────

function ensureRunDir() {
  for (const d of [RUN_DIR, DIST_DIR]) mkdirSync(d, { recursive: true });
}

export function log(...parts) {
  const line = `[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] ${parts.join(' ')}`;
  ensureRunDir();
  try { appendFileSync(DEPLOY_LOG, line + '\n', 'utf8'); } catch { /* 忽略 */ }
  // 控制台同样输出（chcp 65001 的 cmd 下中文正常）
  console.log(line);
}

export function die(message, code = 1) {
  log(`✖ ${message}`);
  process.exit(code);
}

export function section(title) {
  log('');
  log(`▶ ${title}`);
}

// ───────────────────────── 通用小工具 ─────────────────────────

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 探测端口是否已被监听（TCP connect 成功 = 有监听者）。 */
export function probePortInUse(port, host = '127.0.0.1') {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ port, host });
    const settle = (inUse) => { socket.destroy(); resolvePromise(inUse); };
    socket.setTimeout(700);
    socket.on('connect', () => settle(true));      // 连上 = 端口有监听
    socket.on('error', () => settle(false));       // ECONNREFUSED = 空闲
    socket.on('timeout', () => settle(false));
  });
}

export const isPortFree = (port, host = '127.0.0.1') => probePortInUse(port, host).then((used) => !used);

/** 等待端口出现监听；超时返回 false。 */
export async function waitPort(port, timeoutMs, host = '127.0.0.1') {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probePortInUse(port, host)) return true;
    await sleep(300);
  }
  return false;
}

/** 极简 .env 解析（# 注释 / export 前缀 / 单双引号 / BOM），与 scripts/dev.mjs 行为一致。 */
export function parseEnvFile(content) {
  const result = {};
  for (const rawLine of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    result[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return result;
}

export function readEnvFile(file) {
  if (!existsSync(file)) return {};
  return parseEnvFile(readFileSync(file, 'utf8'));
}

/** 合并环境变量：默认 < 仓库 .env < config.env < process.env（只注入未占用的键）。 */
export function mergedEnv(extra = {}) {
  const env = { ...process.env };
  for (const [k, v] of Object.entries({ ...readEnvFile(ENV_FILE), ...readEnvFile(CFG_FILE), ...extra })) {
    if (env[k] === undefined && v !== undefined && v !== '') env[k] = String(v);
  }
  return env;
}

// ───────────────────────── Node 运行时探测 ─────────────────────────

const NODE_CANDIDATES = [
  process.env.DEPLOY_NODE,
  process.env.NODE_BIN,
  'D:\\Applications\\nodejs\\node.exe',                 // 系统 Node 24（含 node:sqlite）
  process.execPath,                                     // 当前脚本所在 Node
  'node',
];

function probeNodeVersion(nodeBin) {
  try {
    const r = spawnSync(nodeBin, ['--version'], { encoding: 'utf8', timeout: 10_000, windowsHide: true });
    if (r.status !== 0) return null;
    const m = /v(\d+)\.(\d+)/.exec(r.stdout || '');
    return m ? { major: Number(m[1]), minor: Number(m[2]) } : null;
  } catch { return null; }
}

function probeNodeSqlite(nodeBin) {
  try {
    const r = spawnSync(nodeBin, ['-e', "import('node:sqlite').then(()=>process.exit(0),()=>process.exit(1))"], {
      encoding: 'utf8', timeout: 15_000, windowsHide: true,
    });
    return r.status === 0;
  } catch { return false; }
}

/**
 * 探测可用的 Node：>= 22.5 且内置 node:sqlite 可用。
 * 返回绝对路径；找不到时返回 null。
 */
export function findNodeBin() {
  const seen = new Set();
  for (const cand of NODE_CANDIDATES) {
    if (!cand || seen.has(cand)) continue;
    seen.add(cand);
    const bin = cand === 'node' ? 'node' : resolve(String(cand));
    if (!bin.toLowerCase().endsWith('node.exe') && bin !== 'node') continue;
    const v = probeNodeVersion(bin);
    if (!v) continue;
    if (v.major > 22 || (v.major === 22 && v.minor >= 5)) {
      if (probeNodeSqlite(bin)) return bin;
      log(`⚠ Node ${v.major}.${v.minor} 缺少内置 node:sqlite（需 >= 22.5），尝试其它候选…`);
    }
  }
  return null;
}

/** 运行一次命令（stdio 继承），返回退出码；失败时抛错。 */
export function run(command, args, opts = {}) {
  const { cwd = REPO_ROOT, env } = opts;
  return new Promise((resolvePromise, rejectPromise) => {
    log(`$ ${command} ${args.join(' ')}   (cwd=${cwd})`);
    const child = spawn(command, args, {
      cwd, env: env ?? process.env, shell: false, windowsHide: true, stdio: 'inherit',
    });
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`命令失败：${command} ${args.join(' ')}（退出码 ${code}）`));
    });
  });
}

/** 运行命令并收集 stdout（用于探测，不打印到终端）。 */
export function capture(command, args, opts = {}) {
  const { cwd = REPO_ROOT, env } = opts;
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd, env: env ?? process.env, shell: false, windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise(stdout);
      else rejectPromise(new Error(`${command} 退出码 ${code}\n${stderr || stdout}`));
    });
  });
}

// ───────────────────────── PowerShell 查询 ─────────────────────────

const PS = 'powershell.exe';
const PS_ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command'];

/**
 * 执行 PowerShell 并取最后一行 JSON。psBody 需自行把结果转成 JSON 输出。
 */
export function psJson(psBody) {
  const body = `${psBody} | ConvertTo-Json -Compress -Depth 4`;
  return new Promise((resolvePromise) => {
    try {
      const r = spawnSync(PS, [...PS_ARGS, body], { encoding: 'utf8', timeout: 20_000, windowsHide: true });
      if (r.status !== 0) return resolvePromise(null);
      const lines = (r.stdout || '').split(/\r?\n/).filter((l) => l.trim());
      if (lines.length === 0) return resolvePromise(null);
      try { resolvePromise(JSON.parse(lines[lines.length - 1])); }
      catch { resolvePromise(null); }
    } catch { resolvePromise(null); }
  });
}

/** 查某端口监听进程 PID（未占用返回 null）。 */
export async function pidOnPort(port) {
  const out = await psJson(
    `Get-NetTCPConnection -State Listen -LocalPort ${Number(port)} -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess`,
  );
  if (out === null || out === undefined || out === '') return null;
  const pid = Number(out);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

/** 查进程命令行（含可执行路径）。 */
export function processCmdline(pid) {
  return psJson(
    `(Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}" -ErrorAction SilentlyContinue | Select-Object -First 1).CommandLine`,
  );
}

/** 查进程是否存活。 */
export async function processAlive(pid) {
  const r = await psJson(`(Get-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue | Measure-Object).Count`);
  return r === 1;
}

/** 用 Stop-Process 结束进程（安全策略禁 taskkill，故用 PowerShell 原生 cmdlet）。 */
export function killPid(pid) {
  return new Promise((resolvePromise) => {
    try {
      const r = spawnSync(PS, [...PS_ARGS, `Stop-Process -Id ${Number(pid)} -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 400; "killed"`], {
        encoding: 'utf8', timeout: 15_000, windowsHide: true,
      });
      resolvePromise(r.status === 0);
    } catch { resolvePromise(false); }
  });
}

/** 获取局域网 IPv4 候选（优先 WLAN/DHCP，跳过 vEthernet/虚拟网卡/回环/链路本地）。 */
export async function detectLanIp() {
  const rows = await psJson(
    `Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | ` +
    `Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } | ` +
    `Select-Object InterfaceAlias,IPAddress,PrefixOrigin`,
  );
  if (!rows) return null;
  const list = Array.isArray(rows) ? rows : [rows];
  const usable = list.filter((r) => r && r.IPAddress && !/^(vEthernet|Loopback|Bluetooth|VMware|VirtualBox|Docker|WSL)/i.test(r.InterfaceAlias || ''));
  const byScore = usable.map((r) => {
    const alias = r.InterfaceAlias || '';
    let score = 0;
    if (/WLAN|Wi-?Fi|无线|Wireless/i.test(alias)) score += 10;
    if (r.PrefixOrigin === 'Dhcp') score += 5;
    if (/以太网|Ethernet/i.test(alias)) score += 3;
    return { ip: r.IPAddress, alias, score };
  }).sort((a, b) => b.score - a.score);
  return byScore.length > 0 ? byScore[0] : (list[0] ? { ip: list[0].IPAddress, alias: list[0].InterfaceAlias } : null);
}

/** HTTP GET 小工具：返回 { status, ok, body, error }。 */
export async function httpGet(url, timeoutMs = 8000) {
  const mod = await import(url.startsWith('https:') ? 'node:https' : 'node:http');
  return new Promise((resolvePromise) => {
    const req = mod.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolvePromise({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 500, body });
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolvePromise({ status: 0, ok: false, body: '', error: 'timeout' }); });
    req.on('error', (e) => resolvePromise({ status: 0, ok: false, body: '', error: e.message }));
  });
}

// ───────────────────────── 最小 ZIP 写入器（store 方式，零依赖） ─────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * 生成 ZIP（仅 store，无压缩）。
 * files: [{ absPath, relPath }]，relPath 使用正斜杠且不含前导斜杠。
 * 该实现不引入第三方依赖，浏览器/解压工具均可正常读取。
 */
export function writeZip(outFile, files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const { absPath, relPath } of files) {
    const data = readFileSync(absPath);
    const name = Buffer.from(relPath, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4);         // version needed to extract
    local.writeUInt16LE(0x0800, 6);     // general purpose flag: UTF-8 names
    local.writeUInt16LE(0, 8);          // compression method: store
    local.writeUInt16LE(0, 10);         // mod time
    local.writeUInt16LE(0x21, 12);      // mod date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);    // central directory header signature
    cd.writeUInt16LE(20, 4);            // version made by
    cd.writeUInt16LE(20, 6);            // version needed
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);            // external attrs
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);     // end of central directory signature
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, Buffer.concat([...chunks, ...central, end]));
}

export function dirFilesRecursive(root, baseRel = '') {
  const out = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const abs = join(root, entry.name);
    const rel = baseRel ? `${baseRel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...dirFilesRecursive(abs, rel));
    else if (entry.name !== '.DS_Store') out.push({ absPath: abs, relPath: rel.replace(/\\/g, '/') });
  }
  return out;
}

// ───────────────────────── 配置文件（config.env） ─────────────────────────

export const CFG_TEMPLATE = `# deploy-lan 部署配置（首次运行自动生成；修改后对 start/deploy 生效）
# 端口被占用时可改这里，改完重新执行 deploy（后端 PORT 在仓库根 .env 中修改）

# 网关端口（同事访问 http://<本机IP>:<此端口>）
GATEWAY_PORT=${GATEWAY_DEFAULT_PORT}

# 本机局域网 IP（留空 = 自动探测；路由器 DHCP 会变，若同事访问失败请改成当前实际 IP）
LAN_IP=

# 浏览器扩展是否在部署时自动把看板/后端域名替换为 LAN 地址并打包 zip
PACK_LAN_EXTENSION=true

# nginx 可执行文件（留空 = 自动探测安装目录/PATH）
NGINX_EXE=

# 服务托管方式：nginx = 优先 nginx（失败自动回退 node）；node = 只用内置网关
GATEWAY_MODE=nginx

# 后端端口冲突时是否自动结束占用者（仅限命令行包含本项目路径或 dist\\main.js 的进程）
AUTO_STOP_OWNER=true
`;

export function loadConfig() {
  if (!existsSync(CFG_FILE)) {
    mkdirSync(DEPLOY_DIR, { recursive: true });
    writeFileSync(CFG_FILE, CFG_TEMPLATE, 'utf8');
    log(`已生成部署配置：${CFG_FILE}`);
  }
  return readEnvFile(CFG_FILE);
}

/** 探测 nginx 可执行文件：config > 常见安装目录 > PATH。 */
export function findNginxExe(cfg) {
  const candidates = [
    cfg.NGINX_EXE,
    'D:\\Applications\\nginx-1.30.4\\nginx.exe',
    'C:\\nginx\\nginx.exe',
    'nginx.exe',
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      const r = spawnSync(c, ['-v'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
      if (r.error) continue;
      if (r.status === 0 || (r.stderr || '').includes('nginx version')) {
        return c === 'nginx.exe' ? c : resolve(String(c));
      }
    } catch { /* try next */ }
  }
  return null;
}

export function readJson(file) {
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

export function writeJson(file, obj) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
}

export { existsSync };
