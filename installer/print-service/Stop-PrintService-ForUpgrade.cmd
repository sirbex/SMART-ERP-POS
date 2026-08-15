@echo off
REM Stop SMART Print Service so Setup can replace locked files (avoids Windows error code 5).
setlocal
sc.exe stop SMART-Print-Service >nul 2>&1
timeout /t 2 /nobreak >nul

if exist "%~dp0SMART Print Service.exe" (
  "%~dp0SMART Print Service.exe" stop >nul 2>&1
  timeout /t 2 /nobreak >nul
)

REM Kill WinSW wrapper if still running
taskkill /F /IM "SMART Print Service.exe" >nul 2>&1

REM Kill only node.exe whose path is under Print Service install dirs
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command ^
  "$roots=@($env:ProgramFiles+'\SMART-ERP-POS\Print Service',${env:ProgramFiles(x86)}+'\SMART-ERP-POS\Print Service');" ^
  "Get-CimInstance Win32_Process -EA SilentlyContinue | Where-Object { $_.Name -eq 'node.exe' -and $_.ExecutablePath } |" ^
  "ForEach-Object { foreach($r in $roots){ if($r -and $_.ExecutablePath.StartsWith($r,[StringComparison]::OrdinalIgnoreCase)){ Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue } } }"

timeout /t 1 /nobreak >nul
exit /b 0
