#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Moves the nested server/ directory out to be a sibling of samplepos.client/

.DESCRIPTION
    Current structure:
    SamplePOS/
    ├── samplepos.client/
    │   ├── src/
    │   └── server/          ← THIS IS WRONG
    └── SamplePOS.Server/

    After running this script:
    SamplePOS/
    ├── samplepos.client/
    │   └── src/
    ├── backend/              ← MOVED HERE
    └── SamplePOS.Server/
#>

$ErrorActionPreference = "Stop"

$currentDir = $PSScriptRoot
$parentDir = Split-Path -Parent $currentDir
$serverDir = Join-Path $currentDir "server"
$backendDir = Join-Path $parentDir "backend"

Write-Host "🚀 Moving nested server directory..." -ForegroundColor Cyan
Write-Host ""
Write-Host "From: $serverDir" -ForegroundColor Yellow
Write-Host "To:   $backendDir" -ForegroundColor Green
Write-Host ""

# Check if server directory exists
if (-not (Test-Path $serverDir)) {
    Write-Host "❌ Error: server/ directory not found in $currentDir" -ForegroundColor Red
    exit 1
}

# Check if backend directory already exists
if (Test-Path $backendDir) {
    Write-Host "⚠️  Warning: $backendDir already exists!" -ForegroundColor Yellow
    $overwrite = Read-Host "Do you want to overwrite it? (yes/no)"
    if ($overwrite -ne "yes") {
        Write-Host "❌ Operation cancelled." -ForegroundColor Red
        exit 1
    }
    Remove-Item -Path $backendDir -Recurse -Force
}

# Move the server directory
Write-Host "📦 Moving server/ → backend/..." -ForegroundColor Cyan
Move-Item -Path $serverDir -Destination $backendDir -Force

Write-Host "✅ Server moved successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "  1. The backend is now at: $backendDir" -ForegroundColor White
Write-Host "  2. No configuration changes needed (still runs on port 3001)" -ForegroundColor White
Write-Host "  3. To start backend: cd ..\backend; npm start" -ForegroundColor White
Write-Host "  4. To start frontend: npm run dev" -ForegroundColor White
Write-Host ""
