@echo off
setlocal
cd /d "%~dp0"
title Riseora Ecommerce - Production Deploy

echo ============================================================
echo  RISEORA E-COMMERCE - SAFE PRODUCTION DEPLOY
echo ============================================================
echo This will BACK UP and then MIGRATE the database in server\.env.production.
echo.
set /p CONFIRM=Type DEPLOY to continue: 
if /I not "%CONFIRM%"=="DEPLOY" (
  echo Production deploy cancelled.
  exit /b 0
)

echo [1/3] Production database backup...
node scripts\db-backup.mjs --env=server/.env.production || goto :fail

echo [2/3] Preflight + migration + typecheck + build...
call npm run deploy:production || goto :fail

echo [3/3] Deployment artifacts prepared.
echo.
echo ============================================================
echo  PRODUCTION DEPLOY BUILD: PASS
echo ============================================================
echo Start the app with PRODUCTION_START.bat and verify /api/health/ready.
exit /b 0
:fail
echo.
echo PRODUCTION DEPLOY FAILED. Do not serve new traffic until corrected.
exit /b 1
