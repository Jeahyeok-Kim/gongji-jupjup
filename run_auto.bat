@echo off
rem Gongji Jupjup: unattended run for Windows Task Scheduler (no pause, writes logs\auto-DATE.log)
chcp 65001 > nul
set PYTHONUTF8=1
cd /d "%~dp0"
if not exist logs mkdir logs
where python > nul 2> nul
if %errorlevel%==0 (set PY=python) else (set PY=py)
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set TODAY=%%i
%PY% pipeline\run_all.py --auto %* >> "logs\auto-%TODAY%.log" 2>&1
