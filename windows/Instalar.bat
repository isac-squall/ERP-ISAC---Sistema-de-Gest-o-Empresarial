@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================
echo   ERP ISAC - Instalacao no Windows
echo ============================================
echo.

set "INSTALLDIR=%LOCALAPPDATA%\ERP-ISAC"
set "APPDIR=%INSTALLDIR%\app"
set "RTDIR=%INSTALLDIR%\runtime"

if not exist "%~dp0runtime\node.exe" (
  echo ERRO: esta pasta nao e o instalador completo.
  echo.
  echo Voce abriu so a pasta "windows" com os scripts.
  echo Use o arquivo ERP-ISAC-Setup.exe ^(pasta dist^).
  echo Ou extraia ERP-ISAC-Windows.zip e rode Instalar.bat de DENTRO da pasta ERP-ISAC
  echo ^(precisa existir a pasta runtime com node.exe^).
  echo.
  pause
  exit /b 1
)

echo Instalando em:
echo   %INSTALLDIR%
echo.

if not exist "%INSTALLDIR%" mkdir "%INSTALLDIR%"
if not exist "%APPDIR%" mkdir "%APPDIR%"
if not exist "%RTDIR%" mkdir "%RTDIR%"

echo Encerrando versao anterior...
taskkill /F /IM erp-isac.exe >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like '*ERP-ISAC*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 2 /nobreak >nul

echo Copiando runtime Node.js...
xcopy /E /I /Y /Q "%~dp0runtime" "%RTDIR%" >nul
if exist "%RTDIR%\node.exe" copy /Y "%RTDIR%\node.exe" "%RTDIR%\erp-isac.exe" >nul

echo Copiando o sistema...
xcopy /Y /Q "%~dp0app\*.js" "%APPDIR%" >nul
xcopy /Y /Q "%~dp0app\*.json" "%APPDIR%" >nul
if exist "%~dp0app\erp.db" copy /Y "%~dp0app\erp.db" "%APPDIR%\erp.db" >nul
xcopy /E /I /Y /Q "%~dp0app\public" "%APPDIR%\public" >nul
xcopy /E /I /Y /Q "%~dp0app\assistente" "%APPDIR%\assistente" >nul
if exist "%~dp0app\node_modules" xcopy /E /I /Y /Q "%~dp0app\node_modules" "%APPDIR%\node_modules" >nul
copy /Y "%~dp0Iniciar.vbs" "%INSTALLDIR%\Iniciar.vbs" >nul
copy /Y "%~dp0Iniciar.bat" "%INSTALLDIR%\Iniciar.bat" >nul
copy /Y "%~dp0Iniciar-oculto.bat" "%INSTALLDIR%\Iniciar-oculto.bat" >nul
copy /Y "%~dp0Parar.bat" "%INSTALLDIR%\Parar.bat" >nul
copy /Y "%~dp0Desinstalar.bat" "%INSTALLDIR%\Desinstalar.bat" >nul
copy /Y "%~dp0LEIA-ME.txt" "%INSTALLDIR%\LEIA-ME.txt" >nul

if not exist "%APPDIR%\node_modules\better-sqlite3" (
  echo ERRO: dependencias nao encontradas no pacote.
  echo Use o arquivo ERP-ISAC-Setup.exe da pasta dist.
  pause
  exit /b 1
)

echo.
echo Criando atalho na Area de Trabalho...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$desk=[Environment]::GetFolderPath('Desktop');" ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desk 'ERP ISAC.lnk'));" ^
  "$s.TargetPath='%INSTALLDIR%\Iniciar.vbs';" ^
  "$s.WorkingDirectory='%INSTALLDIR%';" ^
  "$s.WindowStyle=7;" ^
  "$s.Description='Sistema de gestao empresarial ERP ISAC';" ^
  "$s.Save()"

echo Criando atalho no Menu Iniciar...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$menu=Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs';" ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $menu 'ERP ISAC.lnk'));" ^
  "$s.TargetPath='%INSTALLDIR%\Iniciar.vbs';" ^
  "$s.WorkingDirectory='%INSTALLDIR%';" ^
  "$s.Description='Sistema de gestao empresarial ERP ISAC';" ^
  "$s.Save()"

echo.
echo Instalacao concluida.
echo.
echo Login padrao:
echo   Email: admin@erpisac.com
echo   Senha: admin123
echo.
echo Clique em "ERP ISAC" na Area de Trabalho para abrir o sistema.
echo.
pause
endlocal
