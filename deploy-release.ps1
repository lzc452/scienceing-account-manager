[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Tag,
    [string]$InstallRoot = 'D:\Applications\scienceing-account-manager-app',
    [string]$LegacyDatabasePath,
    [switch]$Initialize,
    [switch]$SkipSync,
    [string]$DevHost = '1399-IT-100158',
    [string]$ShareName = 'git-local-share'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deploy-lan\scripts\release-common.ps1')

if ($Tag -notmatch '^v\d+\.\d+\.\d+$') { throw "正式版本 Tag 必须符合 vX.Y.Z：$Tag" }
$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
Initialize-ProductionLayout -InstallRoot $InstallRoot
$node = Get-ReleaseNode
$databasePath = Join-Path $InstallRoot 'data\scienceing.prod.db'
$backupDirectory = Join-Path $InstallRoot 'backups'
$currentPath = Join-Path $InstallRoot 'current.json'
$lockPath = Join-Path $InstallRoot 'run\deploy.lock'
$lock = $null
$targetRelease = Join-Path $InstallRoot "releases\$Tag"
$staging = Join-Path $InstallRoot ("run\staging-$Tag-" + [guid]::NewGuid().ToString('N'))
$predeployBackup = $null
$previousRelease = $null
$legacyRoot = $null
$databaseMayHaveChanged = $false
$serviceWasStopped = $false

function Invoke-ReleaseCommand {
    param(
        [Parameter(Mandatory = $true)][string]$ReleaseRoot,
        [Parameter(Mandatory = $true)][string]$Command,
        [string[]]$Arguments = @()
    )
    $script = Join-Path $ReleaseRoot 'deploy-lan\scripts\deploy.mjs'
    if (-not (Test-Path -LiteralPath $script)) { throw "Release 部署入口不存在：$script" }
    & $node $script $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "部署命令失败（$LASTEXITCODE）：$Command $($Arguments -join ' ')" }
}

