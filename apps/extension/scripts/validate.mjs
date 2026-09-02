/**
 * 扩展「构建」验证脚本（unpacked 扩展无需打包，构建 = 结构 + 最小权限审计）。
 *
 * 检查项：
 *  1. manifest.json 可解析且 manifest_version === 3；
 *  2. 未申请超出「最小权限」清单的 permission；
 *  3. manifest 引用的 background/content_scripts js 文件与 lib 依赖均存在。
 */
/* global console, process */
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DISALLOWED_PERMISSIONS = new Set([
  'cookies',
  'history',
  'webRequest',
  'webRequestBlocking',
  'declarativeNetRequest',
  'declarativeNetRequestWithHostAccess',
  'scripting',
  'activeTab',
  'bookmarks',
  'downloads',
  'management',
  'privacy',
  'identity',
  'clipboardRead',
  'clipboardWrite',
]);

const errors = [];

const manifestPath = resolve(root, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

if (manifest.manifest_version !== 3) errors.push('manifest_version 必须为 3');
if (!manifest.name) errors.push('缺少 name');
if (!manifest.version) errors.push('缺少 version');

for (const permission of manifest.permissions ?? []) {
  if (DISALLOWED_PERMISSIONS.has(permission)) errors.push(`超出最小权限清单的 permission: ${permission}`);
}

const referencedFiles = [];
if (manifest.background?.service_worker) referencedFiles.push(manifest.background.service_worker);
for (const cs of manifest.content_scripts ?? []) referencedFiles.push(...(cs.js ?? []));
referencedFiles.push('src/lib/version.js', 'src/lib/config.js');

for (const file of referencedFiles) {
  try {
    await stat(resolve(root, file));
  } catch {
    errors.push(`manifest 引用的文件不存在: ${file}`);
  }
}

if (errors.length > 0) {
  console.error('[extension validate] 失败：');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`[extension validate] OK: ${manifest.name} v${manifest.version}（MV${manifest.manifest_version}，最小权限审计通过）`);
