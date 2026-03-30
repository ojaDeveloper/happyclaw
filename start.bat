@echo off
chcp 65001 >nul 2>&1
setlocal

REM HappyClaw Windows Startup Script
REM Simplified equivalent of `make start` for Windows

echo [1/4] Syncing shared types...
copy /Y shared\stream-event.ts src\stream-event.types.ts >nul
copy /Y shared\stream-event.ts web\src\stream-event.types.ts >nul
copy /Y shared\stream-event.ts container\agent-runner\src\stream-event.types.ts >nul
copy /Y shared\image-detector.ts src\image-detector.ts >nul
copy /Y shared\image-detector.ts container\agent-runner\src\image-detector.ts >nul
copy /Y shared\channel-prefixes.ts src\channel-prefixes.ts >nul
copy /Y shared\channel-prefixes.ts container\agent-runner\src\channel-prefixes.ts >nul

echo [2/4] Checking dependencies...
if not exist node_modules (
    echo Installing root dependencies...
    call npm install
    if errorlevel 1 goto :error
)
if not exist web\node_modules (
    echo Installing web dependencies...
    cd web && call npm install && cd ..
    if errorlevel 1 goto :error
)
if not exist container\agent-runner\node_modules (
    echo Installing agent-runner dependencies...
    cd container\agent-runner && call npm install && cd ..\..
    if errorlevel 1 goto :error
)

echo [3/4] Building all...
call npm run build:all
if errorlevel 1 goto :error

echo [4/4] Starting server...
node dist\index.js
goto :eof

:error
echo Build failed!
exit /b 1
