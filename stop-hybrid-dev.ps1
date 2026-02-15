#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Stops all SamplePOS Hybrid System services
    
.DESCRIPTION
    Gracefully stops all running services:
    - Node.js Backend API (port 3001)
    - C# Accounting API (port 5062) 
    - Frontend Dev Server (port 5173)
#>

$ErrorActionPreference = "SilentlyContinue"

Write-Host "`n🛑 Stopping SamplePOS Hybrid System Services" -ForegroundColor Red
Write-Host "═══════════════════════════════════════════`n" -ForegroundColor Red

# Define ports to stop
$ports = @(3001, 5062, 5173)
$processesKilled = 0

foreach ($port in $ports) {
    $serviceName = switch ($port) {
        3001 { "Node.js Backend API" }
        5062 { "C# Accounting API" }
        5173 { "Frontend Dev Server" }
    }
    
    Write-Host "Checking port $port ($serviceName)..." -ForegroundColor Yellow
    
    # Find processes using the port
    try {
        $netstatOutput = netstat -ano | Select-String ":$port "
        
        if ($netstatOutput) {
            $pids = @()
            foreach ($line in $netstatOutput) {
                if ($line -match '\s+(\d+)$') {
                    $pid = $matches[1]
                    if ($pid -and $pid -ne "0") {
                        $pids += [int]$pid
                    }
                }
            }
            
            $uniquePids = $pids | Sort-Object | Get-Unique
            
            foreach ($pid in $uniquePids) {
                try {
                    $process = Get-Process -Id $pid -ErrorAction Stop
                    Write-Host "  Stopping process: $($process.ProcessName) (PID: $pid)" -ForegroundColor Cyan
                    Stop-Process -Id $pid -Force
                    $processesKilled++
                    Write-Host "  ✅ Process stopped" -ForegroundColor Green
                }
                catch {
                    Write-Host "  ⚠️  Could not stop process PID $pid" -ForegroundColor Yellow
                }
            }
        }
        else {
            Write-Host "  ✅ Port $port is not in use" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "  ❌ Error checking port $port`: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""

# Also kill any node/dotnet processes that might be related
Write-Host "Checking for remaining Node.js and .NET processes..." -ForegroundColor Yellow

# Kill node processes that might be dev servers
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*npm run dev*" -or 
    $_.CommandLine -like "*vite*" -or 
    $_.CommandLine -like "*tsx watch*"
}

foreach ($proc in $nodeProcesses) {
    Write-Host "  Stopping Node.js process: PID $($proc.Id)" -ForegroundColor Cyan
    Stop-Process -Id $proc.Id -Force
    $processesKilled++
}

# Kill dotnet processes that might be the accounting API
$dotnetProcesses = Get-Process -Name "dotnet" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*AccountingApi*" -or
    $_.CommandLine -like "*dotnet run*"
}

foreach ($proc in $dotnetProcesses) {
    Write-Host "  Stopping .NET process: PID $($proc.Id)" -ForegroundColor Cyan
    Stop-Process -Id $proc.Id -Force
    $processesKilled++
}

Write-Host ""

if ($processesKilled -gt 0) {
    Write-Host "🎯 Stopped $processesKilled processes" -ForegroundColor Green
} else {
    Write-Host "ℹ️  No running services found to stop" -ForegroundColor Blue
}

# Wait a moment and verify ports are free
Write-Host "`nVerifying ports are now free..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

$allClear = $true
foreach ($port in $ports) {
    try {
        $tcpConnection = Test-NetConnection -ComputerName "localhost" -Port $port -WarningAction SilentlyContinue
        if ($tcpConnection.TcpTestSucceeded) {
            Write-Host "  ⚠️  Port $port is still in use" -ForegroundColor Yellow
            $allClear = $false
        } else {
            Write-Host "  ✅ Port $port is free" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "  ✅ Port $port is free" -ForegroundColor Green
    }
}

Write-Host ""

if ($allClear) {
    Write-Host "🎉 All services stopped successfully!" -ForegroundColor Green
} else {
    Write-Host "⚠️  Some services may still be running. You may need to manually close terminal windows." -ForegroundColor Yellow
}

Write-Host ""