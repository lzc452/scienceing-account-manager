[CmdletBinding()]
param(
    [string]$DevHost = '1399-IT-100158',
    [string]$ShareName = 'git-local-share',
    [string]$RemoteName = 'lan'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'deploy-lan\scripts\release-common.ps1')

$share = Resolve-DevelopmentShare -DevHost $DevHost -ShareName $ShareName
$remoteUrl = "//$($share.IPv4)/$ShareName/scienceing.git"

$existingRemotes = @(& git -C $PSScriptRoot remote)
if ($LASTEXITCODE -ne 0) { throw '当前目录不是可用的 Git 工作区。' }
if ($existingRemotes -contains $RemoteName) {
    Invoke-NativeChecked -Command 'git' -Arguments @('-C', $PSScriptRoot, 'remote', 'set-url', $RemoteName, $remoteUrl)
}
else {
    Invoke-NativeChecked -Command 'git' -Arguments @('-C', $PSScriptRoot, 'remote', 'add', $RemoteName, $remoteUrl)
}

Invoke-NativeChecked -Command 'git' -Arguments @('-C', $PSScriptRoot, 'fetch', $RemoteName, '--tags', '--prune')
Write-Host "同步完成：$RemoteName -> $remoteUrl"
