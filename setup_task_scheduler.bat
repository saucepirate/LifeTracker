@echo off
:: Self-elevate if not running as admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting admin to update Task Scheduler...
    powershell -Command "Start-Process -FilePath '%~dpnx0' -Verb RunAs"
    exit
)

set SCRIPT_DIR=%~dp0
set PYTHON_PATH=%LOCALAPPDATA%\Programs\Python\Python313\pythonw.exe

:: Delete old task (ignore error if not found)
schtasks /delete /tn "LifeTracker" /f >nul 2>&1

:: Build the task XML with battery-allowed settings
set XML_FILE=%TEMP%\LifeTracker_task.xml
(
echo ^<?xml version="1.0" encoding="UTF-16"?^>
echo ^<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"^>
echo   ^<RegistrationInfo^>^<Description^>LifeTracker auto-start^</Description^>^</RegistrationInfo^>
echo   ^<Triggers^>
echo     ^<LogonTrigger^>^<Enabled^>true^</Enabled^>^<UserId^>%USERDOMAIN%\%USERNAME%^</UserId^>^</LogonTrigger^>
echo   ^</Triggers^>
echo   ^<Principals^>
echo     ^<Principal id="Author"^>^<UserId^>%USERDOMAIN%\%USERNAME%^</UserId^>^<LogonType^>InteractiveToken^</LogonType^>^<RunLevel^>LeastPrivilege^</RunLevel^>^</Principal^>
echo   ^</Principals^>
echo   ^<Settings^>
echo     ^<DisallowStartIfOnBatteries^>false^</DisallowStartIfOnBatteries^>
echo     ^<StopIfGoingOnBatteries^>false^</StopIfGoingOnBatteries^>
echo     ^<ExecutionTimeLimit^>PT0S^</ExecutionTimeLimit^>
echo     ^<MultipleInstancesPolicy^>IgnoreNew^</MultipleInstancesPolicy^>
echo     ^<IdleSettings^>^<StopOnIdleEnd^>true^</StopOnIdleEnd^>^<RestartOnIdle^>false^</RestartOnIdle^>^</IdleSettings^>
echo   ^</Settings^>
echo   ^<Actions Context="Author"^>
echo     ^<Exec^>^<Command^>%PYTHON_PATH%^</Command^>^<Arguments^>"%SCRIPT_DIR%start.pyw"^</Arguments^>^<WorkingDirectory^>%SCRIPT_DIR%^</WorkingDirectory^>^</Exec^>
echo   ^</Actions^>
echo ^</Task^>
) > "%XML_FILE%"

schtasks /create /tn "LifeTracker" /xml "%XML_FILE%" /f
if %errorLevel% equ 0 (
    echo.
    echo LifeTracker will now auto-start on login, even on battery.
) else (
    echo ERROR: Task creation failed.
)
del "%XML_FILE%" >nul 2>&1
pause
