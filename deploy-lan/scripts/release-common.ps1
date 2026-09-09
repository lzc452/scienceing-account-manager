Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-NativeChecked {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [string]$WorkingDirectory = (Get-Location).Path
    )

    Push-Location -LiteralPath $WorkingDirectory
    try {
        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "命令执行失败（退出码 $LASTEXITCODE）：$Command $($Arguments -join ' ')"
        }
    }
    finally {
        Pop-Location
    }
}

function Remove-DirectoryTree {
    param([Parameter(Mandatory = $true)][string]$Path)

    $fullPath = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
    $pathRoot = [System.IO.Path]::GetPathRoot($fullPath).TrimEnd('\')
    if ($fullPath -eq $pathRoot) {
        throw "拒绝删除文件系统根目录：$fullPath"
    }
    if (-not [System.IO.Directory]::Exists($fullPath)) { return }

    # Windows PowerShell 5.1 的 Remove-Item 仍受传统 MAX_PATH 限制。
    # Directory.Delete 配合扩展路径前缀可清理 pnpm 生成的深层 node_modules。
    if ($fullPath.StartsWith('\\?\')) {
        $extendedPath = $fullPath
    }
    elseif ($fullPath.StartsWith('\\')) {
        $extendedPath = '\\?\UNC\' + $fullPath.Substring(2)
    }
    else {
        $extendedPath = '\\?\' + $fullPath
    }

    $lastError = $null
    foreach ($attempt in 1..3) {
        try {
            [System.IO.Directory]::Delete($extendedPath, $true)
            return
        }
        catch [System.IO.DirectoryNotFoundException] {
            if (-not [System.IO.Directory]::Exists($extendedPath)) { return }
            $lastError = $_.Exception
        }
        catch {
            $lastError = $_.Exception
        }
        if ($attempt -lt 3) { Start-Sleep -Milliseconds (100 * $attempt) }
    }

    throw "无法清理目录：$fullPath。$($lastError.Message)"
}

function Resolve-DevelopmentShare {
    param(
        [string]$DevHost = '1399-IT-100158',
        [string]$ShareName = 'git-local-share'
    )

    $addresses = New-Object System.Collections.Generic.List[string]
    if (Get-Command Resolve-DnsName -ErrorAction SilentlyContinue) {
        try {
            Resolve-DnsName -Name $DevHost -Type A -ErrorAction Stop |
                Where-Object { $_.IPAddress } |
                ForEach-Object { $addresses.Add([string]$_.IPAddress) }
        }
        catch { }
    }
    try {
        [System.Net.Dns]::GetHostAddresses($DevHost) |
            Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork } |
            ForEach-Object { $addresses.Add($_.IPAddressToString) }
    }
    catch { }

    $unique = $addresses | Sort-Object -Unique
    if (-not $unique) {
        throw "无法将开发机主机名解析为 IPv4：$DevHost"
    }

    foreach ($address in $unique) {
        $root = "\\$address\$ShareName"
        if (Test-Path -LiteralPath (Join-Path $root 'scienceing.git\HEAD')) {
            return [pscustomobject]@{ IPv4 = $address; Root = $root }
        }
    }
    throw "已解析 $DevHost 的 IPv4（$($unique -join ', ')），但均无法通过 SMB 访问共享目录 $ShareName。"
}

function Get-ReleaseNode {
    # 探测脚本写入临时文件再执行：PowerShell 5.1 在命令行里传 "=>" 之类的字符容易被拆参，
    # 导致 node 启动即失败，被误判为"没有可用的 Node"。
    $probe = Join-Path ([System.IO.Path]::GetTempPath()) 'scienceing-node-sqlite-probe.mjs'
    try {
        [System.IO.File]::WriteAllText(
            $probe,
            "import('node:sqlite').then(() => process.exit(0), () => process.exit(1));",
            (New-Object System.Text.UTF8Encoding($false)))
    }
    catch {
        $probe = $null
    }

    $candidates = @(
        $env:DEPLOY_NODE,
        $env:NODE_BIN,
        'D:\Applications\nodejs\node.exe',
        (Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1)
    ) | Where-Object { $_ } | Select-Object -Unique

    foreach ($candidate in $candidates) {
        try {
            $version = & $candidate --version 2>$null
            if ($LASTEXITCODE -ne 0 -or $version -notmatch '^v(\d+)\.(\d+)') { continue }
            $major = [int]$Matches[1]
            $minor = [int]$Matches[2]
            if ($major -lt 22 -or ($major -eq 22 -and $minor -lt 5)) { continue }
            if ($probe) {
                & $candidate $probe 2>$null
            }
            else {
                & $candidate -e "import('node:sqlite').then(()=>process.exit(0),()=>process.exit(1))" 2>$null
            }
            if ($LASTEXITCODE -eq 0) { return [string]$candidate }
        }
        catch { }
    }
    throw '未找到 Node.js >= 22.5 且支持 node:sqlite 的 node.exe；推荐安装 Node 24。'
}

function Test-PnpmUsable {
    param([Parameter(Mandatory = $true)][string]$Command)

    try {
        $version = & $Command --version 2>$null
        if ($LASTEXITCODE -ne 0) { return $false }
        return ($version -match '^\d+(\.\d+)*')
    }
    catch {
        return $false
    }
}

# 解析最新 Release 版本：取开发机共享目录 releases\ 下 semver 最大的 scienceing-vX.Y.Z.zip。
# 生产机无需知道版本号，直接运行 deploy-prod.bat 即可升级到最新正式版。
function Resolve-LatestReleaseTag {
    param([Parameter(Mandatory = $true)][string]$ShareRoot)

    $releasesDir = Join-Path $ShareRoot 'releases'
    if (-not (Test-Path -LiteralPath $releasesDir)) {
        throw "共享目录缺少 releases：$releasesDir（请先在开发机执行 .\make-release.ps1）"
    }
    $versions = New-Object System.Collections.Generic.List[version]
    Get-ChildItem -LiteralPath $releasesDir -Filter 'scienceing-v*.zip' -File -ErrorAction SilentlyContinue |
        ForEach-Object {
            $m = [regex]::Match($_.Name, '^scienceing-v(\d+)\.(\d+)\.(\d+)\.zip$')
            if ($m.Success) {
                $versions.Add([version]::new([int]$m.Groups[1].Value, [int]$m.Groups[2].Value, [int]$m.Groups[3].Value))
            }
        }
    if ($versions.Count -eq 0) {
        throw "共享目录未找到任何 Release 包：$releasesDir（请先在开发机执行 .\make-release.ps1）"
    }
    $max = $versions | Sort-Object | Select-Object -Last 1
    return "v$($max.Major).$($max.Minor).$($max.Build)"
}

# 解析可用的 pnpm（发版打包必需）。
# 顺序：PATH → 上次隔离安装的缓存 → npm 全局安装 → 隔离目录安装，全部无需管理员权限。
# 返回 @{ Exe = <可执行文件>; Prefix = @(<固定前缀参数>) }，配合 Invoke-Pnpm 调用。
function Resolve-PnpmCommand {
    param([string]$ToolsDirectory = (Join-Path $env:LOCALAPPDATA 'scienceing-tools\pnpm'))

    $pnpmVersion = '9.15.9'   # 与 pnpm-lock.yaml 的 lockfileVersion 9.0 匹配

    # 环境变量可指定已就绪的 pnpm（离线环境推荐：$env:SCIENCEING_PNPM 指向 pnpm.cjs）
    foreach ($candidate in @($env:SCIENCEING_PNPM, (Join-Path $ToolsDirectory 'node_modules\pnpm\bin\pnpm.cjs'))) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            $runner = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1
            if ($runner) { return [pscustomobject]@{ Exe = [string]$runner; Prefix = @($candidate) } }
        }
    }

    foreach ($name in @('pnpm.cmd', 'pnpm')) {
        $found = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found -and (Test-PnpmUsable -Command $found.Source)) {
            return [pscustomobject]@{ Exe = [string]$found.Source; Prefix = @() }
        }
    }

    $cached = Join-Path $ToolsDirectory 'node_modules\pnpm\bin\pnpm.cjs'
    if (Test-Path -LiteralPath $cached) {
        return [pscustomobject]@{ Exe = (Get-Command node.exe | Select-Object -ExpandProperty Source -First 1); Prefix = @($cached) }
    }

    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($npm) {
        Write-Host "[pnpm] PATH 中不可用，尝试安装 pnpm@$pnpmVersion …"
        try {
            & $npm.Source install -g "pnpm@$pnpmVersion" --no-audit --no-fund 2>$null | Out-Null
            foreach ($name in @('pnpm.cmd', 'pnpm')) {
                $found = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
                if ($found -and (Test-PnpmUsable -Command $found.Source)) {
                    return [pscustomobject]@{ Exe = [string]$found.Source; Prefix = @() }
                }
            }
        }
        catch { }

        try {
            [void](New-Item -ItemType Directory -Path $ToolsDirectory -Force)
            & $npm.Source install --prefix $ToolsDirectory "pnpm@$pnpmVersion" --no-audit --no-fund 2>$null | Out-Null
            if (Test-Path -LiteralPath $cached) {
                return [pscustomobject]@{ Exe = (Get-Command node.exe | Select-Object -ExpandProperty Source -First 1); Prefix = @($cached) }
            }
        }
        catch { }
    }

    throw "未找到可用的 pnpm（自动安装也失败）。请手动执行：npm install -g pnpm@$pnpmVersion（无需管理员权限，需能访问 registry.npmjs.org），或在 PATH 中提供可用的 pnpm.cmd。"
}

function Invoke-Pnpm {
    param(
        [Parameter(Mandatory = $true)]$Pnpm,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [string]$WorkingDirectory = (Get-Location).Path
    )

    $all = @()
    if ($Pnpm.Prefix) { $all += @($Pnpm.Prefix) }
    $all += $Arguments
    Invoke-NativeChecked -Command $Pnpm.Exe -Arguments $all -WorkingDirectory $WorkingDirectory
}

function Initialize-ProductionLayout {
    param([Parameter(Mandatory = $true)][string]$InstallRoot)
    foreach ($name in @('packages', 'releases', 'data', 'backups', 'run', 'nginx-prefix', 'extension-lan', 'playwright\.auth')) {
        [void](New-Item -ItemType Directory -Path (Join-Path $InstallRoot $name) -Force)
    }
}
