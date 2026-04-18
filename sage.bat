@echo off
REM OpenSage Launcher for Windows
cd /d "%~dp0"

if not defined OPENCODE_API_KEY (
    echo AVISO: OPENCODE_API_KEY nao definida!
    echo Defina com: set OPENCODE_API_KEY=sua_api_key
    echo.
)

node opensage.js %*