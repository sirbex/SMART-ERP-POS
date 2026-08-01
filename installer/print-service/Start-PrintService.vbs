' Hidden launcher — Start Menu / Startup. No PowerShell window.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
svc = root & "\SMART Print Service.exe"
If fso.FileExists(svc) Then
  ' Prefer Windows Service start (already installed by Setup.exe)
  sh.Run """" & svc & """ start", 0, False
Else
  nodeExe = root & "\runtime\node.exe"
  entry = root & "\app\dist\index.js"
  sh.CurrentDirectory = root & "\app"
  sh.Run """" & nodeExe & """ """ & entry & """", 0, False
End If
