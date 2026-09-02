#!/usr/bin/env node
/**
 * 科应共享账号管理平台 —— 一键开发环境启动
 *
 * 编排顺序（每步都可跳过/单跑，见文末 CLI 参数）：
 *   1. 环境预检（Node 版本 + node:sqlite 可用性）
 *   2. 依赖安装（node_modules 缺失时才执行）
 *   3. 环境变量（生成并持久化 .env / .env.local）
 *   4. 编译后端（dist 过期或缺失时才执行）
 *   5. 数据库迁移 + 种子（幂等，可重复执行）
 *   6. 启动后端（:3000/api）+ 前端（:5173），按前缀区分日志
 *
 * 设计取舍：
 * - **零第三方依赖**：仅用 Node 内置模块，不引入 concurrently / nodemon，
 *   避免为「启动」这件事污染运行时依赖与 lockfile。
 * - **跨平台**：全部子进程调用走 Node spawn，PowerShell 与 Git Bash 下命令完全一致。
 * - **密钥可复现**：SCIENCEING_MASTER_KEY 必须落盘复用——换 key 会导致
 *   已入库的科应账号密码（AES-256-GCM）无法解密，这是正确性要求而非便利。
 * - **前端必须关 mock**：USE_MOCK 默认为 true，不写 .env.local 的话
 *   前端跑的是内存 mock，看起来能登录但根本没连后端。
 *
 * 用法：
 *   pnpm dev                  # 全量：装依赖 → 建库 → 种子 → 后端 + 前端
 *   pnpm dev --only=server    # 只起后端
 *   pnpm dev --only=web       # 只起前端（后端需已运行）
 *   pnpm dev --reset          # 删库重来（迁移 + 种子）
 *   pnpm dev --rebuild        # 强制重新编译后端
 */

import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { createConnection } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ────────────────────────────── 常量 ──────────────────────────────

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_DIR = join(ROOT, 'apps', 'server')
const WEB_DIR = join(ROOT, 'apps', 'web')
const SERVER_DIST = join(SERVER_DIR, 'dist')
const SERVER_MAIN = join(SERVER_DIST, 'main.js')
const DB_DIR = join(ROOT, 'data')
const DB_FILE = join(DB_DIR, 'scienceing.db')
const ENV_FILE = join(ROOT, '.env')
const WEB_ENV_LOCAL = join(WEB_DIR, '.env.local')

const BACKEND_PORT = 3000
const FRONTEND_PORT = 5173

/** 本地开发默认管理员口令（可通过 .env 的 ADMIN_INITIAL_PASSWORD 覆盖） */
const DEFAULT_ADMIN_PASSWORD = 'admin12345'

const COLOR = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
}

// ────────────────────────────── 参数 ──────────────────────────────

const argv = process.argv.slice(2)
const flags = {
  install: !argv.includes('--no-install'),
  reset: argv.includes('--reset'),
  rebuild: argv.includes('--rebuild'),
  resetAdmin: argv.includes('--reset-admin'),
  only: (argv.find((a) => a.startsWith('--only=')) ?? '').split('=')[1] || 'all', // all | server | web
  help: argv.includes('--help') || argv.includes('-h'),
}

if (flags.help) {
  console.log(`
科应共享账号管理平台 —— 一键启动

  pnpm dev                 装依赖 → 生成 .env → 编译 → 迁移 → 种子 → 后端 + 前端
  pnpm dev --only=server   只启动后端（:3000/api）
  pnpm dev --only=web      只启动前端（:5173，需后端已运行）
  pnpm dev --reset         删除 data/scienceing.db 后重建（迁移 + 种子）
  pnpm dev --rebuild       强制重新编译后端
  pnpm dev --reset-admin   把 admin 口令强制重置为 .env 中的 ADMIN_INITIAL_PASSWORD
  pnpm dev --no-install    跳过依赖检查（node_modules 已就绪时更快）

环境变量（首次运行自动写入仓库根 .env，已 gitignore）：
  SCIENCEING_MASTER_KEY   AES-256-GCM 主密钥（hex 64 字符），**换值会导致已存密码无法解密**
  ADMIN_INITIAL_PASSWORD  种子管理员初始口令，默认 ${DEFAULT_ADMIN_PASSWORD}
  PORT                    后端端口，默认 ${BACKEND_PORT}

说明：种子幂等——库里已有 admin 时不会改口令。若登录报「用户名或密码错误」，
      说明库内是历史口令，用 \`pnpm dev --reset-admin\` 重置即可。`)
  process.exit(0)
}

