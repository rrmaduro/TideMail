@echo off
REM tidemail launcher for Windows — sets up everything on first run, then starts the app.
setlocal
cd /d "%~dp0"

echo === tidemail ===

REM 1) Python virtual environment + backend deps
if not exist "venv\Scripts\python.exe" (
    echo Creating Python virtual environment...
    python -m venv venv || goto :err
    echo Installing backend dependencies...
    "venv\Scripts\python.exe" -m pip install --upgrade pip >nul
    "venv\Scripts\python.exe" -m pip install -r requirements.txt || goto :err
)

REM 2) Frontend build (needs Node.js)
if not exist "frontend\dist\browser\index.html" (
    echo Building the interface...
    pushd frontend
    if not exist "node_modules" ( call npm install || goto :err )
    call npm run build || goto :err
    popd
)

REM 3) Run
echo Starting tidemail at http://127.0.0.1:8000 ...
"venv\Scripts\python.exe" backend\app.py
goto :eof

:err
echo.
echo Setup failed. Make sure Python 3.10+ and Node.js 20+ are installed and on your PATH.
pause
exit /b 1
