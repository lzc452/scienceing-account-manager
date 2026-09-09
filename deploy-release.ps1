[CmdletBinding()]
param(
    [string]$Tag = 'latest',
    [string]$InstallRoot = 'D:\scienceing-prod',
    [string]$LegacyDatabasePath,
    [switch]$Initialize,
    [switch]$SkipSync,
    [string]$DevHost = '1399-IT-100158',
    [string]$ShareName = 'git-local-share'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deploy-lan\scripts\release-common.ps1')

# 注意：Tag 格式校验放在下面 try 块内（latest 解析之后），这里不能提前校验，
# 否则 deploy-prod.bat 默认传的 -Tag latest 会被当成非法版本直接拒绝。
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

# 首次部署时自动寻找旧生产库：把旧库放到 InstallRoot\legacy\ 或 InstallRoot\data\
# 或 InstallRoot\ 根目录即可，无需再显式传 -LegacyDatabasePath。
function Resolve-LegacyDatabase {
    param([Parameter(Mandatory = $true)][string]$InstallRoot)

    $candidates = @(
        (Join-Path $InstallRoot 'legacy\scienceing.db'),
        (Join-Path $InstallRoot 'legacy\scienceing.prod.db'),
        (Join-Path $InstallRoot 'data\scienceing.db'),
        (Join-Path $InstallRoot 'scienceing.db')
    )
    foreach ($candidate in $candidates) {
        if ((Test-Path -LiteralPath $candidate) -and ((Get-Item -LiteralPath $candidate).Length -gt 0)) {
            return $candidate
        }
    }
    return $null
}

# 首次部署（没有上一版本可停）时，旧实例可能仍占着 3000/18080：
# 属于本项目的进程自动停掉，无关进程直接报错，避免"部署显示成功但跑的还是旧代码"。
function Stop-StaleServicePorts {
    param([Parameter(Mandatory = $true)][string]$Root)

    $backendPort = 3000
    $gatewayPort = 18080
    $envFile = Join-Path $Root '.env'
    if (Test-Path -LiteralPath $envFile) {
        $m = [regex]::Match((Get-Content -LiteralPath $envFile -Raw), '(?m)^\s*PORT\s*=\s*(\d+)')
        if ($m.Success) { $backendPort = [int]$m.Groups[1].Value }
    }
    $cfgFile = Join-Path $Root 'config.env'
    if (Test-Path -LiteralPath $cfgFile) {
        $m = [regex]::Match((Get-Content -LiteralPath $cfgFile -Raw), '(?m)^\s*GATEWAY_PORT\s*=\s*(\d+)')
        if ($m.Success) { $gatewayPort = [int]$m.Groups[1].Value }
    }

    foreach ($port in @($backendPort, $gatewayPort)) {
        $connections = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
        if ($connections.Count -eq 0) { continue }
        foreach ($ownerPid in ($connections | Select-Object -ExpandProperty OwningProcess -Unique)) {
            $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerPid" -ErrorAction SilentlyContinue
            $commandLine = if ($proc) { [string]$proc.CommandLine } else { '' }
            if (-not $commandLine) { continue }
            if ($commandLine -match 'scienceing|apps[\\/]server|dist[\\/]main\.js|gateway\.mjs|nginx-prefix') {
                Write-Host "[deploy] 端口 $port 被旧实例占用（pid $ownerPid），自动停止…"
                Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 2
            }
            else {
                throw "端口 $port 被无关进程占用（pid $ownerPid）：$commandLine。请释放端口后重试。"
            }
        }
    }
}

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
    # 只捕获 stdout 中的 JSON。Windows PowerShell 5.1 会把合并进来的
    # Node ExperimentalWarning(stderr) 转成 NativeCommandError，即使进程退出码为 0。
    $lines = @(& $node $script @Arguments)
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

# git 是否可用 = 装了 git 且 $PSScriptRoot 是 git 工作区。
# 在 Release 解压目录（非仓库）运行时自动进入纯 SMB 部署模式，不再要求 -SkipSync。
$gitAvailable = $false
if (Get-Command git -ErrorAction SilentlyContinue) {
    $insideWorkTree = (& git -C $PSScriptRoot rev-parse --is-inside-work-tree 2>$null | Out-String).Trim()
    $gitAvailable = ($insideWorkTree -eq 'true')
}
$transcriptStarted = $false
try {
    $lock = New-Object System.IO.FileStream(
        $lockPath,
        [System.IO.FileMode]::OpenOrCreate,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
    )

    $share = Resolve-DevelopmentShare -DevHost $DevHost -ShareName $ShareName

    if ($Tag -eq 'latest' -or -not $Tag) {
        $Tag = Resolve-LatestReleaseTag -ShareRoot $share.Root
        Write-Host "[deploy] 自动选择最新 Release：$Tag"
    }
    if ($Tag -notmatch '^v\d+\.\d+\.\d+$') { throw "Tag 必须符合 vX.Y.Z：$Tag" }

    try {
        $logDirectory = Join-Path $InstallRoot 'run'
        [void](New-Item -ItemType Directory -Path $logDirectory -Force)
        Start-Transcript -LiteralPath (Join-Path $logDirectory ("deploy-$Tag-" + (Get-Date).ToString('yyyyMMdd-HHmmss') + '.log')) -Force | Out-Null
        $transcriptStarted = $true
    }
    catch {
        Write-Warning "部署日志写入失败（不影响部署）：$($_.Exception.Message)"
    }

    if (-not $SkipSync) {
        if ($gitAvailable) {
            & (Join-Path $PSScriptRoot 'sync-from-dev.ps1') -DevHost $DevHost -ShareName $ShareName
            if ($LASTEXITCODE -ne 0) { throw 'sync-from-dev.ps1 执行失败。' }
        }
        else {
            Write-Warning '当前目录不是 git 工作区（或未装 git）：跳过仓库同步，直接使用共享目录中的 Release（生产机纯部署模式）。'
            $SkipSync = $true
        }
    }
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

    # 生产机可以不装 git（纯部署模式）：此时只校验 release.json 自身一致性
    $tagCommit = $null
    if ($gitAvailable) {
        $tagCommit = (& git -C $PSScriptRoot rev-list -n 1 "$Tag^{commit}" 2>&1 | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $tagCommit -notmatch '^[0-9a-f]{40}$') {
            throw "本地未获取到 Tag：$Tag（生产机未同步最新代码？先执行 .\sync-from-dev.ps1）"
        }
    }

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
    $commitMismatch = $gitAvailable -and ($release.commit -ne $tagCommit)
    if ($release.version -ne $Tag -or $commitMismatch -or $release.schemaVersion -notmatch '^\d+$') {
        throw "release.json 与 Tag 不一致：version=$($release.version) commit=$($release.commit)"
    }
    if (-not $gitAvailable) {
        Write-Host '[deploy] 未检测到 git：已跳过 commit 一致性校验（纯 SMB 部署模式）'
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
    else {
        # 首次部署（无上一版本指针）：旧实例可能还占着 3000/18080，自动清理
        Stop-StaleServicePorts -Root $InstallRoot
    }

    if (-not (Test-Path -LiteralPath $databasePath)) {
        if (-not $LegacyDatabasePath) {
            $LegacyDatabasePath = Resolve-LegacyDatabase -InstallRoot $InstallRoot
            if ($LegacyDatabasePath) {
                Write-Host "[deploy] 自动发现旧生产库：$LegacyDatabasePath"
            }
        }
        if ($LegacyDatabasePath) {
            [void](Invoke-Maintenance -ReleaseRoot $targetRelease -Arguments @('import', '--source', $LegacyDatabasePath, '--target', $databasePath))
            $databaseMayHaveChanged = $true
        }
        elseif (-not $Initialize) {
            throw '生产数据库不存在，也未发现旧库。请把旧 scienceing.db（连同 -wal/-shm）放到 InstallRoot\legacy\，或用 -LegacyDatabasePath 指定，或显式 -Initialize 创建全新空环境。'
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
    # 结构兜底：即便历史环境漏过迁移，db:doctor 也会按 Release 内迁移定义补齐表/列（幂等）
    Invoke-ReleaseCommand -ReleaseRoot $targetRelease -Command 'db:doctor' -Arguments @('--fix', '--quiet')
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
    Write-Host ''
    Invoke-ReleaseCommand -ReleaseRoot $targetRelease -Command 'status'
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
            try {
                Remove-DirectoryTree -Path $resolvedStage
            }
            catch {
                Write-Warning "部署暂存目录清理失败，可稍后手动删除：$resolvedStage。$($_.Exception.Message)"
            }
        }
    }
    if ($transcriptStarted) {
        try { Stop-Transcript | Out-Null } catch { }
    }
}
