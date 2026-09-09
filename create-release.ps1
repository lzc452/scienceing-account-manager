[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Tag,
    [string]$LanGitPath = 'E:\git-local-share\scienceing.git',
    [string]$OutputDirectory = 'E:\git-local-share\releases',
    [switch]$SkipTests
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deploy-lan\scripts\release-common.ps1')

if ($Tag -notmatch '^v\d+\.\d+\.\d+$') {
    throw "正式版本 Tag 必须符合 vX.Y.Z：$Tag"
}
if (-not (Test-Path -LiteralPath (Join-Path $LanGitPath 'HEAD'))) {
    throw "LAN bare Git 不存在：$LanGitPath"
}

function Read-GitValue {
    param([string[]]$Arguments, [string]$WorkingDirectory = $PSScriptRoot)
    Push-Location -LiteralPath $WorkingDirectory
    try {
        $value = (& git @Arguments 2>&1 | Out-String).Trim()
        if ($LASTEXITCODE -ne 0) { throw "Git 命令失败：git $($Arguments -join ' ')`n$value" }
        return $value
    }
    finally { Pop-Location }
}

function Copy-DirectoryContents {
    param([string]$Source, [string]$Destination)
    if (-not (Test-Path -LiteralPath $Source)) { throw "打包源目录不存在：$Source" }
    [void](New-Item -ItemType Directory -Path $Destination -Force)
    Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
    }
}

$commit = Read-GitValue -Arguments @('rev-list', '-n', '1', "$Tag^{commit}")
if ($commit -notmatch '^[0-9a-f]{40}$') { throw "Tag 无法解析为 commit：$Tag" }
$lanCommit = Read-GitValue -Arguments @("--git-dir=$LanGitPath", 'rev-list', '-n', '1', "$Tag^{commit}")
if ($lanCommit -ne $commit) {
    throw "LAN Git 中的 $Tag 与本地不一致或尚未推送。先执行：git push lan $Tag"
}

[void](New-Item -ItemType Directory -Path $OutputDirectory -Force)
$zipName = "scienceing-$Tag.zip"
$zipPath = Join-Path $OutputDirectory $zipName
$shaPath = "$zipPath.sha256"
if ((Test-Path -LiteralPath $zipPath) -or (Test-Path -LiteralPath $shaPath)) {
    throw "正式 Release 不允许覆盖：$zipPath"
}

$tempBase = [System.IO.Path]::GetTempPath()
$tempRoot = Join-Path $tempBase ("scienceing-release-" + [guid]::NewGuid().ToString('N'))
$sourceZip = Join-Path $tempRoot 'source.zip'
$sourceRoot = Join-Path $tempRoot 'source'
$bundleRoot = Join-Path $tempRoot 'bundle'
$serverDeploy = Join-Path $tempRoot 'server-deploy'
$workerDeploy = Join-Path $tempRoot 'worker-deploy'
$tempReleaseZip = Join-Path $tempRoot $zipName

