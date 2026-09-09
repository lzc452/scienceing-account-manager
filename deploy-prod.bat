@echo off
rem ============================================================
rem  Production one-click deploy (no source build, no pnpm needed).
rem  It fetches the release package from the dev share, verifies
rem  SHA256, backs up + migrates the database, then starts services.
rem
rem  Usage:
rem    deploy-prod.bat                     -> deploy the latest release
rem    deploy-prod.bat -Tag v1.2.3         -> deploy a specific version
rem    deploy-prod.bat -Tag v1.2.3 -SkipSync
rem ============================================================
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

if "%~1"=="" (
  echo Deploying the LATEST release from dev share ...
  powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0deploy-release.ps1" -Tag latest
) else (
  powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0deploy-release.ps1" %*
)

set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
  echo [OK] Deploy finished.
) else (
  echo [FAILED] Exit code %RC%. Check the deploy log under ^<InstallRoot^>\run\deploy-*.log
)
pause
exit /b %RC%
