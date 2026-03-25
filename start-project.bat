@echo off
setlocal
set NODE_PATH=%~dp0node-portable\node-v20.20.1-win-x64
set PATH=%NODE_PATH%;%PATH%

echo Installing dependencies...
call npm install

echo.
echo Starting development server...
call npm run dev

pause
