# Load .env.proof.production into the current PowerShell session.
# Usage: . .\scripts\load-proof-production-env.ps1

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$EnvFile = Join-Path $Root '.env.proof.production'

if (-not (Test-Path $EnvFile)) {
    Write-Error @"
Missing $EnvFile

Copy the template and configure credentials:
  copy env.proof.production.template .env.proof.production
"@
}

$loaded = 0
Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq '' -or $line.StartsWith('#')) { return }
    $eq = $line.IndexOf('=')
    if ($eq -lt 1) { return }
    $name = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1).Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"')) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    Set-Item -Path "Env:$name" -Value $value
    $loaded++
}

Write-Host "Loaded $loaded variable(s) from .env.proof.production"
Write-Host "  HENBER_DATABASE_URL: $(if ($env:HENBER_DATABASE_URL) { 'set' } else { 'MISSING' })"
Write-Host "  BASE_URL:            $(if ($env:BASE_URL) { $env:BASE_URL } else { 'MISSING' })"
Write-Host "  TEST_EMAIL:          $(if ($env:TEST_EMAIL) { $env:TEST_EMAIL } else { 'MISSING' })"
Write-Host "  TEST_PASSWORD:       $(if ($env:TEST_PASSWORD) { 'set' } else { 'MISSING — required for Step 4 smoke' })"
