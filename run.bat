@echo off
setlocal enabledelayedexpansion
title MamaSQL
cd /d "%~dp0"

REM --- ensure Node.js is available ---
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found on your PATH.
  echo Install it from https://nodejs.org and run this again.
  pause
  exit /b 1
)

REM --- install dependencies on first run ---
if not exist "node_modules" (
  echo Installing dependencies ^(first run, this may take a minute^)...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

REM --- choose mode: optional argument, else prompt ---
set "MODE=%~1"
if /i "%MODE%"=="web" goto web
if /i "%MODE%"=="desktop" goto desktop
if /i "%MODE%"=="app" goto desktop

echo.
echo   Start MamaSQL:
echo     [D] Desktop app   - native window, real database access
echo     [W] Web preview   - opens http://localhost:1420 in your browser
echo.
choice /c DW /t 8 /d D /n /m "Choose D or W (defaults to Desktop in 8s): "
if errorlevel 2 goto web
goto desktop

:desktop
call :freeport
echo.
echo Launching the desktop app...
echo (The very first launch compiles the Rust backend and can take a few minutes.)
call npm run tauri dev
goto end

:web
call :freeport
echo.
echo Launching the web preview at http://localhost:1420 ...
call npm run dev -- --open
goto end

:end
echo.
echo MamaSQL has stopped.
pause
endlocal
exit /b 0

REM --- free port 1420 if a previous Vite / MamaSQL instance is still holding it ---
:freeport
set "PORT_BUSY="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":1420 " ^| findstr "LISTENING"') do set "PORT_BUSY=1"
if not defined PORT_BUSY goto :eof
echo.
echo Port 1420 is already in use - another Vite / MamaSQL instance is probably running.
choice /c YN /n /m "Free port 1420 so the app can start? [Y/N]: "
if errorlevel 2 (
  echo Leaving it running - the launch will likely fail until port 1420 is free.
  goto :eof
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":1420 " ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>nul
timeout /t 1 /nobreak >nul 2>nul
echo Freed port 1420.
goto :eof
