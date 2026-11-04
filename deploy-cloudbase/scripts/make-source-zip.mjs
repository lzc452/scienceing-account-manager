#!/usr/bin/env node
/**
 * 生成「云托管本地代码上传」用的源码包（免本地 Docker）。
 *
 * CloudBase 控制台 → 云托管 → 新建服务 → 本地代码：上传的就是这个 zip。
 * 平台按包内的 Dockerfile 自行构建镜像，所以本机不需要装 Docker。
 *
 *   node deploy-cloudbase/scripts/make-source-zip.mjs
 *   node deploy-cloudbase/scripts/make-source-zip.mjs --out D:/tmp/src.zip
 *
 * 排除规则与 .dockerignore 保持一致：依赖、构建产物、数据库、密钥、日志都不进包。
 * 为什么不用系统 zip/Compress-Archive：它们不容易表达「排除 node_modules 但保留 public」，
 * 且 Windows 的 Compress-Archive 对十万级文件很慢。这里零依赖、按白名单裁剪。
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    root: { type: 'string', default: process.cwd() },
  },
});

const ROOT = resolve(values.root);
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
const OUT = resolve(values.out ?? join(ROOT, 'dist', `scienceing-cloudbase-src-${stamp}.zip`));

/** 目录级排除（相对仓库根，前缀匹配）。 */
const EXCLUDED_DIRS = [
  'node_modules',
  '.pnpm-store',
  '.pnpm-cache',
  '.pnpm-state',
  '.git',
  '.vscode',
  '.idea',
  'coverage',
  'temp',
  'tmp',
  '.local-data',
  '.local-backup',
  '.workbuddy',
  '.workbuddy-ai',
  '.codegraph',
  '.agent-teams',
  '.ai-memory',
  'data',
  'logs',
  'backups',
  'backlog',
  'docs',
  'screenshots',
  'deployment',
  'deploy-lan',
  'deploy-cloud',
  'playwright/mock',
  'playwright/.auth',
  'playwright/.worker-logs',
  'apps/web/public/downloads',
  'apps/server/src/e2e',
  'scripts/test',
];

/** 任意层级的目录名排除（含 dist / 各类测试目录）。 */
const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'dist-build',
  'dist-cloudbase-test',
  '__pycache__',
  'test',
  'tests',
  '.worker-logs',
  '.auth',
]);

/** 文件名后缀 / 精确名排除。 */
const EXCLUDED_SUFFIXES = ['.db', '.db-wal', '.db-shm', '.db-journal', '.log', '.pem', '.key', '.p12', '.tsbuildinfo'];
const EXCLUDED_FILES = new Set(['.env', '.env.local', '.env.production', 'check.log', 'login.log']);

function excluded(relPath) {
  const posix = relPath.split(sep).join('/');
  if (EXCLUDED_DIRS.some((dir) => posix === dir || posix.startsWith(`${dir}/`))) return true;
  const segments = posix.split('/');
  if (segments.some((segment) => EXCLUDED_DIR_NAMES.has(segment))) return true;
  const name = segments.at(-1) ?? '';
  if (EXCLUDED_FILES.has(name)) return true;
  if (name.startsWith('.env.')) return true;
  if (EXCLUDED_SUFFIXES.some((suffix) => name.endsWith(suffix))) return true;
  return false;
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    const rel = relative(ROOT, abs);
    if (excluded(rel)) continue;
    if (entry.isDirectory()) walk(abs, files);
    else if (entry.isFile()) files.push({ abs, rel: rel.split(sep).join('/') });
  }
  return files;
}

// ── 最小 ZIP 写入器（deflate，UTF-8 文件名）────────────────────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function writeZip(outFile, files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  // 固定时间戳：2026-01-01 00:00，便于产物可复现
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const { abs, rel } of files) {
    const data = readFileSync(abs);
    const packed = deflateRawSync(data, { level: 6 });
    const useDeflate = packed.length < data.length;
    const body = useDeflate ? packed : data;
    const name = Buffer.from(rel, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, body);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(useDeflate ? 8 : 0, 10);
    cd.writeUInt16LE(dosTime, 12);
    cd.writeUInt16LE(dosDate, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);

    offset += local.length + name.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, Buffer.concat([...chunks, centralBuf, end]));
}

const files = walk(ROOT);
if (!files.some((file) => file.rel === 'Dockerfile')) {
  console.error('未在根目录找到 Dockerfile，云托管无法构建；请确认 --root 指向仓库根');
  process.exit(1);
}
writeZip(OUT, files);

const size = statSync(OUT).size;
const sha256 = createHash('sha256').update(readFileSync(OUT)).digest('hex');
console.log(`已生成：${OUT}`);
console.log(`文件数：${files.length}，包大小：${(size / 1024 / 1024).toFixed(2)} MB`);
console.log(`sha256：${sha256}`);
console.log('下一步：云托管 → 新建服务/发布版本 → 本地代码 → 上传该 zip（构建目录留空即仓库根）');
