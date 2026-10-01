@echo off
setlocal
cd /d "%~dp0"
if not exist "server\.env.production" (
  copy /Y "server\.env.production.example" "server\.env.production" >nul
  echo Created server\.env.production
) else (
  echo server\.env.production already exists - left unchanged.
)
if not exist "client\.env.production" (
  copy /Y "client\.env.production.example" "client\.env.production" >nul
  echo Created client\.env.production
) else (
  echo client\.env.production already exists - left unchanged.
)
echo.
echo Fill REAL production values before running PHASE24_VERIFY_PRODUCTION.bat or PRODUCTION_DEPLOY.bat.
