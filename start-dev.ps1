#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Starts both frontend and backend development servers for SamplePOS.
#>

$ErrorActionPreference = "Stop"

Write-Host "Starting SamplePOS Development Environment..." -ForegroundColor Cyan
Write-Host ""

$backendPath = Join-Path $PSScriptRoot "SamplePOS.Server"
$frontendPath = Join-Path $PSScriptRoot "samplepos.client"

# Check if directories exist
if (-not (Test-Path $backendPath)) {
    Write-Host "❌ Error: SamplePOS.Server/ directory not found!" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $frontendPath)) {
    Write-Host "❌ Error: samplepos.client/ directory not found!" -ForegroundColor Red
    exit 1
}

# Run database schema verification
Write-Host "🔍 Verifying database schema..." -ForegroundColor Cyan
Push-Location $backendPath
& ".\verify-schema.ps1"
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Schema verification failed! Please fix the issues above before starting." -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

Write-Host ""
Write-Host "Starting Backend API Server (Port 3001)..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; Write-Host 'Backend API Server' -ForegroundColor Cyan; npm run dev"

# Wait a moment for backend to start
Start-Sleep -Seconds 2

# Start frontend in a new terminal  
Write-Host "Starting Frontend Dev Server (Port 5173)..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$frontendPath'; Write-Host 'Frontend Dev Server' -ForegroundColor Cyan; npm run dev"

Write-Host ""
Write-Host "Both servers are starting in separate windows!" -ForegroundColor Green
Write-Host ""
Write-Host "Frontend: http://127.0.0.1:5173/" -ForegroundColor Cyan
Write-Host "Backend:  http://localhost:3001/" -ForegroundColor Cyan
Write-Host "Health:   http://localhost:3001/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "Tip: Check the other terminal windows for server logs" -ForegroundColor Gray
Write-Host ""
Write-Host "Press any key to exit this launcher..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
