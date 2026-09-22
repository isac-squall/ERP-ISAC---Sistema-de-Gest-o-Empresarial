Option Explicit
Dim sh, fso, root, node, appDir, logFile, ok, i
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
appDir = root & "\app"
logFile = root & "\erp-isac.log"
If fso.FileExists(root & "\runtime\erp-isac.exe") Then
  node = root & "\runtime\erp-isac.exe"
Else
  node = root & "\runtime\node.exe"
End If

If Not fso.FileExists(node) Then
  MsgBox "Node nao encontrado. Execute ERP-ISAC-Setup.exe de novo.", 16, "ERP ISAC"
  WScript.Quit 1
End If
If Not fso.FileExists(appDir & "\server.js") Then
  MsgBox "Arquivos do sistema nao encontrados. Execute ERP-ISAC-Setup.exe de novo.", 16, "ERP ISAC"
  WScript.Quit 1
End If

ok = PortaOk()
If Not ok Then
  sh.Run """" & root & "\Iniciar-oculto.bat""", 0, False
  For i = 1 To 50
    WScript.Sleep 400
    If PortaOk() Then
      ok = True
      Exit For
    End If
  Next
End If

If Not ok Then
  Dim txt
  txt = "Nao foi possivel iniciar o ERP ISAC." & vbCrLf & vbCrLf
  If fso.FileExists(logFile) Then txt = txt & LerLog(logFile) Else txt = txt & "Feche o ERP ISAC se estiver aberto e instale de novo."
  MsgBox txt, 16, "ERP ISAC"
  WScript.Quit 1
End If

sh.Run "http://localhost:3000", 1, False

Function PortaOk()
  On Error Resume Next
  Dim xhr
  Set xhr = CreateObject("MSXML2.XMLHTTP")
  xhr.Open "GET", "http://127.0.0.1:3000/", False
  xhr.setTimeouts 2000, 2000, 2000, 2000
  xhr.Send
  PortaOk = (Err.Number = 0 And xhr.Status >= 200 And xhr.Status < 500)
  Err.Clear
  On Error GoTo 0
End Function

Function LerLog(path)
  On Error Resume Next
  Dim ts, s
  Set ts = fso.OpenTextFile(path, 1)
  s = ts.ReadAll
  ts.Close
  If Len(s) > 800 Then s = Right(s, 800)
  If Len(s) = 0 Then s = "Log vazio."
  LerLog = s
  Err.Clear
  On Error GoTo 0
End Function
