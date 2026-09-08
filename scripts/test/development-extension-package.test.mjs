import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { packDevelopmentExtension } from '../lib/development-extension-package.mjs';

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;

function readZipEntries(zip) {
  let endOffset = -1;
  for (let offset = zip.length - 22; offset >= Math.max(0, zip.length - 65_557); offset -= 1) {
    if (zip.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) {
      endOffset = offset;
      break;
    }
  }
  assert.notEqual(endOffset, -1, 'ZIP 缺少中央目录结束记录');

  const entryCount = zip.readUInt16LE(endOffset + 10);
  const centralSize = zip.readUInt32LE(endOffset + 12);
  const centralOffset = zip.readUInt32LE(endOffset + 16);
  const entries = [];
  let offset = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(zip.readUInt32LE(offset), CENTRAL_DIRECTORY_HEADER, 'ZIP 中央目录记录损坏');
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    entries.push(zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  assert.equal(offset, centralOffset + centralSize, 'ZIP 中央目录长度不一致');
  return entries;
}

test('开发环境生成可解压且只包含扩展运行文件的 ZIP', async (context) => {
  const outputDir = await mkdtemp(join(tmpdir(), 'scienceing-dev-extension-'));
  context.after(() => rm(outputDir, { recursive: true, force: true }));

  const result = packDevelopmentExtension({
    outputDir,
    updatedAt: '2026-09-08T00:00:00.000Z',
  });
  const zip = await readFile(result.zipPath);
  const entries = readZipEntries(zip);
  const metadata = JSON.parse(await readFile(result.metadataPath, 'utf8'));

  assert.equal(zip.readUInt32LE(0), 0x04034b50, '文件头不是 ZIP local header');
  assert.ok(entries.includes('manifest.json'));
  assert.ok(entries.includes('src/background.js'));
  assert.ok(entries.includes('src/content/scienceing/password-protection.css'));
  assert.equal(entries.some((entry) => entry.startsWith('test/')), false);
  assert.equal(entries.some((entry) => entry.startsWith('scripts/')), false);
  assert.equal(metadata.available, true);
  assert.equal(metadata.size, zip.length);
  assert.equal(metadata.downloadPath, '/downloads/scienceing-extension.zip');
});