// ────────────────────────────── 工具 ──────────────────────────────

const children = []
let shuttingDown = false

function color(name, text) {
  return process.stdout.isTTY ? `${COLOR[name]}${text}${COLOR.reset}` : text
}

function step(text) {
  console.log(`\n${color('cyan', '▶')} ${text}`)
}

function info(text) {
  console.log(`  ${color('gray', '·')} ${text}`)
}

function warn(text) {
  console.log(`  ${color('yellow', '!')} ${text}`)
}

function fail(text) {
  console.error(`\n${color('red', '✖')} ${text}`)
  process.exitCode = 1
}

/**
 * 是否需要 shell 包装：
 * Windows 上 pnpm 是 .cmd 垫片，必须走 shell；而 node.exe 是真实可执行文件，
 * 直接派生可避免 cmd.exe 重新解析参数——否则 `node -e <多行脚本>` 的引号与
 * 换行会被破坏，且子进程树里会多一层 cmd.exe。
 */
function needsShell(command) {
  return process.platform === 'win32' && !command.endsWith('.exe')
}

/** 运行一次性命令（stdio 透传），失败即抛出 */
function run(command, args, cwd = ROOT) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      env: process.env,
      shell: needsShell(command),
    })
    child.on('error', rejectPromise)
    child.on('exit', (code) => {
      if (code === 0) resolvePromise()
      else rejectPromise(new Error(`${command} ${args.join(' ')} 退出码 ${code}`))
    })
  })
}

/** 运行命令并捕获 stdout（用于探测类任务，不打印到终端） */
function capture(command, args, cwd = ROOT) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: needsShell(command),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', rejectPromise)
    child.on('exit', (code) => {
      if (code === 0) resolvePromise(stdout)
      else rejectPromise(new Error(`${command} 退出码 ${code}\n${stderr || stdout}`))
    })
  })
}

function isPortInUse(port) {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ port, host: '127.0.0.1' })
    const done = (used) => {
      socket.destroy()
      resolvePromise(used)
    }
    socket.setTimeout(600)
    socket.on('connect', () => done(true))
    socket.on('error', () => done(false))
    socket.on('timeout', () => done(false))
  })
}

/** 递归取目录下某类文件的最新 mtime（判断编译产物是否过期） */
function newestMtime(dir, ext) {
  let newest = 0
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith(ext)) newest = Math.max(newest, statSync(full).mtimeMs)
    }
  }
  walk(dir)
  return newest
}

// ───────────────────── 1. 环境预检 ─────────────────────

async function checkRuntime() {
  step('环境预检')

  const major = Number(process.versions.node.split('.')[0])
  info(`Node ${process.versions.node}（${process.platform}）`)
  if (major < 20) {
    throw new Error(`需要 Node.js >= 20（package.json engines），当前 ${process.versions.node}`)
  }

  // node:sqlite 在 22.5+ 才无需 flag；Node 20/21 直接不可用
  try {
    await import('node:sqlite')
    info('node:sqlite 可用')
  } catch (error) {
    throw new Error(
      `当前 Node 不支持内置 node:sqlite（${error.code ?? error.message}）。\n` +
        '  请升级到 Node.js >= 22.5（推荐 24，本项目在该版本开发验证），\n' +
        '  或 Node 22 早期版本改用 --experimental-sqlite 启动后端。',
    )
  }
}

// ───────────────────── 2. 依赖安装 ─────────────────────

