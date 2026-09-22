@echo off
setlocal
echo Isso remove o ERP ISAC deste usuario.
echo Os atalhos e a pasta %%LOCALAPPDATA%%\ERP-ISAC serao apagados.
pause

call "%~dp0Parar.bat"

set "INSTALLDIR=%LOCALAPPDATA%\ERP-ISAC"
if exist "%USERPROFILE%\Desktop\ERP ISAC.lnk" del /f /q "%USERPROFILE%\Desktop\ERP ISAC.lnk"
if exist "%USERPROFILE%\OneDrive\Desktop\ERP ISAC.lnk" del /f /q "%USERPROFILE%\OneDrive\Desktop\ERP ISAC.lnk"
if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\ERP ISAC.lnk" del /f /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\ERP ISAC.lnk"

if exist "%INSTALLDIR%" (
  rmdir /s /q "%INSTALLDIR%"
)

echo Desinstalado.
pause
endlocal
