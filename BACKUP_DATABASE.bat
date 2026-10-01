@echo off
setlocal
cd /d "%~dp0"
node scripts\db-backup.mjs %*
if errorlevel 1 exit /b %errorlevel%
echo.
echo Backup stored under server\backups.
