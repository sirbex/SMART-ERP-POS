Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
svc = root & "\Print Service\SMART Print Service.exe"
helper = root & "\Service Helper\SMART Service Helper.exe"
If fso.FileExists(helper) Then
  sh.Run """" & helper & """ start", 0, False
End If
If fso.FileExists(svc) Then
  sh.Run """" & svc & """ start", 0, False
End If
