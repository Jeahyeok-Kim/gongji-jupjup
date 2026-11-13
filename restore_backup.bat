@echo off
rem Gongji Jupjup: restore data from a backup zip (lists backups, then asks which one)
chcp 65001 > nul
set PYTHONUTF8=1
cd /d "%~dp0"
where python > nul 2> nul
if %errorlevel%==0 (set PY=python) else (set PY=py)
%PY% pipeline\backup.py list
echo.
echo Enter the backup file name to restore (leave empty for the latest one):
set /p NAME=
if "%NAME%"=="" (%PY% pipeline\backup.py restore) else (%PY% pipeline\backup.py restore "backups\%NAME%")
pause
