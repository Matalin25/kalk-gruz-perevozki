@echo off
rem Create the git repository for this project and make the first commit.
rem Requires Git for Windows: https://git-scm.com/download/win
setlocal
cd /d "%~dp0"

git --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Git is not installed or not in PATH.
  echo Download and install it from https://git-scm.com/download/win
  echo Then close this window and run this file again.
  pause
  exit /b 1
)

if not exist ".git" (
  git init
  git branch -M main
)

git config user.name  >nul 2>&1 || git config user.name  "KalkGruz Calculator"
git config user.email >nul 2>&1 || git config user.email "matalin@inbox.ru"

git add -A
git commit -m "Initial commit: consolidated cargo delivery calculator PWA"
if errorlevel 1 (
  echo.
  echo [INFO] Commit was not created (nothing to commit or an error above).
) else (
  echo.
  echo [OK] Repository created and first commit done.
)

echo.
echo --- Recent commits ---
git log --oneline -5
echo.
pause
