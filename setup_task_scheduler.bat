@echo off
set SCRIPT_DIR=%~dp0
set PYTHON_PATH=%LOCALAPPDATA%\Programs\Python\Python313\pythonw.exe
schtasks /create /tn "LifeTracker" /tr "\"%PYTHON_PATH%\" \"%SCRIPT_DIR%start.pyw\"" /sc onlogon /rl limited /f /it
echo LifeTracker scheduled to start on login.
pause
