@echo off
cd /d "%~dp0"
setlocal enabledelayedexpansion
set PORT=8000
title Maseok Uniform 3D - Local Server

echo ============================================
echo   Maseok Uniform Guidance 3D
echo   Starting local web server...
echo   Your browser will open http://localhost:%PORT%/ shortly.
echo   (Closing this black window stops the game server.)
echo ============================================
echo.

set "RUNNER="
where py >nul 2>nul && set "RUNNER=py -m http.server %PORT%"
if not defined RUNNER ( where python >nul 2>nul && set "RUNNER=python -m http.server %PORT%" )
if not defined RUNNER ( where npx >nul 2>nul && set "RUNNER=npx --yes http-server -p %PORT% -c-1" )

if not defined RUNNER (
  echo [ERROR] Python or Node.js is required to run this game.
  echo   Python: https://www.python.org/    Node.js: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

REM Open the browser only AFTER the server is up (2.5s), so it does not
REM hit a "cannot connect" page and look like nothing happened.
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2.5; Start-Process 'http://localhost:%PORT%/'"

echo Running: !RUNNER!
echo.
!RUNNER!

echo.
echo --------------------------------------------------------
echo [NOTICE] The server has stopped.
echo  - If you see "Address already in use" or "10048" above,
echo    port %PORT% is busy: close other black windows and retry.
echo  - Otherwise copy the error message above and send it to me.
echo --------------------------------------------------------
pause
