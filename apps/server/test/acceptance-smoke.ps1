# Scienceing acceptance smoke test (PRD §60 HTTP-side evidence)
# Precondition: server running on PORT=3100 with DATABASE_PATH=data/acceptance.db, RESET_INTERVAL_MS=1500
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3100/api'

function Invoke-Json {
  param(
    [ValidateSet('GET', 'POST', 'PATCH')] [string]$Method,
    [string]$Path,
    [object]$Body = $null,
    [string]$Token = ''
  )
  $headers = @{}
  if ($Token) { $headers['Authorization'] = "Bearer $Token" }
  $uri = "$base$Path"
  try {
    if ($Method -eq 'GET') {
      $r = Invoke-WebRequest -Method GET -Uri $uri -Headers $headers -UseBasicParsing
    } else {
      $json = $Body | ConvertTo-Json -Compress -Depth 8
      $r = Invoke-WebRequest -Method $Method -Uri $uri -Headers $headers -ContentType 'application/json' -Body $json -UseBasicParsing
    }
    $parsed = $null
    try { $parsed = $r.Content | ConvertFrom-Json } catch { $parsed = $r.Content }
    return [pscustomobject]@{ status = [int]$r.StatusCode; body = $parsed }
  } catch {
    $resp = $_.Exception.Response
    if ($resp -ne $null) {
      $status = [int]$resp.StatusCode
      $stream = $resp.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      $txt = $reader.ReadToEnd()
      $parsed = $null
      try { $parsed = $txt | ConvertFrom-Json } catch { $parsed = $txt }
      return [pscustomobject]@{ status = $status; body = $parsed }
    }
    return [pscustomobject]@{ status = -1; body = $_.Exception.Message }
  }
}

function Show([string]$label, $obj) {
  Write-Output "===== $label ====="
  $obj | ConvertTo-Json -Depth 8
  Write-Output ''
}

# 1. initial availability
Show 'initial availability' (Invoke-Json GET '/accounts/availability')

# 2. admin login + create two normal users
$admin = Invoke-Json POST '/auth/login' @{ username = 'admin'; password = 'admin123456' }
Show 'admin login' @{ status = $admin.status; user = $admin.body.user.username }
$adminToken = $admin.body.token

$c1 = Invoke-Json POST '/admin/users' @{ username = 'u1'; displayName = 'UserOne'; department = 'R&D'; password = 'u1-pass'; role = 'USER' } $adminToken
$c2 = Invoke-Json POST '/admin/users' @{ username = 'u2'; displayName = 'UserTwo'; department = 'PM'; password = 'u2-pass'; role = 'USER' } $adminToken
Show 'create users' @{ u1 = $c1.status; u2 = $c2.status }

# 3. u1 / u2 login
$u1 = Invoke-Json POST '/auth/login' @{ username = 'u1'; password = 'u1-pass' }
$u2 = Invoke-Json POST '/auth/login' @{ username = 'u2'; password = 'u2-pass' }
$u1Token = $u1.body.token
$u2Token = $u2.body.token
Show 'u1/u2 login' @{ u1 = $u1.status; u2 = $u2.status }

# ---- Scenario 1: normal claim (A claims KY-01, B cannot claim same) ----
$claimA = Invoke-Json POST '/leases' @{ extensionVersion = '1.0.0' } $u1Token
$claimB = Invoke-Json POST '/leases' @{ extensionVersion = '1.0.0' } $u2Token
$codeA = $claimA.body.account.code
$codeB = $claimB.body.account.code
Show 'S1 claim A then B' @{
  aStatus = $claimA.status; aCode = $codeA
  bStatus = $claimB.status; bCode = $codeB
  different = ($codeA -ne $codeB)
}

# ---- Scenario 2: one user one lease (re-claim returns same account) ----
$claimA2 = Invoke-Json POST '/leases' @{ extensionVersion = '1.0.0' } $u1Token
Show 'S2 A re-claim returns same' @{
  status = $claimA2.status
  firstCode = $codeA
  againCode = $claimA2.body.account.code
  same = ($codeA -eq $claimA2.body.account.code)
}

# ---- Scenario 4: normal Activity (countdown resets to ~30 min after activity) ----
# NOTE: S2 re-claim rotated the leaseToken; the valid token is the LATEST claim response ($claimA2).
$leaseIdA = $claimA2.body.lease.id
$leaseTokenA = $claimA2.body.leaseToken
$statusBefore = Invoke-Json GET "/leases/$leaseIdA/status" -Token $leaseTokenA
$activity = Invoke-Json POST "/leases/$leaseIdA/activity" @{} $leaseTokenA
$statusAfter = Invoke-Json GET "/leases/$leaseIdA/status" -Token $leaseTokenA
Show 'S4 activity renews countdown' @{
  activityResult = $activity.body.result
  statusCode = $statusAfter.status
  remainingBefore = $statusBefore.body.remainingSeconds
  remainingAfter = $statusAfter.body.remainingSeconds
}

# ---- Scenario 7: active return (release -> RECYCLING + reset_job) ----
$rel = Invoke-Json POST "/leases/$leaseIdA/release" @{} $u1Token
$poolAfterRelease = Invoke-Json GET '/accounts/pool'
$kyStatus = ($poolAfterRelease.body | Where-Object { $_.code -eq $codeA }).status
Show 'S7 release -> RECYCLING' @{
  releaseStatus = $rel.status
  leaseStatus = $rel.body.status
  releaseReason = $rel.body.releaseReason
  accountPoolStatus = $kyStatus
}

# ---- Scenario 9: reset failure (executor stub -> 3 retries -> ERROR, never auto-AVAILABLE) ----
# RESET_INTERVAL_MS=1500 -> wait ~8s for 3 retries
Start-Sleep -Seconds 8
$poolAfterFail = Invoke-Json GET '/accounts/pool'
$kyAfterFail = ($poolAfterFail.body | Where-Object { $_.code -eq $codeA }).status
$availAfterFail = Invoke-Json GET '/accounts/availability'
Show 'S9 reset failure -> ERROR' @{
  accountStatus = $kyAfterFail
  availability = $availAfterFail.body
  notAvailable = ($kyAfterFail -eq 'ERROR')
}

# ---- Post-ERROR check: ERROR account is not claimable (new user gets a different account) ----
$c3 = Invoke-Json POST '/admin/users' @{ username = 'u3'; displayName = 'UserThree'; department = 'QA'; password = 'u3-pass'; role = 'USER' } $adminToken
$u3 = Invoke-Json POST '/auth/login' @{ username = 'u3'; password = 'u3-pass' }
$u3Token = $u3.body.token
$claimU3 = Invoke-Json POST '/leases' @{ extensionVersion = '1.0.0' } $u3Token
Show 'post-ERROR new user claims different' @{
  u3Status = $claimU3.status
  u3Code = $claimU3.body.account.code
  notErrorAccount = ($claimU3.body.account.code -ne $codeA)
}

# ---- extension config (for scenario 3 version detection) ----
$extCfg = Invoke-Json GET '/extension/config'
Show 'extension config' $extCfg.body

Write-Output '===== SMOKE DONE ====='
