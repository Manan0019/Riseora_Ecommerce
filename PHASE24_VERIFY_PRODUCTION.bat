@echo off
setlocal
cd /d "%~dp0"
title Riseora Ecommerce - Production Preflight

echo [1/4] Production environment preflight...
call npm run preflight:production || goto :fail

echo [2/4] Prisma generation...
call npm run db:generate || goto :fail

echo [3/4] Server typecheck...
call npm run typecheck || goto :fail

echo [4/4] Production build...
call npm run build || goto :fail

echo.
echo PHASE 24 PRODUCTION PREFLIGHT: PASS
echo No production database migration was executed by this verification script.
exit /b 0
:fail
echo.
echo PHASE 24 PRODUCTION PREFLIGHT: FAILED
exit /b 1
