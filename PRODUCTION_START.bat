@echo off
setlocal
cd /d "%~dp0"
title Riseora Ecommerce - Production Server
if not exist "server\.env.production" (
  echo ERROR: server\.env.production is missing.
  echo Run PREPARE_PRODUCTION_ENV.bat and fill real values first.
  exit /b 1
)
if not exist "server\dist\index.js" (
  echo ERROR: server production build is missing.
  echo Run PRODUCTION_DEPLOY.bat first.
  exit /b 1
)
if not exist "client\dist\index.html" (
  echo ERROR: client production build is missing.
  echo Run PRODUCTION_DEPLOY.bat first.
  exit /b 1
)
echo Starting Riseora production server...
echo Health: http://localhost:5000/api/health/ready
start "" "http://localhost:5000"
call npm run start:production
