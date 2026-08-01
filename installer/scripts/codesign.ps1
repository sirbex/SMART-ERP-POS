# Optional Authenticode signing for commercial releases.
# Requires a code-signing certificate (.pfx) and password.
#
# Usage:
#   $env:SMART_CODESIGN_PFX = 'C:\certs\smart-erp.pfx'
#   $env:SMART_CODESIGN_PASSWORD = '***'
#   powershell -File installer/scripts/codesign.ps1 -Path installer\dist\SMART-ERP-POS-Setup.exe
#
# CI: set secrets CODESIGN_PFX_BASE64 + CODESIGN_PASSWORD; workflow decodes PFX then calls this script.
param(
  [Parameter(Mandatory = $true)][string]$Path,
  [string]$PfxPath = $env:SMART_CODESIGN_PFX,
  [string]$Password = $env:SMART_CODESIGN_PASSWORD,
  [string]$TimestampUrl = 'http://timestamp.digicert.com'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Path)) { throw "File not found: $Path" }

if (-not $PfxPath -or -not (Test-Path $PfxPath)) {
  Write-Host "No PFX configured — skipping sign for $Path" -ForegroundColor Yellow
  exit 0
}

$signtool = @(
  "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe",
  "${env:ProgramFiles}\Windows Kits\10\bin\*\x64\signtool.exe"
) | Get-Item -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1

if (-not $signtool) {
  Write-Host 'signtool.exe not found (install Windows SDK). Skipping sign.' -ForegroundColor Yellow
  exit 0
}

Write-Host "Signing $Path with $($signtool.FullName)"
& $signtool.FullName sign `
  /fd SHA256 `
  /tr $TimestampUrl `
  /td SHA256 `
  /f $PfxPath `
  /p $Password `
  $Path

if ($LASTEXITCODE -ne 0) { throw "signtool failed with exit $LASTEXITCODE" }
Write-Host 'Signed OK' -ForegroundColor Green
