@echo off
rem ============================================================
rem  scienceing-account-manager  Intranet Deploy  (First / Full)
rem  Deploy steps: build server+web+worker, migrate+seed DB,
rem  start backend (:3000) + gateway (nginx preferred, node fallback)
rem  then pack the LAN edition browser extension (.zip).
rem ============================================================
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0.."

set "NODE_CMD="
where node >nul 2>nul && set "NODE_CMD=node"
if not defined NODE_CMD if exist "D:\Applications\nodejs\node.exe" set "NODE_CMD=D:\Applications\nodejs\node.exe"
if not defined NODE_CMD (
  echo [ERROR] Node.js not found on PATH. Install Node.js 24 ^(or 22.5+^) and retry.
  pause
  exit /b 1
)

echo ============================================================
echo   First-time full deployment (this usually takes 1-3 min)
echo   Gateway port defaults to 18080, backend to 3000.
echo   Edit deploy-lan\config.env to change ports / LAN IP.
echo ============================================================
"%NODE_CMD%" deploy-lan\scripts\deploy.mjs deploy %*
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
  echo [OK] Deployment finished. Open deploy-lan\run\deploy.log for details.
  echo      Give colleagues the LAN URL shown above, or run status.bat anytime.
) else (
  echo [FAILED] See messages above or deploy-lan\run\deploy.log
)
pause
exit /b %RC%
