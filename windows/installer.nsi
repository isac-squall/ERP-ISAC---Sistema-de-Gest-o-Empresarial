Unicode true
Name "ERP ISAC"
Caption "ERP ISAC - Instalacao"
OutFile "ERP-ISAC-Setup.exe"
InstallDir "$LOCALAPPDATA\ERP-ISAC"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails show
BrandingText "ERP ISAC"

!include "MUI2.nsh"
!include "FileFunc.nsh"

!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Instalar ERP ISAC"
!define MUI_WELCOMEPAGE_TEXT "Este assistente instala o sistema de gestao empresarial ERP ISAC neste computador Windows.$\r$\n$\r$\nO Node.js e as dependencias ja vem no instalador. Nao e preciso internet.$\r$\n$\r$\nSe uma versao anterior estiver aberta, ela sera encerrada automaticamente."
!define MUI_FINISHPAGE_RUN "$INSTDIR\Iniciar.vbs"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o ERP ISAC agora"
!define MUI_FINISHPAGE_NOAUTOCLOSE

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"

Section "Instalar"
  DetailPrint "Encerrando versao anterior..."
  nsExec::ExecToLog 'taskkill /F /IM erp-isac.exe'
  Pop $0
  IfFileExists "$INSTDIR\Parar.bat" 0 +3
    nsExec::ExecToLog '"$INSTDIR\Parar.bat"'
    Pop $0
  Sleep 1500

  SetOutPath "$INSTDIR"
  File "Iniciar.vbs"
  File "Iniciar.bat"
  File "Iniciar-oculto.bat"
  File "Parar.bat"
  File "Desinstalar.bat"
  File "LEIA-ME.txt"

  SetOverwrite try
  SetOutPath "$INSTDIR\runtime"
  File /r "runtime/*.*"
  SetOverwrite on

  SetOutPath "$INSTDIR\app"
  File "app/server.js"
  File "app/database.js"
  File "app/package.json"
  File "app/package-lock.json"
  File "app/README.md"
  File /nonfatal "app/erp.db"
  SetOutPath "$INSTDIR\app\public"
  File /r "app/public/*.*"
  SetOutPath "$INSTDIR\app\assistente"
  File /r "app/assistente/*.*"
  SetOutPath "$INSTDIR\app\nfce"
  File /r "app/nfce/*.*"
  SetOutPath "$INSTDIR\app\node_modules"
  File /r "app/node_modules/*.*"

  CreateShortCut "$DESKTOP\ERP ISAC.lnk" "$INSTDIR\Iniciar.vbs"
  CreateDirectory "$SMPROGRAMS\ERP ISAC"
  CreateShortCut "$SMPROGRAMS\ERP ISAC\ERP ISAC.lnk" "$INSTDIR\Iniciar.vbs"
  CreateShortCut "$SMPROGRAMS\ERP ISAC\Desinstalar.lnk" "$INSTDIR\Uninstall.exe"

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ERP-ISAC" "DisplayName" "ERP ISAC"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ERP-ISAC" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ERP-ISAC" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ERP-ISAC" "Publisher" "ERP ISAC"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ERP-ISAC" "DisplayVersion" "1.0.0"
SectionEnd

Section "Uninstall"
  nsExec::ExecToLog 'taskkill /F /IM erp-isac.exe'
  Pop $0
  IfFileExists "$INSTDIR\Parar.bat" 0 +3
    nsExec::ExecToLog '"$INSTDIR\Parar.bat"'
    Pop $0
  Sleep 1000
  Delete "$DESKTOP\ERP ISAC.lnk"
  RMDir /r "$SMPROGRAMS\ERP ISAC"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ERP-ISAC"
  RMDir /r "$INSTDIR"
SectionEnd
