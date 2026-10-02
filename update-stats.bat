@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-stats.ps1"
echo.
pause
