@echo off
title UniTally 停止服务
color 0C
cd /d "%~dp0"

echo ==================================================
echo           UniTally 停止服务
echo ==================================================
echo.

echo 正在关闭前端 / 后端窗口...
taskkill /F /FI "WINDOWTITLE eq UniTally 前端*" >nul 2>nul
taskkill /F /FI "WINDOWTITLE eq UniTally 后端服务*" >nul 2>nul

echo 正在结束占用端口 5000 / 8080 的进程（兜底）...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>nul
for /f "tokens=5" %%b in ('netstat -ano ^| findstr ":8080 " ^| findstr "LISTENING"') do taskkill /F /PID %%b >nul 2>nul

echo.
echo 所有服务已停止。
pause
