# SamplePOS Development Servers Startup Script
# This script starts both the backend API server and the frontend Vite server

Write-Host "🚀 Starting SamplePOS Development Environment..." -ForegroundColor Green
Write-Host ""

# Kill any existing Node processes to start fresh
Write-Host "🧹 Cleaning up existing processes..." -ForegroundColor Yellow
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Start backend server in a new window
Write-Host "🔧 Starting Backend API Server..." -ForegroundColor Cyan
$backendPath = "C:\Users\Chase\source\repos\SamplePOS\samplepos.client\server\src"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; Write-Host '🔧 Backend Server Starting...' -ForegroundColor Green; node index.js" -WindowStyle Normal

# Wait for backend to start
Write-Host "⏳ Waiting for backend server to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Test backend connectivity
$backendReady = $false
$attempts = 0
while (-not $backendReady -and $attempts -lt 10) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001/api/health" -UseBasicParsing -TimeoutSec 3
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ Backend server is ready!" -ForegroundColor Green
            $backendReady = $true
        }
    } catch {
        $attempts++
        Write-Host "⏳ Backend not ready yet... attempt $attempts/10" -ForegroundColor Yellow
        Start-Sleep -Seconds 2
    }
}

if (-not $backendReady) {
    Write-Host "❌ Backend server failed to start properly" -ForegroundColor Red
    exit 1
}

# Start frontend server in current window
Write-Host "🎨 Starting Frontend Development Server..." -ForegroundColor Cyan
$frontendPath = "C:\Users\Chase\source\repos\SamplePOS\samplepos.client"
Set-Location $frontendPath
npm run dev