@echo off
cd /d "%~dp0app"
if exist "%~dp0runtime\erp-isac.exe" (
  "%~dp0runtime\erp-isac.exe" server.js >> "%~dp0erp-isac.log" 2>&1
) else (
  "%~dp0runtime\node.exe" server.js >> "%~dp0erp-isac.log" 2>&1
)
