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
            & $candidate -e "import('node:sqlite').then(()=>process.exit(0),()=>process.exit(1))" 2>$null
            if ($LASTEXITCODE -eq 0) { return [string]$candidate }
        }
        catch { }
    }
    throw '未找到 Node.js >= 22.5 且支持 node:sqlite 的 node.exe；推荐安装 Node 24。'
}

function Initialize-ProductionLayout {
    param([Parameter(Mandatory = $true)][string]$InstallRoot)
    foreach ($name in @('packages', 'releases', 'data', 'backups', 'run', 'nginx-prefix', 'extension-lan', 'playwright\.auth')) {
        [void](New-Item -ItemType Directory -Path (Join-Path $InstallRoot $name) -Force)
    }
}
