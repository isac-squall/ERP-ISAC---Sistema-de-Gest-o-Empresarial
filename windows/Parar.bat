@echo off
taskkill /F /IM erp-isac.exe >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { ($_.ExecutablePath -like '*ERP-ISAC*') -or ($_.CommandLine -like '*ERP-ISAC*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr /R /C:":3000 .*LISTENING"') do (
  taskkill /F /PID %%p >nul 2>&1
)
timeout /t 2 /nobreak >nul
exit /b 0
