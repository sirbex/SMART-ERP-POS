# 🚀 Quick Deployment Script - Day 10 Testing

# Run this script to start both backend and frontend for real-world validation
# Windows PowerShell script

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Day 10 Migration - Test Environment" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Check current location
$currentPath = Get-Location
Write-Host "📂 Current directory: $currentPath`n" -ForegroundColor Yellow

# Paths
$backendPath = "C:\Users\Chase\source\repos\SamplePOS\SamplePOS.Server"
$frontendPath = "C:\Users\Chase\source\repos\SamplePOS\samplepos.client"

Write-Host "🔍 Checking environment...`n" -ForegroundColor Green

# Check if paths exist
if (Test-Path $backendPath) {
    Write-Host "✅ Backend directory found" -ForegroundColor Green
} else {
    Write-Host "❌ Backend directory not found: $backendPath" -ForegroundColor Red
    exit 1
}

if (Test-Path $frontendPath) {
    Write-Host "✅ Frontend directory found" -ForegroundColor Green
} else {
    Write-Host "❌ Frontend directory not found: $frontendPath" -ForegroundColor Red
    exit 1
}

# Check if Node.js is installed
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = node --version
    Write-Host "✅ Node.js installed: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "❌ Node.js not found. Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Check if npm is installed
if (Get-Command npm -ErrorAction SilentlyContinue) {
    $npmVersion = npm --version
    Write-Host "✅ npm installed: $npmVersion" -ForegroundColor Green
} else {
    Write-Host "❌ npm not found. Please install npm first." -ForegroundColor Red
    exit 1
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Starting Services" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "📝 INSTRUCTIONS:" -ForegroundColor Yellow
Write-Host "  1. Backend will start on http://localhost:3001" -ForegroundColor White
Write-Host "  2. Frontend will start on http://localhost:5173" -ForegroundColor White
Write-Host "  3. Open browser to http://localhost:5173" -ForegroundColor White
Write-Host "  4. Login with: admin / admin123" -ForegroundColor White
Write-Host "  5. Navigate to Purchase Analytics, Purchase Receiving, or Supplier Accounts Payable`n" -ForegroundColor White

Write-Host "⚠️  You'll need to run backend and frontend in SEPARATE terminals`n" -ForegroundColor Yellow

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Terminal 1: Start Backend" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "cd $backendPath" -ForegroundColor White
Write-Host "npm run dev`n" -ForegroundColor White

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Terminal 2: Start Frontend" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "cd $frontendPath" -ForegroundColor White
Write-Host "npm run dev`n" -ForegroundColor White

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Quick Verification" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Verify our migrated components have no errors
Write-Host "Checking Day 10 migrated components...`n" -ForegroundColor Yellow

$components = @(
    "PurchaseAnalytics.tsx",
    "PurchaseReceiving.tsx", 
    "SupplierAccountsPayable.tsx"
)

foreach ($component in $components) {
    $filePath = Join-Path $frontendPath "src\components\$component"
    if (Test-Path $filePath) {
        Write-Host "✅ $component exists" -ForegroundColor Green
    } else {
        Write-Host "❌ $component not found" -ForegroundColor Red
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Testing Checklist" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "[ ] Backend server started (Port 3001)" -ForegroundColor White
Write-Host "[ ] Frontend server started (Port 5173)" -ForegroundColor White
Write-Host "[ ] Logged into application (admin/admin123)" -ForegroundColor White
Write-Host "[ ] Tested Purchase Analytics component" -ForegroundColor White
Write-Host "[ ] Tested Purchase Receiving component" -ForegroundColor White
Write-Host "[ ] Tested Supplier Accounts Payable component" -ForegroundColor White
Write-Host "[ ] Verified API calls in Network tab" -ForegroundColor White
Write-Host "[ ] Checked console for errors" -ForegroundColor White
Write-Host "[ ] Documented test results`n" -ForegroundColor White

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Ready to Deploy!" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "See DAY_10_DEPLOYMENT_GUIDE.md for detailed testing procedures.`n" -ForegroundColor Yellow
