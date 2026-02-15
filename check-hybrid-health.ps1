#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Health checker for SamplePOS Hybrid System services
    
.DESCRIPTION
    Checks the health status of all services in the hybrid architecture:
    - Node.js Backend API (port 3001)
    - C# Accounting API (port 5062)
    - Frontend Dev Server (port 5173)
    
.PARAMETER Detailed
    Show detailed health information
#>

param(
    [switch]$Detailed
)

$ErrorActionPreference = "SilentlyContinue"

# Service definitions
$services = @(
    @{
        Name = "Node.js Backend API"
        Port = 3001
        HealthUrl = "http://localhost:3001/health"
        ServiceType = "API"
    },
    @{
        Name = "C# Accounting API" 
        Port = 5062
        HealthUrl = "http://localhost:5062/health"
        ServiceType = "API"
    },
    @{
        Name = "Frontend Dev Server"
        Port = 5173
        HealthUrl = "http://localhost:5173"
        ServiceType = "Web"
    }
)

Write-Host "`n🏥 SamplePOS Hybrid System Health Check" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════`n" -ForegroundColor Cyan

$allHealthy = $true

foreach ($service in $services) {
    $status = "❌ Unhealthy"
    $statusColor = "Red"
    $details = ""
    
    try {
        # Check if port is listening
        $tcpConnection = Test-NetConnection -ComputerName "localhost" -Port $service.Port -WarningAction SilentlyContinue
        
        if ($tcpConnection.TcpTestSucceeded) {
            try {
                # Try to get health response
                $response = Invoke-RestMethod -Uri $service.HealthUrl -TimeoutSec 5
                $status = "✅ Healthy"
                $statusColor = "Green"
                
                if ($Detailed -and $response) {
                    $details = " | Response: $($response | ConvertTo-Json -Compress)"
                }
            }
            catch {
                # Port is open but service not responding properly
                $status = "⚠️  Port Open, Service Issues"
                $statusColor = "Yellow"
                
                if ($Detailed) {
                    $details = " | Error: $($_.Exception.Message)"
                }
            }
        }
        else {
            $allHealthy = $false
            if ($Detailed) {
                $details = " | Port not listening"
            }
        }
    }
    catch {
        $allHealthy = $false
        if ($Detailed) {
            $details = " | Connection error: $($_.Exception.Message)"
        }
    }
    
    if ($status -notlike "*Healthy*") {
        $allHealthy = $false
    }
    
    Write-Host "$($service.Name.PadRight(25)) [Port $($service.Port)] $status$details" -ForegroundColor $statusColor
}

Write-Host ""

if ($allHealthy) {
    Write-Host "🎉 All services are healthy!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "⚠️  Some services have issues. Run with -Detailed for more information." -ForegroundColor Yellow
    exit 1
}