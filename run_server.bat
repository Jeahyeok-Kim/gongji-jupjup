@echo off
rem Gongji Jupjup: local receiver for the Chrome extension (http://127.0.0.1:8765). Keep this window open.
rem The extension sends collected notices here, and the pipeline runs automatically a minute later.
chcp 65001 > nul
set PYTHONUTF8=1
cd /d "%~dp0"
where python > nul 2> nul
if %errorlevel%==0 (set PY=python) else (set PY=py)
%PY% pipeline\receiver.py %*
pause
