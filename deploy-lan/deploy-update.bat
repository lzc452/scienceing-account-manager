@echo off
rem ============================================================
rem  Update deployment: recompile + migrate + restart services.
rem  (Optional: add " --pull" to also `git pull --ff-only` first)
rem ============================================================
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0.."

set "NODE_CMD="
where node >nul 2>nul && set "NODE_CMD=node"
if not defined NODE_CMD if exist "D:\Applications\nodejs\node.exe" set "NODE_CMD=D:\Applications\nodejs\node.exe"
if not defined NODE_CMD (
  echo [ERROR] Node.js not found on PATH.
  pause
  exit /b 1
)

echo ============================================================
echo   Update: rebuild + migrate + restart services
echo   Run "deploy-update.bat --pull" to pull git changes first.
echo ============================================================
"%NODE_CMD%" deploy-lan\scripts\deploy.mjs update %*
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" ( echo [OK] Update finished. ) else ( echo [FAILED] See deploy-lan\run\deploy.log )
pause
exit /b %RC%
