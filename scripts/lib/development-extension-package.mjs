import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirFilesRecursive, writeZip } from '../../deploy-lan/scripts/lib.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, '..', '..');
const DEFAULT_EXTENSION_DIR = join(REPOSITORY_ROOT, 'apps', 'extension');

export const DEVELOPMENT_EXTENSION_DOWNLOAD_DIR = join(
  REPOSITORY_ROOT,
  'apps',
  'web',
  'public',
  'downloads',
);

const ZIP_FILE_NAME = 'scienceing-extension.zip';
const METADATA_FILE_NAME = 'extension.json';

function runtimeEntries(extensionDir) {
  return dirFilesRecursive(extensionDir).filter(({ relPath }) =>
    relPath === 'manifest.json' || relPath.startsWith('src/'));
}

function assertManifestFiles(manifest, entries) {
  const names = new Set(entries.map(({ relPath }) => relPath));
  const referenced = [manifest.background?.service_worker];
  for (const contentScript of manifest.content_scripts ?? []) {
    referenced.push(...(contentScript.js ?? []), ...(contentScript.css ?? []));
  }

  for (const file of referenced.filter(Boolean)) {
    if (!names.has(file)) {
      throw new Error(`扩展 manifest 引用的运行文件不存在：${file}`);
    }
  }
}

/**
 * 为本地 Vite 开发服务器生成扩展分发包和后端可读取的元数据。
 * 仅收录 manifest 与 src 运行文件，避免把测试、脚本和说明文档分发给用户。
 */
export function packDevelopmentExtension({
  extensionDir = DEFAULT_EXTENSION_DIR,
  outputDir = DEVELOPMENT_EXTENSION_DOWNLOAD_DIR,
  dashboardOrigin = 'http://localhost:5173',
  updatedAt = new Date().toISOString(),
} = {}) {
  const manifest = JSON.parse(readFileSync(join(extensionDir, 'manifest.json'), 'utf8'));
  const entries = runtimeEntries(extensionDir);
  assertManifestFiles(manifest, entries);

  const zipPath = join(outputDir, ZIP_FILE_NAME);
  writeZip(zipPath, entries);

  const metadataPath = join(outputDir, METADATA_FILE_NAME);
  const metadata = {
    available: true,
    version: manifest.version,
    fileName: ZIP_FILE_NAME,
    size: statSync(zipPath).size,
    downloadPath: `/downloads/${ZIP_FILE_NAME}`,
    updatedAt,
    dashboardOrigin,
  };
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

  return {
    ...metadata,
    outputDir,
    zipPath,
    metadataPath,
  };
}
