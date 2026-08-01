' Opens the Printer Setup Wizard in the default browser (no PowerShell).
Set sh = CreateObject("WScript.Shell")
' Give the service a moment if Setup just started it
WScript.Sleep 1500
sh.Run "http://127.0.0.1:1811/setup", 1, False
