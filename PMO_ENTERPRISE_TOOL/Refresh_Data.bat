@echo off
REM ============================================================
REM  Refresh_Data.bat — Rebuild all derived sheets from Projects.
REM
REM  IMPORTANT: Close PMO_Master.xlsx in Excel BEFORE clicking this.
REM  Excel locks the file while it is open, so Python cannot save,
REM  and Excel will not reload changes while the workbook is open.
REM ============================================================
cd /d "%~dp0"

where py >nul 2>&1
if %errorlevel%==0 (
    py -3 Refresh_Data.py
) else (
    python Refresh_Data.py
)

echo.
echo ------------------------------------------------------------
echo  Done. Press any key to close this window.
echo ------------------------------------------------------------
pause >nul
