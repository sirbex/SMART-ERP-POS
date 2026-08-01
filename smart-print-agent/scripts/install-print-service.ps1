# Install SMART Print Service for cashiers — no terminal ever again.
# Registers: Start Menu shortcut, Startup login item, Scheduled Task (restart on failure).
$ErrorActionPreference = 'Stop'

$agentRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$scripts = $PSScriptRoot
$watchdog = Join-Path $scripts 'run-watchdog.ps1'
$taskName = 'SMART-ERP-POS Print Service'
$startMenu = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\SMART-ERP-POS'
$startup = [Environment]::GetFolderPath('Startup')
$desktop = [Environment]::GetFolderPath('Desktop')

Write-Host '=== SMART Print Service installer ===' -ForegroundColor Cyan
Write-Host "Agent folder: $agentRoot"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js 20+ is required. Install from https://nodejs.org then re-run this installer.' -ForegroundColor Red
  exit 1
}

Push-Location $agentRoot
try {
  if (-not (Test-Path .\node_modules)) {
    Write-Host 'Installing dependencies...'
    npm install
  }
} finally {
  Pop-Location
}

New-Item -ItemType Directory -Force -Path $startMenu | Out-Null

function New-AgentShortcut([string]$Path, [string]$TargetPs1, [int]$WindowStyle = 7) {
  $ws = New-Object -ComObject WScript.Shell
  $sc = $ws.CreateShortcut($Path)
  $sc.TargetPath = 'powershell.exe'
  $sc.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$TargetPs1`""
  $sc.WorkingDirectory = "$agentRoot"
  $sc.WindowStyle = $WindowStyle
  $sc.Description = 'SMART-ERP-POS Printer Service (localhost:1811)'
  $sc.Save()
}

$startMenuLnk = Join-Path $startMenu 'SMART Print Service.lnk'
$startupLnk = Join-Path $startup 'SMART Print Service.lnk'
New-AgentShortcut $startMenuLnk $watchdog
New-AgentShortcut $startupLnk $watchdog

$addDesktop = $env:SMART_PRINT_DESKTOP_SHORTCUT -eq '1'
if ($addDesktop) {
  New-AgentShortcut (Join-Path $desktop 'SMART Print Service.lnk') $watchdog
  Write-Host "Desktop shortcut created."
}

# Scheduled Task — runs at logon and restarts if the process tree dies.
$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watchdog`"" `
  -WorkingDirectory $agentRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null

Write-Host ''
Write-Host 'Installed successfully.' -ForegroundColor Green
Write-Host "  Start Menu: $startMenuLnk"
Write-Host "  Login auto-start: $startupLnk"
Write-Host "  Scheduled Task: $taskName"
Write-Host ''
Write-Host 'Starting Print Service now...'
Start-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watchdog`"" -WindowStyle Hidden

Start-Sleep -Seconds 2
try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:1811/health' -TimeoutSec 3
  Write-Host "Printer Service Online - v$($health.version), printers=$($health.printers)" -ForegroundColor Green
} catch {
  Write-Host 'Service is starting - check Restaurant -> Printer Diagnostics in a few seconds.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Cashiers never need a terminal. The PWA shows Printer Service Online/Offline.'
Write-Host 'Managers: Restaurant -> Printer Diagnostics for Test Print / Restart.'
