#!/usr/bin/env pwsh
# Phase 6 Production Deployment Validation Script
# File: validate-deployment.ps1

param(
    [string]$Environment = "production",
    [switch]$SkipHealthCheck = $false,
    [int]$TimeoutSeconds = 300
)

# Colors and formatting
$Red = "`e[31m"
$Green = "`e[32m"
$Yellow = "`e[33m"
$Blue = "`e[34m"
$Reset = "`e[0m"

function Write-Status {
    param([string]$Message, [string]$Status = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    switch ($Status) {
        "SUCCESS" { Write-Host "[$timestamp] ${Green}✓ $Message${Reset}" }
        "ERROR"   { Write-Host "[$timestamp] ${Red}✗ $Message${Reset}" }
        "WARNING" { Write-Host "[$timestamp] ${Yellow}⚠ $Message${Reset}" }
        "INFO"    { Write-Host "[$timestamp] ${Blue}ℹ $Message${Reset}" }
        default   { Write-Host "[$timestamp] $Message" }
    }
}

function Test-Port {
    param([string]$Host, [int]$Port, [int]$TimeoutMs = 5000)
    
    try {
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $asyncResult = $tcpClient.BeginConnect($Host, $Port, $null, $null)
        $wait = $asyncResult.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
        
        if ($wait) {
            $tcpClient.EndConnect($asyncResult)
            $tcpClient.Close()
            return $true
        } else {
            $tcpClient.Close()
            return $false
        }
    } catch {
        return $false
    }
}

function Test-HttpEndpoint {
    param([string]$Url, [int]$ExpectedStatus = 200, [int]$TimeoutSeconds = 30)
    
    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSeconds -UseBasicParsing
        return $response.StatusCode -eq $ExpectedStatus
    } catch {
        return $false
    }
}

function Test-ContainerHealth {
    param([string]$ContainerName)
    
    try {
        $container = docker ps --filter "name=$ContainerName" --format "table {{.Names}}\t{{.Status}}" | Select-Object -Skip 1
        return $container -and $container.Contains("Up")
    } catch {
        return $false
    }
}

Write-Host ""
Write-Host "========================================="
Write-Host "SamplePOS Production Deployment Validation"
Write-Host "Environment: $Environment"
Write-Host "========================================="
Write-Host ""

$validationResults = @{
    ContainerHealth = $false
    DatabaseConnectivity = $false
    RedisConnectivity = $false
    BackendHealth = $false
    AccountingHealth = $false
    FrontendAccess = $false
    LoadBalancerHealth = $false
    OverallStatus = $false
}

# 1. Check Docker container status
Write-Status "Checking Docker container health..." "INFO"

$containers = @("samplepos-postgres", "samplepos-redis", "samplepos-backend", "samplepos-accounting", "samplepos-frontend", "samplepos-nginx")
$allContainersHealthy = $true

foreach ($container in $containers) {
    if (Test-ContainerHealth -ContainerName $container) {
        Write-Status "Container $container is running" "SUCCESS"
    } else {
        Write-Status "Container $container is not running or unhealthy" "ERROR"
        $allContainersHealthy = $false
    }
}

$validationResults.ContainerHealth = $allContainersHealthy

# 2. Check port connectivity
Write-Status "Checking port connectivity..." "INFO"

$ports = @(
    @{Name = "PostgreSQL"; Port = 5432; Host = "localhost"},
    @{Name = "Redis"; Port = 6379; Host = "localhost"},
    @{Name = "Backend API"; Port = 3001; Host = "localhost"},
    @{Name = "Accounting API"; Port = 3002; Host = "localhost"},
    @{Name = "Nginx Load Balancer"; Port = 80; Host = "localhost"}
)

$allPortsOpen = $true

foreach ($portCheck in $ports) {
    if (Test-Port -Host $portCheck.Host -Port $portCheck.Port) {
        Write-Status "$($portCheck.Name) port $($portCheck.Port) is accessible" "SUCCESS"
    } else {
        Write-Status "$($portCheck.Name) port $($portCheck.Port) is not accessible" "ERROR"
        $allPortsOpen = $false
    }
}

# 3. Test database connectivity
Write-Status "Testing database connectivity..." "INFO"

try {
    $dbTest = docker exec samplepos-postgres pg_isready -U postgres 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Status "Database is accepting connections" "SUCCESS"
        $validationResults.DatabaseConnectivity = $true
    } else {
        Write-Status "Database connectivity test failed" "ERROR"
    }
} catch {
    Write-Status "Database connectivity test error: $($_.Exception.Message)" "ERROR"
}

# 4. Test Redis connectivity
Write-Status "Testing Redis connectivity..." "INFO"

try {
    $redisTest = docker exec samplepos-redis redis-cli ping 2>$null
    if ($redisTest -eq "PONG") {
        Write-Status "Redis is responding" "SUCCESS"
        $validationResults.RedisConnectivity = $true
    } else {
        Write-Status "Redis connectivity test failed" "ERROR"
    }
} catch {
    Write-Status "Redis connectivity test error: $($_.Exception.Message)" "ERROR"
}