try {
    [void](New-Item -ItemType Directory -Path $sourceRoot -Force)
    [void](New-Item -ItemType Directory -Path $bundleRoot -Force)

    Invoke-NativeChecked -Command 'git' -Arguments @('-C', $PSScriptRoot, 'archive', '--format=zip', "--output=$sourceZip", $Tag)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($sourceZip, $sourceRoot)

    $node = Get-ReleaseNode
    # pnpm 可能只以 corepack shim 形式存在而实际不可用：统一走 Resolve-PnpmCommand
    # （PATH → 隔离缓存 → npm 全局安装 → 隔离目录安装），全部无需管理员权限。
    $pnpm = Resolve-PnpmCommand
    Write-Host "[release] pnpm：$($pnpm.Exe) $($pnpm.Prefix -join ' ')"

    $oldCi = $env:CI
    $oldNodeEnv = $env:NODE_ENV
    $oldMock = $env:VITE_USE_MOCK
    try {
        $env:CI = 'true'
        $env:NODE_ENV = 'development'
        $env:VITE_USE_MOCK = 'false'
        Invoke-Pnpm -Pnpm $pnpm -Arguments @('install', '--frozen-lockfile') -WorkingDirectory $sourceRoot

        $tsc = Join-Path $sourceRoot 'node_modules\typescript\bin\tsc'
        Invoke-NativeChecked -Command $node -Arguments @($tsc, '-p', (Join-Path $sourceRoot 'packages\shared\tsconfig.json')) -WorkingDirectory $sourceRoot
        Invoke-NativeChecked -Command $node -Arguments @($tsc, '-p', (Join-Path $sourceRoot 'apps\server\tsconfig.json')) -WorkingDirectory $sourceRoot
        Invoke-NativeChecked -Command $node -Arguments @($tsc, '-p', (Join-Path $sourceRoot 'playwright\worker\tsconfig.json')) -WorkingDirectory $sourceRoot

        $vite = Join-Path $sourceRoot 'apps\web\node_modules\vite\bin\vite.js'
        Invoke-NativeChecked -Command $node -Arguments @($vite, 'build', '--configLoader', 'native') -WorkingDirectory (Join-Path $sourceRoot 'apps\web')
        Invoke-NativeChecked -Command $node -Arguments @((Join-Path $sourceRoot 'apps\extension\scripts\validate.mjs')) -WorkingDirectory (Join-Path $sourceRoot 'apps\extension')

        if ($SkipTests) {
            Write-Host '[release] -SkipTests：跳过扩展/后端/Worker 测试'
        }
        else {
        $extensionTests = Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'apps\extension\test') -Filter '*.test.mjs' |
            Select-Object -ExpandProperty FullName
        Invoke-NativeChecked -Command $node -Arguments (@('--test') + $extensionTests) -WorkingDirectory $sourceRoot

        $serverTests = @(
            'apps\server\dist\crypto\crypto.test.js',
            'apps\server\dist\db\config.test.js',
            'apps\server\dist\db\migrate.test.js',
            'apps\server\dist\db\backup.test.js',
            'apps\server\dist\db\seed.test.js'
        ) | ForEach-Object { Join-Path $sourceRoot $_ }
        Invoke-NativeChecked -Command $node -Arguments (@('--test', '--test-isolation=none') + $serverTests) -WorkingDirectory $sourceRoot

        $workerTests = Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'playwright\worker\dist') -Filter '*.test.js' -Recurse |
            Select-Object -ExpandProperty FullName
        if ($workerTests) {
            Invoke-NativeChecked -Command $node -Arguments (@('--test', '--test-isolation=none') + $workerTests) -WorkingDirectory $sourceRoot
        }
        }

        Invoke-Pnpm -Pnpm $pnpm -Arguments @(
            '--config.node-linker=hoisted', '--filter', '@scienceing/server', 'deploy', '--prod', $serverDeploy
        ) -WorkingDirectory $sourceRoot
        Invoke-Pnpm -Pnpm $pnpm -Arguments @(
            '--config.node-linker=hoisted', '--filter', '@scienceing/playwright-worker', 'deploy', '--prod', $workerDeploy
        ) -WorkingDirectory $sourceRoot
    }
    finally {
        $env:CI = $oldCi
        $env:NODE_ENV = $oldNodeEnv
        $env:VITE_USE_MOCK = $oldMock
    }

    $bundleServer = Join-Path $bundleRoot 'apps\server'
    $bundleWorker = Join-Path $bundleRoot 'playwright\worker'
    [void](New-Item -ItemType Directory -Path $bundleServer -Force)
    [void](New-Item -ItemType Directory -Path $bundleWorker -Force)
    foreach ($name in @('package.json', 'dist', 'node_modules')) {
        Copy-Item -LiteralPath (Join-Path $serverDeploy $name) -Destination $bundleServer -Recurse -Force
        Copy-Item -LiteralPath (Join-Path $workerDeploy $name) -Destination $bundleWorker -Recurse -Force
    }
    Copy-DirectoryContents -Source (Join-Path $sourceRoot 'apps\web\dist') -Destination (Join-Path $bundleRoot 'apps\web\dist')
    foreach ($relative in @('manifest.json', 'package.json', 'src', 'scripts')) {
        $destination = Join-Path $bundleRoot 'apps\extension'
        [void](New-Item -ItemType Directory -Path $destination -Force)
        Copy-Item -LiteralPath (Join-Path $sourceRoot "apps\extension\$relative") -Destination $destination -Recurse -Force
    }
    Copy-DirectoryContents -Source (Join-Path $sourceRoot 'deploy-lan\scripts') -Destination (Join-Path $bundleRoot 'deploy-lan\scripts')
    Copy-Item -LiteralPath (Join-Path $sourceRoot 'deploy-lan\config.env') -Destination (Join-Path $bundleRoot 'deploy-lan\config.env') -Force

    # 生产机一键运维入口随包分发：即便生产机没有 git 工作区，也能在 Release 目录直接部署
    foreach ($name in @('deploy-release.ps1', 'sync-from-dev.ps1', 'deploy-prod.bat')) {
        $source = Join-Path $sourceRoot $name
        if (Test-Path -LiteralPath $source) {
            Copy-Item -LiteralPath $source -Destination (Join-Path $bundleRoot $name) -Force
        }
    }

    $schemaVersionText = (& $node (Join-Path $bundleServer 'dist\db\schema-version.js') 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $schemaVersionText -notmatch '^\d+$') {
        throw "无法读取 schemaVersion：$schemaVersionText"
    }
    $release = [ordered]@{
        version = $Tag
        commit = $commit
        schemaVersion = [int]$schemaVersionText
    }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Join-Path $bundleRoot 'release.json'), ($release | ConvertTo-Json) + "`n", $utf8)

    $reparsePoints = Get-ChildItem -LiteralPath $bundleRoot -Recurse -Force |
        Where-Object { ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 }
    if ($reparsePoints) {
        throw "Release 含符号链接/重解析点，生产机无法独立运行：$($reparsePoints[0].FullName)"
    }
    $forbidden = Get-ChildItem -LiteralPath $bundleRoot -File -Recurse -Force | Where-Object {
        $relative = $_.FullName.Substring($bundleRoot.Length).TrimStart('\')
        $_.Name -match '^\.env($|\.)' -or
        $_.Name -match '\.(db|db-wal|db-shm|db-journal|log|bak|backup|secret|pem|pfx|key)$' -or
        $relative -match '(^|\\)(logs?|backups?|secrets?)(\\|$)'
    }
    if ($forbidden) { throw "Release 含禁止文件：$($forbidden[0].FullName)" }

    [System.IO.Compression.ZipFile]::CreateFromDirectory(
        $bundleRoot,
        $tempReleaseZip,
        [System.IO.Compression.CompressionLevel]::Optimal,
        $false
    )
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $tempReleaseZip).Hash.ToLowerInvariant()
    Move-Item -LiteralPath $tempReleaseZip -Destination $zipPath
    [System.IO.File]::WriteAllText($shaPath, "$hash  $zipName`n", $utf8)

    Write-Host "Release 已生成：$zipPath"
    Write-Host "SHA256：$hash"
    Write-Host "version=$Tag commit=$commit schemaVersion=$schemaVersionText"
}
finally {
    $resolvedTemp = [System.IO.Path]::GetFullPath($tempRoot)
    $resolvedBase = [System.IO.Path]::GetFullPath($tempBase)
    if ($resolvedTemp.StartsWith($resolvedBase, [System.StringComparison]::OrdinalIgnoreCase) -and
        (Test-Path -LiteralPath $resolvedTemp)) {
        try {
            Remove-DirectoryTree -Path $resolvedTemp
        }
        catch {
            Write-Warning "临时 Release 目录清理失败，可稍后手动删除：$resolvedTemp。$($_.Exception.Message)"
        }
    }
}
