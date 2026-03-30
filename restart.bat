@echo off
echo Stopping HappyClaw...
taskkill /PID 139036 /F /T >nul 2>&1
taskkill /PID 52636 /F /T >nul 2>&1
timeout /t 3 /nobreak >nul
echo Starting HappyClaw...
cd /d "D:\Project\开源项目\happyclaw"
start "" cmd /c "npm start"
echo HappyClaw restarted!
