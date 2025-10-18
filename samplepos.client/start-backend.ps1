# Start Backend Server Script
# Run this in PowerShell: .\start-backend.ps1

Write-Host "`n╔════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Starting SamplePOS Backend Server...     ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Navigate to backend directory
$backendPath = "C:\Users\Chase\source\repos\SamplePOS\SamplePOS.Server"

Write-Host "📁 Navigating to: $backendPath`n" -ForegroundColor Yellow

if (-not (Test-Path $backendPath)) {
    Write-Host "❌ ERROR: Backend directory not found!" -ForegroundColor Red
    Write-Host "   Expected: $backendPath`n" -ForegroundColor Red
    exit 1
}

Set-Location $backendPath

Write-Host "✅ Directory found`n" -ForegroundColor Green

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "⚠️  node_modules not found. Installing dependencies...`n" -ForegroundColor Yellow
    npm install
}

Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Starting server with: npm run dev" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════`n" -ForegroundColor Cyan

Write-Host "⏳ Server starting... (this may take a few seconds)`n" -ForegroundColor Yellow

# Start the server
npm run dev

# If we get here, server stopped
Write-Host "`n❌ Server stopped unexpectedly" -ForegroundColor Red
Write-Host "Press any key to close..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
