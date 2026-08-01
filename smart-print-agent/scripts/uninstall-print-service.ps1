# Uninstall auto-start / scheduled task for SMART Print Service.
$ErrorActionPreference = 'Continue'
$taskName = 'SMART-ERP-POS Print Service'
$startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'SMART Print Service.lnk'
$startMenu = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\SMART-ERP-POS\SMART Print Service.lnk'
$desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'SMART Print Service.lnk'

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item $startup -Force -ErrorAction SilentlyContinue
Remove-Item $startMenu -Force -ErrorAction SilentlyContinue
Remove-Item $desktop -Force -ErrorAction SilentlyContinue

try {
  Invoke-RestMethod -Method POST -Uri 'http://127.0.0.1:1811/shutdown' -TimeoutSec 2 | Out-Null
} catch {}

Write-Host 'SMART Print Service auto-start removed. (Process stopped if it was running.)' -ForegroundColor Green
