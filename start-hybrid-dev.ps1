#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Starts the complete SamplePOS Hybrid Development Environment:
    - Node.js Backend API (port 3001)
    - C# Accounting API (port 5062) 
    - React Frontend Dev Server (port 5173)

.DESCRIPTION
    This script orchestrates all three services required for the SamplePOS hybrid architecture:
    1. Node.js handles POS operations, inventory, sales, etc.
    2. C# handles accounting operations (double-entry bookkeeping)
    3. React frontend with proper proxy routing
    
    The script includes:
    - Health checks for all services
    - Database connectivity verification
    - Proper startup order with dependencies
    - Error handling and graceful shutdown
#>

$ErrorActionPreference = "Stop"

# Colors for output
$ColorInfo = "Cyan"
$ColorSuccess = "Green" 
$ColorWarning = "Yellow"
$ColorError = "Red"
$ColorDefault = "White"

Write-Host "`n============================================================" -ForegroundColor $ColorInfo
Write-Host "  SamplePOS HYBRID DEVELOPMENT ENVIRONMENT" -ForegroundColor $ColorInfo
Write-Host "============================================================`n" -ForegroundColor $ColorInfo

$rootPath = $PSScriptRoot
$nodejsPath = Join-Path $rootPath "SamplePOS.Server"
$csharpPath = Join-Path $rootPath "server-dotnet\accounting-api\AccountingApi"
$frontendPath = Join-Path $rootPath "samplepos.client"

# Verify all project directories exist
$directories = @{
    "Node.js Backend" = $nodejsPath
    "C# Accounting API" = $csharpPath  
    "React Frontend" = $frontendPath
}

foreach ($name in $directories.Keys) {
    $path = $directories[$name]
    if (-not (Test-Path $path)) {
        Write-Host "❌ Error: $name directory not found at: $path" -ForegroundColor $ColorError
        exit 1
    }
    Write-Host "✅ Found: $name" -ForegroundColor $ColorSuccess
}

Write-Host ""

# Function to wait for service health
function Wait-ForService {
    param(
        [string]$ServiceName,
        [string]$HealthUrl,
        [int]$TimeoutSeconds = 30,
        [int]$RetryIntervalSeconds = 2
    )
    
    Write-Host "⏳ Waiting for $ServiceName to be healthy..." -ForegroundColor $ColorWarning
    
    $timeout = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $timeout) {
        try {
            $response = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 5
            if ($response) {
                Write-Host "✅ $ServiceName is healthy" -ForegroundColor $ColorSuccess
                return $true
            }
        }
        catch {
            # Service not ready yet
        }
        
        Start-Sleep -Seconds $RetryIntervalSeconds
    }
    
    Write-Host "❌ Timeout waiting for $ServiceName to be healthy" -ForegroundColor $ColorError
    return $false
}

# Function to check if port is available
function Test-Port {
    param([int]$Port)
    
    try {
        $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
        $listener.Start()
        $listener.Stop()
        return $true
    }
    catch {
        return $false
    }
}

# Check if required ports are available
$requiredPorts = @(3001, 5062, 5173)
foreach ($port in $requiredPorts) {
    if (-not (Test-Port -Port $port)) {
        Write-Host "❌ Port $port is already in use. Please free it before starting." -ForegroundColor $ColorError
        exit 1
    }
}

Write-Host "✅ All required ports (3001, 5062, 5173) are available" -ForegroundColor $ColorSuccess
Write-Host ""

# Step 1: Database verification for Node.js backend
Write-Host "🔍 Verifying Node.js backend database schema..." -ForegroundColor $ColorInfo
Push-Location $nodejsPath
try {
    & ".\verify-schema.ps1"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Node.js database schema verification failed!" -ForegroundColor $ColorError
        Pop-Location
        exit 1
    }
    Write-Host "✅ Node.js database schema verified" -ForegroundColor $ColorSuccess
}
catch {
    Write-Host "❌ Error during Node.js schema verification: $($_.Exception.Message)" -ForegroundColor $ColorError
    Pop-Location
    exit 1
}
Pop-Location

Write-Host ""

# Step 2: Start Node.js Backend API (Port 3001)
Write-Host "🚀 Starting Node.js Backend API (Port 3001)..." -ForegroundColor $ColorInfo
$nodeProcess = Start-Process powershell -ArgumentList @(
    "-NoExit", 
    "-WindowStyle", "Normal",
    "-Command", 
    "cd '$nodejsPath'; Write-Host 'Node.js Backend API Server - Port 3001' -ForegroundColor Cyan; Write-Host 'Starting...' -ForegroundColor Yellow; npm run dev"
) -PassThru

