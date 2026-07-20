@echo off
REM ===== PMO Enterprise Tool - Windows Launcher =====
setlocal
cd /d "%~dp0"

where py >nul 2>&1
if %errorlevel%==0 (
    set "PYCMD=py -3"
) else (
    where python >nul 2>&1
    if %errorlevel%==0 (
        set "PYCMD=python"
    ) else (
        echo.
        echo [ERROR] Python is not installed.
        echo Please install Python 3.10 or newer from https://www.python.org/downloads/
        echo Make sure to tick "Add Python to PATH" during installation.
        echo.
        pause
        exit /b 1
    )
)

if not exist ".venv\" (
    echo Creating virtual environment ^(one-time, ~1 min^)...
    %PYCMD% -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

call ".venv\Scripts\activate.bat"

if not exist ".venv\.installed" (
    echo Installing dependencies ^(one-time, may take a few minutes^)...
    python -m pip install --upgrade pip
    python -m pip install -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] Dependency install failed.
        pause
        exit /b 1
    )
    type nul > ".venv\.installed"
)

echo.
echo ============================================================
echo  Launching PMO Enterprise Tool...
echo  The app will open in your browser at http://localhost:8501
echo  Keep this window open while using the app.
echo  Close this window to stop the app.
echo ============================================================
echo.

start "" "http://localhost:8501"
python -m streamlit run app.py --server.headless true --browser.gatherUsageStats false

pause