function Invoke-Maintenance {
    param(
        [Parameter(Mandatory = $true)][string]$ReleaseRoot,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )
    $script = Join-Path $ReleaseRoot 'apps\server\dist\db\maintenance.js'
    $lines = @(& $node $script @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
    $lines | ForEach-Object { Write-Host $_ }
    if ($exitCode -ne 0) { throw "数据库维护命令失败（$exitCode）：$($Arguments -join ' ')" }
    $jsonLine = $lines | ForEach-Object { [string]$_ } | Where-Object { $_.TrimStart().StartsWith('{') } | Select-Object -Last 1
    if (-not $jsonLine) { throw '数据库维护命令未返回 JSON 结果。' }
    return $jsonLine | ConvertFrom-Json
}

function Set-ProductionEnvironment {
    $env:SCIENCEING_RUNTIME_DIR = $InstallRoot
    $env:DATABASE_PATH = $databasePath
    $env:SCIENCEING_BACKUP_DIR = $backupDirectory
    $env:SCIENCING_STORAGE_STATE = Join-Path $InstallRoot 'playwright\.auth\admin.json'
    $env:NODE_ENV = 'production'
}

function Invoke-LegacyCommand {
    param([string]$Command)
    if (-not $legacyRoot) { return }
    $script = Join-Path $legacyRoot 'deploy-lan\scripts\deploy.mjs'
    if (-not (Test-Path -LiteralPath $script)) {
        throw "无法自动$Command旧版：缺少 $script"
    }
    $saved = @{}
    foreach ($name in @('SCIENCEING_RUNTIME_DIR', 'DATABASE_PATH', 'SCIENCEING_BACKUP_DIR', 'NODE_ENV')) {
        $saved[$name] = [System.Environment]::GetEnvironmentVariable($name, 'Process')
        [System.Environment]::SetEnvironmentVariable($name, $null, 'Process')
    }
    if ($LegacyDatabasePath) {
        [System.Environment]::SetEnvironmentVariable('DATABASE_PATH', $LegacyDatabasePath, 'Process')
    }
    try {
        & $node $script $Command --force
        if ($LASTEXITCODE -ne 0) { throw "旧版 $Command 失败（退出码 $LASTEXITCODE）" }
    }
    finally {
        foreach ($name in $saved.Keys) {
            [System.Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process')
        }
    }
}

try {
    $lock = New-Object System.IO.FileStream(
        $lockPath,
        [System.IO.FileMode]::OpenOrCreate,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
    )

    if (-not $SkipSync) {
        & (Join-Path $PSScriptRoot 'sync-from-dev.ps1') -DevHost $DevHost -ShareName $ShareName
        if ($LASTEXITCODE -ne 0) { throw 'sync-from-dev.ps1 执行失败。' }
    }
    $share = Resolve-DevelopmentShare -DevHost $DevHost -ShareName $ShareName
    $zipName = "scienceing-$Tag.zip"
    $remoteZip = Join-Path $share.Root "releases\$zipName"
    $remoteSha = "$remoteZip.sha256"
    if (-not (Test-Path -LiteralPath $remoteZip) -or -not (Test-Path -LiteralPath $remoteSha)) {
        throw "共享目录缺少 Release 或 SHA256：$remoteZip"
    }

    $packageZip = Join-Path $InstallRoot "packages\$zipName"
    $packageSha = "$packageZip.sha256"
    $copyTemp = "$packageZip.copying-$PID"
    Copy-Item -LiteralPath $remoteZip -Destination $copyTemp -Force
    Move-Item -LiteralPath $copyTemp -Destination $packageZip -Force
    Copy-Item -LiteralPath $remoteSha -Destination $packageSha -Force
    $expectedHash = ((Get-Content -LiteralPath $packageSha -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
    $actualHash = (Get-FileHash -LiteralPath $packageZip -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($expectedHash -notmatch '^[0-9a-f]{64}$' -or $actualHash -ne $expectedHash) {
        throw "Release SHA256 校验失败：expected=$expectedHash actual=$actualHash"
    }

    $tagCommit = (& git -C $PSScriptRoot rev-list -n 1 "$Tag^{commit}" 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $tagCommit -notmatch '^[0-9a-f]{40}$') { throw "本地未获取到 Tag：$Tag" }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if (-not (Test-Path -LiteralPath $targetRelease)) {
        [void](New-Item -ItemType Directory -Path $staging -Force)
        $stageFull = [System.IO.Path]::GetFullPath($staging) + [System.IO.Path]::DirectorySeparatorChar
        $archive = [System.IO.Compression.ZipFile]::OpenRead($packageZip)
        try {
            foreach ($entry in $archive.Entries) {
                $entryPath = [System.IO.Path]::GetFullPath((Join-Path $staging $entry.FullName))
                if (-not $entryPath.StartsWith($stageFull, [System.StringComparison]::OrdinalIgnoreCase)) {
                    throw "Release 包含路径穿越条目：$($entry.FullName)"
                }
            }
        }
        finally { $archive.Dispose() }
        [System.IO.Compression.ZipFile]::ExtractToDirectory($packageZip, $staging)
    }
    else {
        $staging = $targetRelease
    }

    $releaseJsonPath = Join-Path $staging 'release.json'
    if (-not (Test-Path -LiteralPath $releaseJsonPath)) { throw 'Release 缺少 release.json。' }
    $release = Get-Content -LiteralPath $releaseJsonPath -Raw | ConvertFrom-Json
    if ($release.version -ne $Tag -or $release.commit -ne $tagCommit -or $release.schemaVersion -notmatch '^\d+$') {
        throw "release.json 与 Tag 不一致：version=$($release.version) commit=$($release.commit)"
    }
    $compiledSchema = (& $node (Join-Path $staging 'apps\server\dist\db\schema-version.js') 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [int]$compiledSchema -ne [int]$release.schemaVersion) {
        throw "release.json schemaVersion 与编译产物不一致：json=$($release.schemaVersion) code=$compiledSchema"
    }

    if ($staging -ne $targetRelease) {
        Move-Item -LiteralPath $staging -Destination $targetRelease
        $staging = $targetRelease
    }

    if (Test-Path -LiteralPath $currentPath) {
        $current = Get-Content -LiteralPath $currentPath -Raw | ConvertFrom-Json
        if ($current.version -eq $Tag) { throw "$Tag 已是当前生产版本。" }
        $candidate = Join-Path $InstallRoot "releases\$($current.version)"
        if (Test-Path -LiteralPath $candidate) { $previousRelease = $candidate }
    }

    if ($LegacyDatabasePath) {
        $LegacyDatabasePath = [System.IO.Path]::GetFullPath($LegacyDatabasePath)
        if (-not (Test-Path -LiteralPath $LegacyDatabasePath)) { throw "旧生产数据库不存在：$LegacyDatabasePath" }
        $legacyDataDirectory = Split-Path -Parent $LegacyDatabasePath
        $legacyRoot = if ((Split-Path -Leaf $legacyDataDirectory) -eq 'data') {
            Split-Path -Parent $legacyDataDirectory
        } else {
            $legacyDataDirectory
        }
        $legacyEnv = Join-Path $legacyRoot '.env'
        if (-not (Test-Path -LiteralPath (Join-Path $InstallRoot '.env')) -and (Test-Path -LiteralPath $legacyEnv)) {
            Copy-Item -LiteralPath $legacyEnv -Destination (Join-Path $InstallRoot '.env')
        }
        $legacyConfig = Join-Path $legacyRoot 'deploy-lan\config.env'
        if (-not (Test-Path -LiteralPath (Join-Path $InstallRoot 'config.env')) -and (Test-Path -LiteralPath $legacyConfig)) {
            Copy-Item -LiteralPath $legacyConfig -Destination (Join-Path $InstallRoot 'config.env')
        }
        $legacyAuth = Join-Path $legacyRoot 'playwright\.auth\admin.json'
        $newAuth = Join-Path $InstallRoot 'playwright\.auth\admin.json'
        if (-not (Test-Path -LiteralPath $newAuth) -and (Test-Path -LiteralPath $legacyAuth)) {
            Copy-Item -LiteralPath $legacyAuth -Destination $newAuth
        }
    }

    if (-not (Test-Path -LiteralPath (Join-Path $InstallRoot '.env'))) {
        throw "生产配置不存在：$(Join-Path $InstallRoot '.env')。首次导入必须沿用旧生产 .env 中的 SCIENCEING_MASTER_KEY。"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $InstallRoot 'config.env'))) {
        Copy-Item -LiteralPath (Join-Path $targetRelease 'deploy-lan\config.env') -Destination (Join-Path $InstallRoot 'config.env')
    }

    Set-ProductionEnvironment
    if ($previousRelease) {
        $serviceWasStopped = $true
        Invoke-ReleaseCommand -ReleaseRoot $previousRelease -Command 'stop' -Arguments @('--force')
    }
    elseif ($legacyRoot) {
        $serviceWasStopped = $true
        Invoke-LegacyCommand -Command 'stop'
    }

    if (-not (Test-Path -LiteralPath $databasePath)) {
        if ($LegacyDatabasePath) {
            [void](Invoke-Maintenance -ReleaseRoot $targetRelease -Arguments @('import', '--source', $LegacyDatabasePath, '--target', $databasePath))
            $databaseMayHaveChanged = $true
        }
        elseif (-not $Initialize) {
            throw '生产数据库不存在。请提供 -LegacyDatabasePath 导入旧库，或显式使用 -Initialize 创建全新空环境。'
        }
    }

    if (Test-Path -LiteralPath $databasePath) {
        $backup = Invoke-Maintenance -ReleaseRoot $targetRelease -Arguments @(
            'backup', '--database', $databasePath, '--directory', $backupDirectory, '--reason', "predeploy-$Tag"
        )
        $predeployBackup = [string]$backup.path
    }

    $databaseMayHaveChanged = $true
    Invoke-ReleaseCommand -ReleaseRoot $targetRelease -Command 'db:migrate'
    if ($Initialize -and -not $LegacyDatabasePath) {
        Invoke-ReleaseCommand -ReleaseRoot $targetRelease -Command 'db:seed'
    }
    Invoke-ReleaseCommand -ReleaseRoot $targetRelease -Command 'db:verify'
    Invoke-ReleaseCommand -ReleaseRoot $targetRelease -Command 'extension:pack'
    Invoke-ReleaseCommand -ReleaseRoot $targetRelease -Command 'start'

    $pointer = [ordered]@{
        version = $Tag
        commit = $release.commit
        schemaVersion = [int]$release.schemaVersion
        activatedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    $pointerTemp = "$currentPath.tmp-$PID"
    [System.IO.File]::WriteAllText($pointerTemp, ($pointer | ConvertTo-Json) + "`n", $utf8)
    Move-Item -LiteralPath $pointerTemp -Destination $currentPath -Force
    Write-Host "部署成功：$Tag -> $targetRelease"
    Write-Host "生产数据库：$databasePath"
    Write-Host "发布前备份：$predeployBackup"
}
catch {
    $failure = $_
    [Console]::Error.WriteLine("部署失败：$($failure.Exception.Message)")
    $restartHandled = $false
    if ($databaseMayHaveChanged -and $predeployBackup -and (Test-Path -LiteralPath $targetRelease)) {
        try {
            Set-ProductionEnvironment
            try { Invoke-ReleaseCommand -ReleaseRoot $targetRelease -Command 'stop' -Arguments @('--force') } catch { Write-Warning $_.Exception.Message }
            [void](Invoke-Maintenance -ReleaseRoot $targetRelease -Arguments @('restore', '--source', $predeployBackup, '--target', $databasePath))
            if ($previousRelease) {
                Invoke-ReleaseCommand -ReleaseRoot $previousRelease -Command 'start'
                $restartHandled = $true
                Write-Warning '已恢复发布前数据库并重启上一版本。'
            }
            elseif ($legacyRoot) {
                Invoke-LegacyCommand -Command 'start'
                $restartHandled = $true
                Write-Warning '已恢复发布前数据库，并尝试重启旧部署。旧原始 scienceing.db/WAL/SHM 始终未被覆盖。'
            }
        }
        catch {
            [Console]::Error.WriteLine("自动回滚未完全成功，需要人工处理：$($_.Exception.Message)")
        }
    }
    if ($serviceWasStopped -and -not $restartHandled -and (-not $databaseMayHaveChanged -or -not $predeployBackup)) {
        try {
            if ($previousRelease) { Invoke-ReleaseCommand -ReleaseRoot $previousRelease -Command 'start' }
            elseif ($legacyRoot) { Invoke-LegacyCommand -Command 'start' }
            Write-Warning '部署在修改数据库前失败，已重启原版本。'
        }
        catch {
            [Console]::Error.WriteLine("原版本自动重启失败，需要人工处理：$($_.Exception.Message)")
        }
    }
    throw $failure
}
finally {
    if ($lock) { $lock.Dispose() }
    if ($staging -and $staging -ne $targetRelease -and (Test-Path -LiteralPath $staging)) {
        $resolvedStage = [System.IO.Path]::GetFullPath($staging)
        $resolvedRun = [System.IO.Path]::GetFullPath((Join-Path $InstallRoot 'run')) + [System.IO.Path]::DirectorySeparatorChar
        if ($resolvedStage.StartsWith($resolvedRun, [System.StringComparison]::OrdinalIgnoreCase)) {
            Remove-Item -LiteralPath $resolvedStage -Recurse -Force
        }
    }
}
