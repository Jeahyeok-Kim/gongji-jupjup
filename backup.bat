@echo off
rem Gongji Jupjup: back up collected data, AI answers and reference info into backups\ (and the backupDir in settings.json)
chcp 65001 > nul
set PYTHONUTF8=1
cd /d "%~dp0"
where python > nul 2> nul
if %errorlevel%==0 (set PY=python) else (set PY=py)
%PY% pipeline\backup.py create %*
pause
