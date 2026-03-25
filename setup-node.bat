@echo off
set NODE_PATH=%~dp0node-portable\node-v20.20.1-win-x64
set PATH=%NODE_PATH%;%PATH%
echo Node.js environment is ready!
echo Node version:
node --version
echo NPM version:
npm --version
cmd /k
