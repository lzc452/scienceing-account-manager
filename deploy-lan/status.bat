@echo off
rem ============================================================
rem  Show deployment status and the colleague access URLs.
rem ============================================================
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0.."

set "NODE_CMD="
where node >nul 2>nul && set "NODE_CMD=node"
if not defined NODE_CMD if exist "D:\Applications\nodejs\node.exe" set "NODE_CMD=D:\Applications\nodejs\node.exe"
if not defined NODE_CMD ( echo [ERROR] Node.js not found on PATH. & pause & exit /b 1 )

"%NODE_CMD%" deploy-lan\scripts\deploy.mjs status %*
pause
