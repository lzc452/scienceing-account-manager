[CmdletBinding()]
param(
    [string]$Tag,
    [ValidateSet('patch', 'minor', 'major')][string]$Bump = 'patch',
    [string]$Message,
    [string]$RemoteName = 'lan',
    [string]$Branch,
    [switch]$PushBranch,
    [switch]$AllowDirty,
    [switch]$SkipTests,
    [switch]$DryRun,
    [string]$LanGitPath = 'E:\git-local-share\scienceing.git',
    [string]$OutputDirectory = 'E:\git-local-share\releases'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deploy-lan\scripts\release-common.ps1')

$repoRoot = $PSScriptRoot
# 只用于提示：真正构建在 create-release.ps1 内完成，那里会再次校验 Node
$node = '(本机未检测到 Node.js >= 22.5，构建阶段会再次校验)'
try { $node = Get-ReleaseNode } catch { }

function Invoke-GitChecked {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    Invoke-NativeChecked -Command 'git' -Arguments $Arguments -WorkingDirectory $repoRoot
}

function Get-GitText {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    Push-Location -LiteralPath $repoRoot
    try {
        $text = (& git @Arguments 2>&1 | Out-String).Trim()
        if ($LASTEXITCODE -ne 0) { throw "git $($Arguments -join ' ') 失败：$text" }
        return $text
    }
    finally { Pop-Location }
}

function ConvertTo-Semver {
    param([Parameter(Mandatory = $true)][string]$Text)
    $m = [regex]::Match($Text.Trim(), '^v?(\d+)\.(\d+)\.(\d+)$')
    if (-not $m.Success) { return $null }
    return [pscustomobject]@{
        Major = [int]$m.Groups[1].Value
        Minor = [int]$m.Groups[2].Value
        Patch = [int]$m.Groups[3].Value
        Text  = $Text.Trim()
    }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw '未找到 git，无法发版。'
}

$currentBranch = if ($Branch) { $Branch } else { Get-GitText -Arguments @('rev-parse', '--abbrev-ref', 'HEAD') }
$dirty = Get-GitText -Arguments @('status', '--porcelain')
if ($dirty) {
    if (-not $AllowDirty) {
        throw "工作区有未提交改动，请先提交（或加 -AllowDirty 强制发版）：`n$dirty"
    }
    Write-Warning "工作区有未提交改动，仍继续发版：$([Environment]::NewLine)$dirty"
}

# 1) 解析版本号
$remoteTags = @()
$remotes = @((Get-GitText -Arguments @('remote')) -split "`n" | Where-Object { $_ } | ForEach-Object { $_.Trim() })
if ($remotes -contains $RemoteName) {
    try {
        $remoteTags = @((Get-GitText -Arguments @('ls-remote', '--tags', $RemoteName)) -split "`n" |
            ForEach-Object { ($_.Trim() -split '\s+')[1] } |
            Where-Object { $_ -and $_ -notmatch '\^\{\}' } |
            ForEach-Object { $_.Replace('refs/tags/', '') })
    }
    catch {
        Write-Warning "读取远端 Tag 失败（按本地 Tag 继续）：$($_.Exception.Message)"
        $remoteTags = @()
    }
}

if ($Tag) {
    if ($Tag -notmatch '^v\d+\.\d+\.\d+$') { throw "版本号必须符合 vX.Y.Z：$Tag" }
    $semver = ConvertTo-Semver -Text $Tag
    $localTags = @((Get-GitText -Arguments @('tag', '--list')) -split "`n" | Where-Object { $_ } | ForEach-Object { $_.Trim() })
    if ($localTags -contains $Tag -or $remoteTags -contains $Tag) {
        throw "Tag 已存在（本地或 $RemoteName）：$Tag。请换版本号，或先删除后重发。"
    }
}
else {
    $candidates = @($remoteTags) + @((Get-GitText -Arguments @('tag', '--list')) -split "`n") |
        Where-Object { $_ } | ForEach-Object { $_.Trim() } | Select-Object -Unique |
        ForEach-Object { ConvertTo-Semver -Text $_ } |
        Where-Object { $_ -and $_.Major -lt 90 }          # 忽略 v90+ 这类测试用版本号
    if (-not $candidates -or $candidates.Count -eq 0) {
        $next = [version]'1.0.0'
    }
    else {
        $latest = $candidates | Sort-Object -Property @{ Expression = { $_.Major } }, @{ Expression = { $_.Minor } }, @{ Expression = { $_.Patch } } | Select-Object -Last 1
        switch ($Bump) {
            'major' { $next = [version]::new($latest.Major + 1, 0, 0) }
            'minor' { $next = [version]::new($latest.Major, $latest.Minor + 1, 0) }
            default { $next = [version]::new($latest.Major, $latest.Minor, $latest.Patch + 1) }
        }
        Write-Host "[release] 当前最新 Tag：$($latest.Text) → 新版本 v$next（-$Bump）"
    }
    $semver = ConvertTo-Semver -Text "v$next"
    $Tag = "v$($semver.Major).$($semver.Minor).$($semver.Patch)"
}

if (-not $Message) { $Message = "release $Tag" }

Write-Host ''
Write-Host '═'.PadRight(60, '═')
Write-Host "  发版：$Tag"
Write-Host '═'.PadRight(60, '═')
Write-Host "  分支          : $currentBranch"
Write-Host "  远端          : $RemoteName"
Write-Host "  推送分支提交  : $(if ($PushBranch) { '是' } else { '否（仅推送 Tag）' })"
Write-Host "  运行测试      : $(if ($SkipTests) { '否（-SkipTests）' } else { '是' })"
Write-Host "  node          : $node"
Write-Host "  Release 输出  : $OutputDirectory"
Write-Host '═'.PadRight(60, '═')

if ($DryRun) {
    Write-Host '[DryRun] 将执行：'
    Write-Host "  git tag -a $Tag -m `"$Message`""
    Write-Host "  git push $RemoteName $Tag"
    if ($PushBranch) { Write-Host "  git push $RemoteName $currentBranch" }
    $skipText = if ($SkipTests) { ' -SkipTests' } else { '' }
    Write-Host "  .\create-release.ps1 -Tag $Tag -LanGitPath $LanGitPath -OutputDirectory $OutputDirectory$skipText"
    Write-Host '[DryRun] 未做任何改动。'
    exit 0
}

# 2) 打 Tag 并推送到 LAN bare 仓库
if (-not ($remotes -contains $RemoteName)) {
    throw "未配置 remote '$RemoteName'。生产/发版同步请先执行：.\sync-from-dev.ps1"
}
Invoke-GitChecked -Arguments @('tag', '-a', $Tag, '-m', $Message)
Write-Host "[release] 已创建 Tag：$Tag"
try {
    Invoke-GitChecked -Arguments @('push', $RemoteName, $Tag)
}
catch {
    throw "推送 Tag 到 $RemoteName 失败：$($_.Exception.Message)`n  常见原因：开发机 IP 变了。先执行 .\\sync-from-dev.ps1 重新绑定 LAN 远端，再重跑本脚本（Tag 已本地创建，重跑前需 git tag -d $Tag）。"
}
Write-Host "[release] 已推送到 $RemoteName"
if ($PushBranch) {
    Invoke-GitChecked -Arguments @('push', $RemoteName, $currentBranch)
    Write-Host "[release] 已推送分支 $currentBranch"
}

# 3) 构建 Release 包（含 dist 与 node_modules）
$createRelease = Join-Path $repoRoot 'create-release.ps1'
$arguments = @(
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', $createRelease,
    '-Tag', $Tag,
    '-LanGitPath', $LanGitPath,
    '-OutputDirectory', $OutputDirectory
)
if ($SkipTests) { $arguments += '-SkipTests' }
Invoke-NativeChecked -Command 'powershell.exe' -Arguments $arguments -WorkingDirectory $repoRoot

Write-Host ''
Write-Host '✔ 发版完成'
Write-Host "  制品：$OutputDirectory\scienceing-$Tag.zip"
Write-Host ''
Write-Host '  生产机执行（只负责部署，无需源码/pnpm）：'
Write-Host "    .\\deploy-prod.bat            # 自动部署最新 Release"
Write-Host "    .\\deploy-release.ps1 -Tag $Tag   # 或指定版本"
