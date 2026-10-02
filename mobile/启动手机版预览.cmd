@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\start-mobile-preview.ps1"
if errorlevel 1 pause
