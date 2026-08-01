# Start SMART Print Agent on port 1811 (same PC as the browser/PWA)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js is required. Install Node 20+ from https://nodejs.org' -ForegroundColor Red
  exit 1
}

if (-not (Test-Path .\node_modules)) {
  Write-Host 'Installing agent dependencies...'
  npm install
}

Write-Host 'Starting SMART Print Agent on http://127.0.0.1:1811 ...' -ForegroundColor Green
Write-Host 'Keep this window open while using Restaurant POS.'
npm start