async function ensureDependencies() {
  step('检查依赖')

  const required = [join(ROOT, 'node_modules'), join(SERVER_DIR, 'node_modules'), join(WEB_DIR, 'node_modules')]
  const missing = required.filter((dir) => !existsSync(dir))

  if (missing.length === 0) {
    info('node_modules 已就绪，跳过安装')
    return
  }
  if (!flags.install) {
    warn('node_modules 缺失，但已指定 --no-install，跳过')
    return
  }

  info('执行 pnpm install（首次或依赖缺失时）…')
  await run('pnpm', ['install'])
  info('依赖安装完成')
}

// ───────────────────── 3. 环境变量 ─────────────────────

/** 极简 .env 解析：支持 # 注释、export 前缀、单双引号、去 BOM */
function parseEnvFile(content) {
  const result = new Map()
  for (const rawLine of content.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    result.set(match[1], match[2].trim().replace(/^['"]|['"]$/g, ''))
  }
  return result
}

function upsertEnvFile(path, updates, headerComment) {
  let content = existsSync(path) ? readFileSync(path, 'utf8') : ''
  if (content.length > 0 && !content.endsWith('\n')) content += '\n'

  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`
    const pattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=.*$`, 'm')
    content = pattern.test(content)
      ? content.replace(pattern, line)
      : `${content}${content.endsWith('\n') || content === '' ? '' : '\n'}${line}\n`
  }

  if (headerComment && !content.trimStart().startsWith('#')) {
    content = `${headerComment}\n${content}`
  }
  writeFileSync(path, content, 'utf8')
}

async function ensureEnv() {
  step('配置环境变量')

  const existing = existsSync(ENV_FILE) ? parseEnvFile(readFileSync(ENV_FILE, 'utf8')) : new Map()
  const isNewFile = !existsSync(ENV_FILE)

  // Master Key 必须持久化：每次随机 = 重启后旧密码密文全部解不开
  let masterKey = existing.get('SCIENCEING_MASTER_KEY')
  if (masterKey) {
    info('SCIENCEING_MASTER_KEY 已存在，沿用（换值将导致已存密码无法解密）')
  } else {
    masterKey = randomBytes(32).toString('hex')
    info('已生成 SCIENCEING_MASTER_KEY 并写入 .env（32 字节 hex）')
  }

  const port = existing.get('PORT') ?? String(BACKEND_PORT)
  let adminPassword = existing.get('ADMIN_INITIAL_PASSWORD')
  if (!adminPassword) {
    adminPassword = DEFAULT_ADMIN_PASSWORD
    info('ADMIN_INITIAL_PASSWORD 未设置，使用本地开发默认值（可用 .env 覆盖）')
  }

  upsertEnvFile(
    ENV_FILE,
    {
      SCIENCEING_MASTER_KEY: masterKey,
      PORT: port,
      ADMIN_INITIAL_PASSWORD: adminPassword,
    },
    isNewFile
      ? '# 科应共享账号管理平台 —— 本地开发环境变量（由 scripts/dev.mjs 生成，已 gitignore）\n# 生产环境请勿使用本文件，务必通过密钥管理服务注入 SCIENCEING_MASTER_KEY。\n'
      : '',
  )

  // 载入当前进程，后续子进程自动继承
  for (const [key, value] of parseEnvFile(readFileSync(ENV_FILE, 'utf8'))) {
    if (process.env[key] === undefined) process.env[key] = value
  }
  info(`后端端口 PORT=${process.env.PORT}`)

  // WEB_PORT 可选：默认 5173（vite.config 固定端口），冲突时可临时改走其它端口
  if (process.env.WEB_PORT) info(`前端端口 WEB_PORT=${process.env.WEB_PORT}（覆盖默认 ${FRONTEND_PORT}）`)

  // 前端默认 USE_MOCK=true，必须显式关掉才会真正请求后端
  if (existsSync(WEB_ENV_LOCAL)) {
    const webEnv = parseEnvFile(readFileSync(WEB_ENV_LOCAL, 'utf8'))
    if (webEnv.get('VITE_USE_MOCK') === 'false') {
      info('apps/web/.env.local 已关闭 mock，前端直连后端')
    } else {
      upsertEnvFile(WEB_ENV_LOCAL, { VITE_USE_MOCK: 'false' })
      info('已将 VITE_USE_MOCK=false 写入 apps/web/.env.local')
    }
  } else {
    upsertEnvFile(
      WEB_ENV_LOCAL,
      { VITE_USE_MOCK: 'false' },
      '# 由 scripts/dev.mjs 生成：关闭前端内存 mock，直连 http://localhost:3000/api\n# 设为 true 可退回 mock 模式（无需后端即可开发 UI）。\n',
    )
    info('已创建 apps/web/.env.local（VITE_USE_MOCK=false）')
  }

  return { adminPassword }
}

// ───────────────────── 4. 编译后端 ─────────────────────

async function buildServer() {
  step('编译后端')

  let stale = flags.rebuild || !existsSync(SERVER_MAIN)
  if (!stale) {
    stale = newestMtime(join(SERVER_DIR, 'src'), '.ts') > statSync(SERVER_MAIN).mtimeMs
  }

  if (!stale) {
    info('dist 已是最新，跳过编译（需要重编加 --rebuild）')
    return
  }
  await run('pnpm', ['--filter', '@scienceing/server', 'build'])
  info('编译完成 → apps/server/dist')
}

// ───────────────────── 5. 数据库：迁移 + 种子 ─────────────────────

async function setupDatabase() {
  step('数据库迁移与种子')

  if (flags.reset && existsSync(DB_FILE)) {
    for (const suffix of ['', '-wal', '-shm']) {
      rmSync(`${DB_FILE}${suffix}`, { force: true })
    }
    info('已删除既有数据库（--reset）')
  }

  const node = process.execPath
  await run(node, ['dist/db/migrate.js'], SERVER_DIR)
  info('迁移完成')

  await run(node, ['dist/db/seed.js'], SERVER_DIR)
  info('种子完成（幂等：admin 与 KY-01~KY-10 已存在则跳过）')

  // 种子不会改写既有 admin 的口令，这里统一核对一次并按需重置，
  // 避免「起来了但登不进去」这种最常见的卡点。
  if (flags.resetAdmin) {
    await run(node, ['-e', adminScript('reset', process.env.ADMIN_INITIAL_PASSWORD)], SERVER_DIR)
    info(`admin 口令已重置为 .env 中的 ADMIN_INITIAL_PASSWORD`)
  }
}

/**
 * 在后端 dist（CommonJS）上跑一段内联脚本，用于探测/重置 admin 口令。
 * 复用已编译产物，不新增源文件、不改动应用代码。
 */
function adminScript(mode, password) {
  return `
    const { openDatabase } = require('./dist/db/connection');
    const { defaultDatabasePath } = require('./dist/db/config');
    const { hashPassword, verifyPassword } = require('./dist/crypto/password');
    (async () => {
      const db = openDatabase(defaultDatabasePath());
      try {
        const row = db.prepare("SELECT id, password_hash FROM users WHERE username = 'admin'").get();
        if (!row) { console.log(JSON.stringify({ exists: false, matches: false })); return; }
        if ('${mode}' === 'reset') {
          const hash = await hashPassword(${JSON.stringify(password)});
          db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE username = 'admin'")
            .run(hash, new Date().toISOString());
          console.log(JSON.stringify({ exists: true, matches: true, reset: true }));
          return;
        }
        console.log(JSON.stringify({ exists: true, matches: await verifyPassword(${JSON.stringify(password)}, row.password_hash) }));
      } finally {
        db.close();
      }
    })().catch((error) => { console.error(error.message); process.exit(1); });
  `
}

/** 返回 { exists, matches }：库内 admin 是否存在、其口令是否等于 .env 设定的值 */
async function inspectAdmin() {
  try {
    const output = await capture(process.execPath, ['-e', adminScript('inspect', process.env.ADMIN_INITIAL_PASSWORD)], SERVER_DIR)
    return JSON.parse(output.trim().split(/\r?\n/).pop())
  } catch {
    return { exists: false, matches: false, unknown: true }
  }
}

// ───────────────────── 6. 启动服务 ─────────────────────

/**
 * 启动子服务并等待其「真正可连通」——就绪判定用端口轮询（TCP connect），
 * 而非解析 stdout。原因：vite 的就绪输出带 ANSI 色码且随 TTY 检测变化，
 * 用正则匹配既脆弱又跨版本易失效；直接轮询监听端口最稳。
 *
 * 若服务在就绪前就退出（非零码）或 stderr 命中致命错误，则立即失败。
 */
function startService({ name, command, args, cwd, port, readyTimeoutMs, logColor, hintOnFail }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: needsShell(command),
      // POSIX 下 detached 才能用 kill(-pid) 连带终止子进程树
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    children.push({ name, child })
    let settled = false
    let buffer = ''
    let fatal = false

    const prefix = color(logColor, `[${name}]`)
    const pump = (chunk) => {
      const text = chunk.toString()
      buffer = (buffer + text).slice(-8000)
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) console.log(`${prefix} ${line}`)
      }
      // 致命错误提前判出，避免傻等到超时
      if (/EADDRINUSE|Port \d+ is already in use|Cannot find module|Error: listen/.test(text)) {
        fatal = true
      }
    }

    child.stdout.on('data', pump)
    child.stderr.on('data', pump)

    child.on('error', (error) => {
      if (!settled) {
        settled = true
        rejectPromise(error)
      }
    })

    child.on('exit', (code, signal) => {
      if (!settled) {
        settled = true
        const tail = buffer.split(/\r?\n/).filter(Boolean).slice(-6).join('\n')
        rejectPromise(
          new Error(
            `${name} 启动失败（退出码 ${code}${signal ? `，信号 ${signal}` : ''}）\n` +
              (hintOnFail?.(buffer, port) ?? tail),
          ),
        )
      } else if (!shuttingDown) {
        console.log(`${prefix} ${color('yellow', `进程退出（退出码 ${code}）`)}`)
      }
    })

    // 轮询端口就绪
    const deadline = Date.now() + readyTimeoutMs
    const poll = async () => {
      if (settled) return
      if (fatal) {
        settled = true
        rejectPromise(new Error(`${name} 启动失败（端口冲突或模块缺失）\n${buffer.split(/\r?\n/).filter(Boolean).slice(-6).join('\n')}`))
        return
      }
      if (await isPortInUse(port)) {
        settled = true
        resolvePromise()
        return
      }
      if (Date.now() > deadline) {
        settled = true
        rejectPromise(new Error(`${name} 在 ${readyTimeoutMs / 1000}s 内未监听端口 ${port}`))
        return
      }
      setTimeout(poll, 400)
    }
    poll()
  })
}

