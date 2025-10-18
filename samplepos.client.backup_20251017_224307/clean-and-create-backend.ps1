#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Clean old backend and create fresh POS backend

.DESCRIPTION
    1. Removes old backend directory
    2. Creates new pos-backend structure
    3. Initializes with all necessary files
#>

$ErrorActionPreference = "Stop"

Write-Host "🗑️  Cleaning Old Backend Files..." -ForegroundColor Yellow
Write-Host ""

$projectRoot = "C:\Users\Chase\source\repos\SamplePOS"
$oldBackend = Join-Path $projectRoot "backend"
$newBackend = Join-Path $projectRoot "pos-backend"

# Remove old backend if exists
if (Test-Path $oldBackend) {
    Write-Host "Removing old backend directory..." -ForegroundColor Red
    Remove-Item -Path $oldBackend -Recurse -Force
    Write-Host "✅ Old backend removed" -ForegroundColor Green
}

# Remove new backend if exists (clean slate)
if (Test-Path $newBackend) {
    Write-Host "Removing existing pos-backend..." -ForegroundColor Red
    Remove-Item -Path $newBackend -Recurse -Force
}

Write-Host ""
Write-Host "📁 Creating Fresh Backend Structure..." -ForegroundColor Cyan
Write-Host ""

# Create new backend directory
New-Item -ItemType Directory -Path $newBackend -Force | Out-Null

# Create directory structure
$dirs = @(
    "src",
    "src/config",
    "src/middleware",
    "src/utils",
    "src/types",
    "src/modules",
    "src/modules/auth",
    "src/modules/users",
    "src/modules/products",
    "src/modules/inventory",
    "src/modules/purchases",
    "src/modules/sales",
    "src/modules/customers",
    "src/modules/suppliers",
    "src/modules/documents",
    "src/modules/reports",
    "src/modules/settings",
    "prisma",
    "prisma/migrations"
)

foreach ($dir in $dirs) {
    $fullPath = Join-Path $newBackend $dir
    New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
    Write-Host "  ✓ Created $dir" -ForegroundColor Gray
}

Write-Host ""
Write-Host "✅ Backend structure created at: $newBackend" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next: Run the backend initialization script" -ForegroundColor Yellow
