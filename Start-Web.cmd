@echo off
cd /d "%~dp0"
if not exist "node_modules\realm\package.json" (
  call npm.cmd install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Open http://127.0.0.1:17881 in your browser.
call npm.cmd run web
pause
