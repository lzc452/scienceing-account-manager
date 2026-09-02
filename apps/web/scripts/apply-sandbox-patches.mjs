/**
 * 沙箱兼容补丁（vite 运行时）。
 *
 * 背景：本环境的文件沙箱禁止 `child_process.spawn` 使用管道 stdio（EPERM），
 * 而 vite 在构建期有两处依赖子进程 spawn：
 *   1. `replaceDefine` 用 esbuild transform 做 define 替换；
 *   2. `optimizeSafeRealPathSync` 用 `exec("net use")` 做 UNC 网络盘映射。
 *
 * 这两处与业务无关，改用纯字符串替换 / 原生 realpath 后即可在沙箱内构建。
 * 运行方式：`pnpm install` 之后执行 `node scripts/apply-sandbox-patches.mjs`。
 * 幂等：已打补丁则跳过。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB_DIR = resolve(fileURLToPath(import.meta.url), '..', '..')
// 从 apps/web 定位工作区根 node_modules/.pnpm 下的 vite 包
const STORE_DIR = resolve(WEB_DIR, '..', '..', 'node_modules', '.pnpm')

const REPLACE_DEFINE_OLD = `async function replaceDefine(environment, code, id, define) {
  const esbuildOptions = environment.config.esbuild || {};
  const result = await transform$1(code, {
    loader: "js",
    charset: esbuildOptions.charset ?? "utf8",
    platform: "neutral",
    define,
    sourcefile: id,
    sourcemap: environment.config.command === "build" ? !!environment.config.build.sourcemap : true
  });
  if (result.map.includes("<define:")) {
    const originalMap = new TraceMap(result.map);
    if (originalMap.sources.length >= 2) {
      const sourceIndex = originalMap.sources.indexOf(id);
      const decoded = decodedMap(originalMap);
      decoded.sources = [id];
      decoded.mappings = decoded.mappings.map(
        (segments) => segments.filter((segment) => {
          const index = segment[1];
          segment[1] = 0;
          return index === sourceIndex;
        })
      );
      result.map = JSON.stringify(encodedMap(new TraceMap(decoded)));
    }
  }
  return {
    code: result.code,
    map: result.map || null
  };
}`

const REPLACE_DEFINE_NEW = `async function replaceDefine(environment, code, id, define) {
  // Sandbox workaround: esbuild transform spawns a service child process (EPERM).
  let resultCode = code;
  const keys = Object.keys(define).sort((a, b) => b.length - a.length);
  for (const key of keys) resultCode = resultCode.split(key).join(String(define[key]));
  return { code: resultCode, map: null };
}`

const REALPATH_OLD = `  exec("net use", (error, stdout) => {
    if (error) return;
    const lines = stdout.split("\\n");
    for (const line of lines) {
      const m = parseNetUseRE.exec(line);
      if (m) windowsNetworkMap.set(m[2], m[1]);
    }
    if (windowsNetworkMap.size === 0) {
      safeRealpathSync = fs__default.realpathSync.native;
    } else {
      safeRealpathSync = windowsMappedRealpathSync;
    }
  });`

const REALPATH_NEW = `  // Sandbox workaround: \`net use\` spawn is blocked (EPERM). Local paths
  // do not need UNC network-drive mapping; use the native realpath directly.
  safeRealpathSync = fs__default.realpathSync.native;`

const PATCHES = [
  { name: 'replaceDefine', from: REPLACE_DEFINE_OLD, to: REPLACE_DEFINE_NEW, marker: 'split(key).join(String(define[key]))' },
  { name: 'optimizeSafeRealPathSync', from: REALPATH_OLD, to: REALPATH_NEW, marker: 'use the native realpath directly' },
]

function findViteChunkFiles() {
  if (!existsSync(STORE_DIR)) return []
  const out = []
  for (const dir of readdirSync(STORE_DIR)) {
    if (!dir.startsWith('vite@')) continue
    const chunksDir = join(STORE_DIR, dir, 'node_modules', 'vite', 'dist', 'node', 'chunks')
    if (!existsSync(chunksDir)) continue
    for (const f of readdirSync(chunksDir)) {
      if (f.startsWith('dep-') && f.endsWith('.js')) out.push(join(chunksDir, f))
    }
  }
  return out
}

const files = findViteChunkFiles()
if (files.length === 0) {
  console.log('未找到 vite chunk 文件（是否已 pnpm install？）')
  process.exit(0)
}

let applied = 0
for (const file of files) {
  let code = readFileSync(file, 'utf8')
  let changed = false
  for (const p of PATCHES) {
    if (code.includes(p.marker)) {
      console.log(`  [已打补丁] ${p.name}`)
    } else if (code.includes(p.from)) {
      code = code.replace(p.from, p.to)
      changed = true
      console.log(`  [已应用]   ${p.name}`)
    } else {
      console.log(`  [跳过]     未匹配到模式：${p.name}`)
    }
  }
  if (changed) {
    writeFileSync(file, code)
    applied++
  }
}

console.log(applied === 0 ? '补丁均已就绪，无需修改。' : `已修改 ${applied} 个文件，请重新运行构建。`)
