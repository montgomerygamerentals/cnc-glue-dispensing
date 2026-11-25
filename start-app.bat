@echo off
title GluePath CNC
cd /d "%~dp0"
echo Starting GluePath CNC at http://localhost:3000
echo Leave this window open. Close it to stop the app.
start "" cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:3000"
npm run dev
