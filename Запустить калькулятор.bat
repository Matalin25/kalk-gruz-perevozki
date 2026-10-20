@echo off
rem Local launcher for the consolidated cargo calculator (PWA).
rem Opens the app at http://localhost:8080 where it can be installed as an app.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
pause
