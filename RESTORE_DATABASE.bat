@echo off
setlocal
cd /d "%~dp0"
if "%~1"=="" (
  echo Usage: RESTORE_DATABASE.bat server\backups\riseora-YYYY-MM-DDTHH-MM-SS-mmmZ.dump [--env=server/.env.production]
  echo.
  echo The restore tool will show the target database and require typing RESTORE exactly.
  exit /b 2
)
node scripts\db-restore.mjs %*
exit /b %errorlevel%