function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  try {
    if (process.platform === 'win32') {
      // /t 连带终止子进程树，避免 vite / node 残留占用端口
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
    } else {
      process.kill(-child.pid, 'SIGTERM')
    }
  } catch {
    /* 进程已退出，忽略 */
  }
}

function shutdown(reason) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`\n${color('yellow', '▶')} 正在停止服务（${reason}）…`)
  for (const { child } of children) killTree(child)
  setTimeout(() => process.exit(process.exitCode ?? 0), 300)
}

process.on('SIGINT', () => shutdown('Ctrl+C'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('exit', () => {
  if (!shuttingDown) for (const { child } of children) killTree(child)
})

async function startBackend() {
  const port = Number(process.env.PORT ?? BACKEND_PORT)
  step(`启动后端（http://localhost:${port}/api）`)

  if (await isPortInUse(port)) {
    warn(`端口 ${port} 已被占用，跳过启动后端（可能已在运行）`)
    return false
  }

  await startService({
    name: 'server',
    command: process.execPath,
    args: ['dist/main.js'],
    cwd: SERVER_DIR,
    port,
    readyTimeoutMs: 40_000,
    logColor: 'green',
    hintOnFail: (buffer) =>
      /EADDRINUSE/.test(buffer)
        ? `端口 ${port} 被占用：请先结束占用进程，或修改 .env 的 PORT。`
        : buffer.split(/\r?\n/).filter(Boolean).slice(-8).join('\n'),
  })
  return true
}

async function startFrontend() {
  const port = Number(process.env.WEB_PORT ?? FRONTEND_PORT)
  step(`启动前端（http://localhost:${port}）`)

  if (await isPortInUse(port)) {
    warn(`端口 ${port} 已被占用，跳过启动前端（可能已在运行）`)
    return false
  }

  // 注意：不再通过 `pnpm dev -- --port X` 转发端口——Git Bash 下 pnpm 的 corepack
  // 垫片会破坏 `--`，导致覆盖失效并漂移到 5174。端口改由 vite.config.mjs 读取
  // WEB_PORT 环境变量（已在 env 中），此处只负责拉起 dev 脚本；就绪判定由
  // startService 轮询端口完成，不依赖解析 vite 的彩色输出。
  await startService({
    name: 'web',
    command: 'pnpm',
    args: ['--filter', '@scienceing/web', 'dev'],
    cwd: ROOT,
    port,
    readyTimeoutMs: 90_000,
    logColor: 'cyan',
    hintOnFail: (buffer) =>
      /Port \d+ is already in use/.test(buffer)
        ? `前端端口 ${port} 被占用：请先结束占用进程，或设置 WEB_PORT=其他端口 后重试。`
        : buffer.split(/\r?\n/).filter(Boolean).slice(-8).join('\n'),
  })
  return true
}

// ────────────────────────────── 主流程 ──────────────────────────────

async function main() {
  const startedAt = Date.now()

  console.log(color('dim', '\n科应共享账号管理平台 · 一键启动'))
  console.log(color('dim', '─'.repeat(52)))

  await checkRuntime()
  await ensureDependencies()
  const { adminPassword } = await ensureEnv()

  const needBackend = flags.only === 'all' || flags.only === 'server'
  const needFrontend = flags.only === 'all' || flags.only === 'web'

  // --only=web 时后端由用户自行运行，无需编译建库（但库必须已存在）
  let adminState = { exists: false, matches: false }
  if (needBackend) {
    await buildServer()
    await setupDatabase()
    adminState = await inspectAdmin()
  } else if (!existsSync(DB_FILE)) {
    warn(`未找到 ${DB_FILE}，前端将拿不到数据；请先执行 \`pnpm dev\`（或 --only=server）初始化数据库`)
  }

  if (needBackend) await startBackend()
  if (needFrontend) await startFrontend()

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`\n${color('green', '✔')} 全部就绪（${seconds}s）`)
  console.log(color('dim', '─'.repeat(52)))
  const webPort = Number(process.env.WEB_PORT ?? FRONTEND_PORT)
  console.log(`  账号池看板   ${color('cyan', `http://localhost:${webPort}`)}`)
  console.log(`  管理后台     ${color('cyan', `http://localhost:${webPort}/admin`)}`)
  console.log(`  后端 API     ${color('cyan', `http://localhost:${process.env.PORT ?? BACKEND_PORT}/api`)}`)
  if (adminState.matches) {
    console.log(`  管理员账号   ${color('green', `admin / ${adminPassword}`)} ${color('yellow', '（本地开发默认口令，首次登录后请修改）')}`)
  } else if (adminState.exists) {
    console.log(`  管理员账号   ${color('yellow', 'admin —— 库内是历史口令，与 .env 不一致')}`)
    console.log(`               ${color('dim', '重置：pnpm dev --reset-admin（会改为上面的口令）；或 pnpm dev:reset 删库重来')}`)
  } else {
    console.log(`  管理员账号   ${color('dim', 'admin（未初始化，请先执行 pnpm dev --only=server）')}`)
  }
  console.log(`  数据库       ${DB_FILE}`)
  console.log(color('dim', '─'.repeat(52)))
  console.log(color('dim', '  Ctrl+C 停止全部服务\n'))
}

main().catch((error) => {
  fail(error.message)
  shutdown('启动失败')
})
