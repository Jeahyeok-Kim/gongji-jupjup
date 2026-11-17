@echo off
rem Gongji Jupjup: register Windows scheduled tasks
rem   1) GongjiJupjup        - runs run_auto.bat every day (default 07:30): full pipeline even if nothing new arrived
rem   2) GongjiJupjupServer  - starts the local receiver (pipeline\receiver.py) in the background at every logon
rem Usage: setup_auto.bat [HH:MM]
rem Remove: schtasks /Delete /TN "GongjiJupjup" /F   and   schtasks /Delete /TN "GongjiJupjupServer" /F
chcp 65001 > nul
cd /d "%~dp0"
set AT=%1
if "%AT%"=="" set AT=07:30
where pythonw > nul 2> nul
if %errorlevel%==0 (set PYW=pythonw) else (set PYW=pyw)
schtasks /Create /TN "GongjiJupjup" /SC DAILY /ST %AT% /TR "\"%~dp0run_auto.bat\"" /F
schtasks /Create /TN "GongjiJupjupServer" /SC ONLOGON /TR "\"%PYW%\" \"%~dp0pipeline\receiver.py\"" /F
start "" %PYW% "%~dp0pipeline\receiver.py"
echo.
echo Registered: daily run at %AT% and the receiver at every logon (started now too).
echo Check: open http://127.0.0.1:8765/status in a browser. Logs: logs\server-DATE.log, logs\auto-DATE.log
pause