# 5. Test health endpoints (if not skipped)
if (-not $SkipHealthCheck) {
    Write-Status "Testing application health endpoints..." "INFO"
    
    # Backend health check
    if (Test-HttpEndpoint -Url "http://localhost:3001/api/health" -TimeoutSeconds 30) {
        Write-Status "Backend health endpoint is responding" "SUCCESS"
        $validationResults.BackendHealth = $true
    } else {
        Write-Status "Backend health endpoint is not responding" "ERROR"
    }
    
    # Accounting API health check
    if (Test-HttpEndpoint -Url "http://localhost:3002/health" -TimeoutSeconds 30) {
        Write-Status "Accounting API health endpoint is responding" "SUCCESS"
        $validationResults.AccountingHealth = $true
    } else {
        Write-Status "Accounting API health endpoint is not responding" "ERROR"
    }
    
    # Load balancer health check
    if (Test-HttpEndpoint -Url "http://localhost:80/health" -TimeoutSeconds 30) {
        Write-Status "Load balancer health endpoint is responding" "SUCCESS"
        $validationResults.LoadBalancerHealth = $true
    } else {
        Write-Status "Load balancer health endpoint is not responding" "ERROR"
    }
    
    # Frontend accessibility
    if (Test-HttpEndpoint -Url "http://localhost:80" -TimeoutSeconds 30) {
        Write-Status "Frontend is accessible through load balancer" "SUCCESS"
        $validationResults.FrontendAccess = $true
    } else {
        Write-Status "Frontend is not accessible through load balancer" "ERROR"
    }
} else {
    Write-Status "Skipping health endpoint checks" "WARNING"
    $validationResults.BackendHealth = $true
    $validationResults.AccountingHealth = $true
    $validationResults.LoadBalancerHealth = $true
    $validationResults.FrontendAccess = $true
}

# 6. Check system resources
Write-Status "Checking system resources..." "INFO"

try {
    # Check disk space
    $disk = Get-PSDrive C | Select-Object Used, Free
    $diskUsagePercent = [math]::Round(($disk.Used / ($disk.Used + $disk.Free)) * 100, 2)
    
    if ($diskUsagePercent -lt 85) {
        Write-Status "Disk usage is acceptable ($diskUsagePercent%)" "SUCCESS"
    } elseif ($diskUsagePercent -lt 95) {
        Write-Status "Disk usage is high ($diskUsagePercent%)" "WARNING"
    } else {
        Write-Status "Disk usage is critical ($diskUsagePercent%)" "ERROR"
    }
    
    # Check memory usage
    $memory = Get-CimInstance -ClassName Win32_OperatingSystem
    $memoryUsagePercent = [math]::Round((($memory.TotalVisibleMemorySize - $memory.FreePhysicalMemory) / $memory.TotalVisibleMemorySize) * 100, 2)
    
    if ($memoryUsagePercent -lt 80) {
        Write-Status "Memory usage is acceptable ($memoryUsagePercent%)" "SUCCESS"
    } elseif ($memoryUsagePercent -lt 90) {
        Write-Status "Memory usage is high ($memoryUsagePercent%)" "WARNING"
    } else {
        Write-Status "Memory usage is critical ($memoryUsagePercent%)" "ERROR"
    }
} catch {
    Write-Status "System resource check error: $($_.Exception.Message)" "WARNING"
}

# 7. Check Docker logs for errors
Write-Status "Checking recent Docker logs for errors..." "INFO"

$containers = @("samplepos-backend", "samplepos-accounting", "samplepos-nginx")
$hasErrors = $false

foreach ($container in $containers) {
    try {
        $logs = docker logs --tail 50 $container 2>&1 | Select-String -Pattern "(ERROR|FATAL|Exception)" -SimpleMatch
        if ($logs.Count -gt 0) {
            Write-Status "Found $($logs.Count) error(s) in $container logs" "WARNING"
            $hasErrors = $true
        } else {
            Write-Status "No recent errors found in $container logs" "SUCCESS"
        }
    } catch {
        Write-Status "Could not check logs for $container" "WARNING"
    }
}

if (-not $hasErrors) {
    Write-Status "No critical errors found in recent container logs" "SUCCESS"
}

# Calculate overall status
$totalChecks = $validationResults.Keys.Count - 1  # Exclude OverallStatus
$successfulChecks = ($validationResults.Values | Where-Object { $_ -eq $true }).Count

$validationResults.OverallStatus = $successfulChecks -eq $totalChecks

# Summary
Write-Host ""
Write-Host "========================================="
Write-Host "Validation Summary"
Write-Host "========================================="

foreach ($key in $validationResults.Keys) {
    if ($key -ne "OverallStatus") {
        $status = if ($validationResults[$key]) { "${Green}PASS${Reset}" } else { "${Red}FAIL${Reset}" }
        Write-Host "$key`: $status"
    }
}

Write-Host ""
Write-Host "Overall Status: $(if ($validationResults.OverallStatus) { "${Green}HEALTHY${Reset}" } else { "${Red}UNHEALTHY${Reset}" })"
Write-Host "Successful Checks: $successfulChecks/$totalChecks"

if (-not $validationResults.OverallStatus) {
    Write-Host ""
    Write-Status "Deployment validation failed. Please check the failed components above." "ERROR"
    Write-Host ""
    Write-Host "Common troubleshooting steps:"
    Write-Host "1. Check Docker container logs: docker logs <container-name>"
    Write-Host "2. Verify environment variables in .env files"
    Write-Host "3. Ensure database is properly initialized"
    Write-Host "4. Check network connectivity between services"
    Write-Host "5. Verify sufficient system resources (disk, memory)"
    exit 1
} else {
    Write-Status "Deployment validation completed successfully!" "SUCCESS"
    Write-Host ""
    Write-Host "Your SamplePOS system is ready for production use."
    Write-Host "Access the application at: http://localhost"
    exit 0
}