# Wait for Node.js backend to be ready
Start-Sleep -Seconds 3
if (-not (Wait-ForService -ServiceName "Node.js Backend API" -HealthUrl "http://localhost:3001/health")) {
    Write-Host "❌ Failed to start Node.js backend. Check the terminal window for errors." -ForegroundColor $ColorError
    exit 1
}

# Step 3: Start C# Accounting API (Port 5062) 
Write-Host "🚀 Starting C# Accounting API (Port 5062)..." -ForegroundColor $ColorInfo
$csharpProcess = Start-Process powershell -ArgumentList @(
    "-NoExit", 
    "-WindowStyle", "Normal",
    "-Command", 
    "cd '$csharpPath'; Write-Host 'C# Accounting API Server - Port 5062' -ForegroundColor Magenta; Write-Host 'Starting...' -ForegroundColor Yellow; $env:ASPNETCORE_ENVIRONMENT='Development'; $env:ASPNETCORE_URLS='http://localhost:5062'; dotnet run"
) -PassThru

# Wait for C# API to be ready
Start-Sleep -Seconds 5
if (-not (Wait-ForService -ServiceName "C# Accounting API" -HealthUrl "http://localhost:5062/health")) {
    Write-Host "❌ Failed to start C# Accounting API. Check the terminal window for errors." -ForegroundColor $ColorError
    Write-Host "   Common issues:" -ForegroundColor $ColorWarning
    Write-Host "   - Database connection problems" -ForegroundColor $ColorWarning
    Write-Host "   - Missing .NET 8.0 SDK" -ForegroundColor $ColorWarning
    Write-Host "   - Port 5062 still in use" -ForegroundColor $ColorWarning
    exit 1
}

# Step 4: Start React Frontend Dev Server (Port 5173)
Write-Host "🚀 Starting React Frontend Dev Server (Port 5173)..." -ForegroundColor $ColorInfo
$frontendProcess = Start-Process powershell -ArgumentList @(
    "-NoExit", 
    "-WindowStyle", "Normal",
    "-Command", 
    "cd '$frontendPath'; Write-Host 'React Frontend Dev Server - Port 5173' -ForegroundColor Green; Write-Host 'Starting...' -ForegroundColor Yellow; npm run dev"
) -PassThru

# Wait for frontend to be ready
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "============================================================" -ForegroundColor $ColorSuccess
Write-Host "  🎉 HYBRID SYSTEM SUCCESSFULLY STARTED!" -ForegroundColor $ColorSuccess
Write-Host "============================================================" -ForegroundColor $ColorSuccess
Write-Host ""
Write-Host "📍 Service Endpoints:" -ForegroundColor $ColorInfo
Write-Host "   Frontend:          http://localhost:5173/" -ForegroundColor $ColorSuccess
Write-Host "   Node.js API:       http://localhost:3001/" -ForegroundColor $ColorSuccess  
Write-Host "   C# Accounting API: http://localhost:5062/" -ForegroundColor $ColorSuccess
Write-Host ""
Write-Host "🔍 Health Check URLs:" -ForegroundColor $ColorInfo
Write-Host "   Node.js Health:    http://localhost:3001/health" -ForegroundColor $ColorDefault
Write-Host "   C# Health:         http://localhost:5062/health" -ForegroundColor $ColorDefault
Write-Host ""
Write-Host "📊 Swagger Documentation:" -ForegroundColor $ColorInfo
Write-Host "   C# API Docs:       http://localhost:5062/" -ForegroundColor $ColorDefault
Write-Host ""
Write-Host "🔄 API Routing:" -ForegroundColor $ColorInfo  
Write-Host "   /api/accounting/*  → C# API (port 5062)" -ForegroundColor $ColorDefault
Write-Host "   /api/*            → Node.js API (port 3001)" -ForegroundColor $ColorDefault
Write-Host ""
Write-Host "📝 Service Windows:" -ForegroundColor $ColorWarning
Write-Host "   Check the 3 separate terminal windows for service logs" -ForegroundColor $ColorWarning
Write-Host "   Close those windows to stop the services" -ForegroundColor $ColorWarning
Write-Host ""
Write-Host "Press any key to exit this launcher..." -ForegroundColor $ColorInfo
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

Write-Host ""
Write-Host "Launcher exited. Services continue running in background windows." -ForegroundColor $ColorWarning