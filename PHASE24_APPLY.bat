@echo off
setlocal
cd /d "%~dp0"
title Riseora Ecommerce - Phase 24 Apply

echo ============================================================
echo  RISEORA E-COMMERCE - PHASE 24 APPLY + VERIFICATION
echo ============================================================
echo.
where node >nul 2>nul || (echo ERROR: Node.js is not installed or not in PATH.& exit /b 1)
where npm >nul 2>nul || (echo ERROR: npm is not installed or not in PATH.& exit /b 1)

echo [1/6] Installing exact dependencies from package-lock.json...
call npm ci || goto :fail

echo [2/6] Generating Prisma client...
call npm run db:generate || goto :fail

echo [3/6] Applying committed migrations to CURRENT server/.env database...
call npm run db:deploy || goto :fail

echo [4/6] Server TypeScript verification...
call npm run typecheck || goto :fail

echo [5/6] Production builds...
call npm run build || goto :fail

echo [6/6] Phase 24 source verification complete.
echo.
echo ============================================================
echo  PHASE 24 APPLY: PASS
echo ============================================================
echo Development verification passed. This does NOT deploy the live database.
echo For live deployment configure .env.production files, then run PRODUCTION_DEPLOY.bat.
exit /b 0

:fail
echo.
echo ============================================================
echo  PHASE 24 APPLY: FAILED
echo ============================================================
echo Fix the error shown above. Production must not be considered ready.
exit /b 1
