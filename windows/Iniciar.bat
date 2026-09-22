@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0runtime\erp-isac.exe" (
  set "NODEBIN=%~dp0runtime\erp-isac.exe"
) else (
  set "NODEBIN=%~dp0runtime\node.exe"
)
if not exist "%NODEBIN%" (
  echo Execute ERP-ISAC-Setup.exe primeiro.
  pause
  exit /b 1
)
cd /d "%~dp0app"
start "" http://localhost:3000
"%NODEBIN%" server.js
echo.
echo Se a janela fechou com erro, copie o texto acima.
pause
endlocal
