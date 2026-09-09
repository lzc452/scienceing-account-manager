@echo off
rem ============================================================
rem  Legacy source-tree helper: recompile + migrate + restart.
rem  Formal releases use root deploy-release.ps1; --pull is disabled.
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
echo   Formal release: use root sync-from-dev.ps1 + deploy-release.ps1.
echo ============================================================
"%NODE_CMD%" deploy-lan\scripts\deploy.mjs update %*
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" ( echo [OK] Update finished. ) else ( echo [FAILED] See deploy-lan\run\deploy.log )
pause
exit /b %RC%
