@echo off
rem Gongji Jupjup: merge exports, update reference data, read posters/attachments, decode notices with a local AI
rem Double-click: uses every kku-notices-*.json / kku-reference-*.json in this folder, collected\ and Downloads.
rem Or drag kku-notices-*.json and/or kku-reference-*.json files onto this file.
chcp 65001 > nul
set PYTHONUTF8=1
cd /d "%~dp0"
where python > nul 2> nul
if %errorlevel%==0 (set PY=python) else (set PY=py)
%PY% pipeline\run_all.py %*
pause
