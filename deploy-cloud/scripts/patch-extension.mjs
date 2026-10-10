#!/usr/bin/env node
/* global process, console */
/**
 * 扩展「云端版」打包：把看板/后端域名替换为正式 HTTPS 域名，并**固定扩展 ID**。
 *
 * 为什么必须固定 ID：
 *   未打包（unpacked）扩展的 ID 由扩展目录的绝对路径派生 —— 每个同事解压到不同
 *   目录就会得到不同 ID。而云端部署要把 CORS_ORIGINS 从「放行任意 chrome-extension://」
 *   收敛到具体来源，ID 不稳定就没法收敛。
 *   解法是在 manifest.json 注入 `key`（RSA 公钥），此后 ID 由公钥决定，与路径无关。
 *
 * 在开发机执行（产物会随 Release 一起发布）：
 *   node deploy-cloud/scripts/patch-extension.mjs --host dashboard.example.com --key-file <外部私钥路径>
 *
 * 产物：
 *   apps/web/dist/downloads/scienceing-extension.zip   （看板下载入口）
 *   apps/web/dist/downloads/extension.json             （后端读取的包元信息）
 *   私钥仅写入 --key-file 指定的位置，不参与发布。
 */

import { createHash, generateKeyPairSync, createPrivateKey, createPublicKey } from 'node:crypto';
import { cpSync, existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { spawnSync } from 'node:child_process';

import { writeZip, dirFilesRecursive } from '../../deploy-lan/scripts/lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLOUD_DIR = resolve(HERE, '..');
const REPO_ROOT = resolve(CLOUD_DIR, '..');
const EXT_SRC = resolve(arg('source', join(REPO_ROOT, 'apps', 'extension')));
const WEB_DOWNLOADS_DIR = resolve(arg('output', join(REPO_ROOT, 'apps', 'web', 'dist', 'downloads')));
const keyArgument = arg('key-file');
if (!keyArgument) throw new Error('必须用 --key-file 指定发布目录外的稳定私钥路径');
const KEY_FILE = resolve(keyArgument);
for (const directory of [EXT_SRC, WEB_DOWNLOADS_DIR]) {
  const child = relative(directory, KEY_FILE);
  if (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`)) {
    throw new Error('扩展私钥必须保存在扩展源码和发布目录之外');
  }
}
const ZIP_NAME = 'scienceing-extension.zip';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const HOST = arg('host', process.env.DASHBOARD_HOST);
if (!HOST) {
  console.error('缺少域名：--host dashboard.example.com（或设置 DASHBOARD_HOST）');
  process.exit(1);
}
if (!/^[a-zA-Z0-9.-]+$/.test(HOST) || new URL(`https://${HOST}`).hostname !== HOST.toLowerCase()) {
  console.error(`--host 只接受裸域名，不要带协议：${HOST}`);
  process.exit(1);
}

const ORIGIN = `https://${HOST}`;

/** 载入或生成 RSA 密钥对，返回 manifest 用的 base64 公钥与 Chrome 扩展 ID。 */
function ensureKeyPair() {
  let privateKey;
  if (existsSync(KEY_FILE)) {
    privateKey = createPrivateKey(readFileSync(KEY_FILE, 'utf8'));
    console.log(`[ext] 复用已有密钥：${KEY_FILE}`);
  } else {
    const { privateKey: generated } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    mkdirSync(dirname(KEY_FILE), { recursive: true });
    writeFileSync(KEY_FILE, generated, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    privateKey = createPrivateKey(generated);
    console.log(`[ext] 已生成新密钥：${KEY_FILE}（请离线备份，丢失后扩展 ID 会变）`);
  }

  const der = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  const manifestKey = der.toString('base64');

  // Chrome 扩展 ID = SHA-256(公钥 DER) 前 16 字节，每个 nibble 映射到 'a'..'p'
  const digest = createHash('sha256').update(der).digest().subarray(0, 16);
  const id = [...digest]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .split('')
    .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
    .join('');

  return { manifestKey, id };
}

/** 清理失败仅告警：受限环境（沙箱/杀软）可能禁止删除，不影响已产出的包。 */
function tryRm(p) {
  try { rmSync(p, { recursive: true, force: true }); } catch { console.warn(`[ext] 清理失败（可忽略）：${p}`); }
}

function main() {
  if (!existsSync(join(EXT_SRC, 'manifest.json'))) {
    console.error(`扩展目录不存在：${EXT_SRC}`);
    process.exit(1);
  }

  const { manifestKey, id } = ensureKeyPair();

  const STAGING = mkdtempSync(join(tmpdir(), 'scienceing-cloud-extension-'));
  for (const entry of ['manifest.json', 'package.json', 'src', 'scripts']) {
    cpSync(join(EXT_SRC, entry), join(STAGING, entry), { recursive: true });
  }

  // ── manifest.json：注入 key（固定 ID）+ 追加正式域名 ──
  const manifestPath = join(STAGING, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.key = manifestKey;

  const hostPattern = `${ORIGIN}/*`;
  manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), hostPattern])];

  for (const cs of manifest.content_scripts ?? []) {
    const matches = cs.matches ?? [];
    // 看板 content script：原本匹配 localhost:5173，补上正式域名
    if (matches.some((m) => /localhost|127\.0\.0\.1|5173/.test(m))) {
      cs.matches = [...new Set([...matches, hostPattern])];
    }
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  // ── src/lib/config.js：看板/后端域指向正式域名 ──
  const cfgPath = join(STAGING, 'src', 'lib', 'config.js');
  let cfg = readFileSync(cfgPath, 'utf8');
  const repl = (re, val) => { cfg = cfg.replace(re, val); };
  repl(
    /export const DASHBOARD_ORIGINS = \[[^\]]*\]/,
    `export const DASHBOARD_ORIGINS = ['${ORIGIN}', 'http://localhost:5173', 'http://127.0.0.1:5173'];`,
  );
  repl(/export const DASHBOARD_URL = '[^']*'/, `export const DASHBOARD_URL = '${ORIGIN}'`);
  repl(/export const DASHBOARD_MY_URL = '[^']*'/, `export const DASHBOARD_MY_URL = '${ORIGIN}/my'`);
  repl(/export const API_BASE = '[^']*'/, `export const API_BASE = '${ORIGIN}'`);
  writeFileSync(cfgPath, cfg, 'utf8');

  // ── 结构校验（在副本上跑，不动开发原版）──
  const validator = join(STAGING, 'scripts', 'validate.mjs');
  const check = spawnSync(process.execPath, [validator], { encoding: 'utf8', cwd: STAGING });
  const out = `${check.stdout ?? ''}${check.stderr ?? ''}`.trim();
  if (check.status !== 0) {
    console.error(`扩展校验失败：\n${out}`);
    process.exit(1);
  }
  console.log(out);

  // ── 打包 ──
  const files = dirFilesRecursive(STAGING).map((f) => ({
    absPath: join(STAGING, f.relPath),
    relPath: f.relPath,
  }));

  mkdirSync(WEB_DOWNLOADS_DIR, { recursive: true });
  const zipPath = join(WEB_DOWNLOADS_DIR, ZIP_NAME);
  writeZip(zipPath, files);

  const meta = {
    version: manifest.version,
    fileName: ZIP_NAME,
    size: statSync(zipPath).size,
    downloadPath: `/downloads/${ZIP_NAME}`,
    updatedAt: new Date().toISOString(),
    dashboardOrigin: ORIGIN,
    extensionId: id,
    sha256: createHash('sha256').update(readFileSync(zipPath)).digest('hex'),
  };
  writeFileSync(join(WEB_DOWNLOADS_DIR, 'extension.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

  tryRm(STAGING);

  console.log('');
  console.log(`扩展已打包：${zipPath}`);
  console.log(`扩展 ID（stable）：${id}`);
  console.log('');
  console.log('请把下面两行写进服务器 .env，否则扩展会被 CORS 拦住：');
  console.log(`  CORS_ORIGINS=${ORIGIN},chrome-extension://${id}`);
  console.log(`  SCIENCEING_EXTENSION_IDS=${id}`);
}

main();
