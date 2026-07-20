@echo off
REM Build script for PMO Enterprise Tool Windows executable
REM Run this on a Windows machine with Python 3.10+ installed

echo ==========================================
echo   PMO Enterprise Tool - Build Windows EXE
echo ==========================================
echo.

REM Verify Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH.
    echo Please install Python 3.10+ from https://python.org
    pause
    exit /b 1
)

echo [1/4] Installing dependencies...
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install dependencies.
    pause
    exit /b 1
)

echo.
echo [2/4] Building executable with PyInstaller...
pyinstaller --onefile --name "PMO_Enterprise_Tool" ^
    --add-data "app.py;." ^
    --add-data "appadmin.py;." ^
    --add-data "config.py;." ^
    --add-data "generate_master.py;." ^
    --add-data "requirements.txt;." ^
    --add-data "README.md;." ^
    --add-data "HOW_TO_RUN.txt;." ^
    --add-data "RUN.bat;." ^
    --add-data "pages;pages" ^
    --add-data "utils;utils" ^
    --add-data "assets;assets" ^
    --add-data "data;data" ^
    --add-data ".streamlit;.streamlit" ^
    --hidden-import streamlit ^
    --hidden-import pandas ^
    --hidden-import openpyxl ^
    --hidden-import plotly ^
    --hidden-import numpy ^
    --hidden-import pptx ^
    --hidden-import kaleido ^
    --hidden-import matplotlib ^
    --hidden-import PIL ^
    launcher.py

if errorlevel 1 (
    echo ERROR: PyInstaller build failed.
    pause
    exit /b 1
)

echo.
echo [3/4] Cleaning up build artifacts...
if exist build rmdir /s /q build

echo.
echo [4/4] Build complete!
echo.
echo Executable location: dist\PMO_Enterprise_Tool.exe
echo.
pause
