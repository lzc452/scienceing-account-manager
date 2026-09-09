/* global process */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const ROOT = resolve(import.meta.dirname, '..', '..');
const POWERSHELL_SCRIPTS = [
  'create-release.ps1',
  'deploy-release.ps1',
  'sync-from-dev.ps1',
  'deploy-lan/scripts/release-common.ps1',
  'apps/server/test/acceptance-smoke.ps1',
];

test('PowerShell 脚本使用 UTF-8 BOM', () => {
  for (const relativePath of POWERSHELL_SCRIPTS) {
    const bytes = readFileSync(resolve(ROOT, relativePath));
    assert.deepEqual(
      [...bytes.subarray(0, 3)],
      [0xef, 0xbb, 0xbf],
      `${relativePath} 必须保留 UTF-8 BOM，确保 Windows PowerShell 5.1 正确读取中文`,
    );
  }
});

test('Windows PowerShell 5.1 能解析发布脚本', { skip: process.platform !== 'win32' }, () => {
  for (const relativePath of POWERSHELL_SCRIPTS) {
    const path = resolve(ROOT, relativePath).replaceAll("'", "''");
    const command = [
      '$tokens=$null',
      '$errors=$null',
      `[void][System.Management.Automation.Language.Parser]::ParseFile('${path}',[ref]$tokens,[ref]$errors)`,
      'if($errors.Count){$errors|ForEach-Object{Write-Error $_.Message};exit 1}',
    ].join(';');
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `${relativePath} 解析失败：${result.stdout}${result.stderr}`);
  }
});
