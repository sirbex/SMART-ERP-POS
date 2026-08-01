' Prefer SMART ERP.exe (Phase 4 app window). Fall back to Connection Setup / browser.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
exe = root & "\SMART ERP.exe"
If fso.FileExists(exe) Then
  sh.CurrentDirectory = root
  sh.Run """" & exe & """", 1, False
  WScript.Quit 0
End If

cfg = root & "\config\erp-url.txt"
url = ""
If fso.FileExists(cfg) Then
  Set tf = fso.OpenTextFile(cfg, 1)
  If Not tf.AtEndOfStream Then url = Trim(tf.ReadLine())
  tf.Close
End If
If Len(url) = 0 Then
  url = "http://127.0.0.1:1812/erp-setup/"
End If
sh.Run url, 1, False
