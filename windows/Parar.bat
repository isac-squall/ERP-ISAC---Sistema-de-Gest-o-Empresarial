@echo off
taskkill /F /IM erp-isac.exe >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$runtime=[IO.Path]::GetFullPath('%~dp0runtime'); Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($runtime,[StringComparison]::OrdinalIgnoreCase) -and $_.CommandLine -like '*server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 2 /nobreak >nul
exit /b 0
