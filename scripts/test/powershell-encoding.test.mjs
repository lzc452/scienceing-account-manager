/* global process */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const ROOT = resolve(import.meta.dirname, '..', '..');
const POWERSHELL_SCRIPTS = [
  'create-release.ps1',
  'deploy-release.ps1',
  'make-release.ps1',
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

test('Windows PowerShell 5.1 能清理 pnpm 风格的长路径目录', { skip: process.platform !== 'win32' }, () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'scienceing-cleanup-test-'));
  let nestedPath = tempRoot;
  while (nestedPath.length < 320) {
    nestedPath = join(
      nestedPath,
      'node_modules',
      '.pnpm',
      '@nestjs+common@11.2.3_reflect-metadata_long-segment',
    );
  }
  mkdirSync(nestedPath, { recursive: true });
  writeFileSync(join(nestedPath, 'create-route-param-metadata.decorator.d.ts'), 'fixture');

  try {
    const commonScript = resolve(ROOT, 'deploy-lan/scripts/release-common.ps1').replaceAll("'", "''");
    const escapedTempRoot = tempRoot.replaceAll("'", "''");
    const command = `. '${commonScript}'; Remove-DirectoryTree -Path '${escapedTempRoot}'`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, `长路径清理失败：${result.stdout}${result.stderr}`);
    assert.equal(existsSync(tempRoot), false, '长路径临时目录应被完整删除');
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('Release 脚本统一使用长路径安全清理函数', () => {
  for (const relativePath of ['create-release.ps1', 'deploy-release.ps1']) {
    const source = readFileSync(resolve(ROOT, relativePath), 'utf8');
    assert.match(source, /Remove-DirectoryTree -Path /, `${relativePath} 必须使用长路径安全清理函数`);
  }
});

test('数据库维护命令不会把 Node stderr 警告当成部署失败', { skip: process.platform !== 'win32' }, () => {
  const nodePath = process.execPath.replaceAll("'", "''");
  const command = [
    "$ErrorActionPreference='Stop'",
    `$lines=@(& '${nodePath}' -e "process.emitWarning('sqlite-warning','ExperimentalWarning');console.log(JSON.stringify({ok:true}))")`,
    '$exitCode=$LASTEXITCODE',
    "$jsonLine=$lines|Where-Object{$_.TrimStart().StartsWith('{')}|Select-Object -Last 1",
    'if($exitCode -ne 0 -or -not $jsonLine){exit 1}',
    '$result=$jsonLine|ConvertFrom-Json',
    'if(-not $result.ok){exit 1}',
  ].join(';');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `stderr 警告仍被误判：${result.stdout}${result.stderr}`);

  const deploySource = readFileSync(resolve(ROOT, 'deploy-release.ps1'), 'utf8');
  assert.doesNotMatch(
    deploySource,
    /\$lines\s*=\s*@\(& \$node \$script @Arguments 2>&1\)/,
    'Invoke-Maintenance 只能捕获 stdout，不能把 Node warning 所在的 stderr 合并进去',
  );
});
