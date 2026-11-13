@echo off
rem Gongji Jupjup: register a daily Windows scheduled task that runs run_auto.bat (default 07:30)
rem Usage: setup_auto.bat [HH:MM]     Remove it with: schtasks /Delete /TN "GongjiJupjup" /F
chcp 65001 > nul
cd /d "%~dp0"
set AT=%1
if "%AT%"=="" set AT=07:30
schtasks /Create /TN "GongjiJupjup" /SC DAILY /ST %AT% /TR "\"%~dp0run_auto.bat\"" /F
echo.
echo Registered: runs every day at %AT% (the PC must be on and Ollama running). Logs: logs\auto-DATE.log
pause
