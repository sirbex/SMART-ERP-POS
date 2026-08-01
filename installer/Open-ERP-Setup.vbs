' Opens first-run ERP connection wizard (Service Helper).
Set sh = CreateObject("WScript.Shell")
WScript.Sleep 1500
sh.Run "http://127.0.0.1:1812/erp-setup/", 1, False
