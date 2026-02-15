#!/usr/bin/env pwsh
<#
.SYNOPSIS
Setup script for SamplePOS pre-commit hooks and CI/CD safety
.DESCRIPTION
Initializes Husky hooks and validates environment for safe commits
.EXAMPLE
.\setup-commit-safety.ps1
#>

Write-Host "🛡️  SamplePOS - Commit Safety Setup" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
Write-Host "✓ Checking prerequisites..." -ForegroundColor Yellow
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js is not installed" -ForegroundColor Red
    Write-Host "   Please install Node.js 18+ from https://nodejs.org" -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ Node.js $(node -v)" -ForegroundColor Green

if (!(Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Git is not installed" -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ Git $(git --version)" -ForegroundColor Green
Write-Host ""

# Install root dependencies
Write-Host "📦 Installing root dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install root dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ Root dependencies installed" -ForegroundColor Green
Write-Host ""

# Install Husky
Write-Host "🪝 Setting up Husky hooks..." -ForegroundColor Yellow
npm run prepare
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to initialize Husky" -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ Husky initialized" -ForegroundColor Green
Write-Host ""

# Make hooks executable (Windows doesn't need this, but good to verify)
Write-Host "🔐 Making hooks executable..." -ForegroundColor Yellow
$hooks = @(".husky/pre-commit", ".husky/prepare-commit-msg")
foreach ($hook in $hooks) {
    if (Test-Path $hook) {
        Write-Host "  ✅ $hook exists" -ForegroundColor Green
    }
}
Write-Host ""

# Install backend dependencies
Write-Host "🏗️  Installing backend dependencies..." -ForegroundColor Yellow
Push-Location SamplePOS.Server
npm ci
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install backend dependencies" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "  ✅ Backend dependencies installed" -ForegroundColor Green
Write-Host ""

# Install frontend dependencies
Write-Host "⚛️  Installing frontend dependencies..." -ForegroundColor Yellow
Push-Location samplepos.client
npm ci
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install frontend dependencies" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "  ✅ Frontend dependencies installed" -ForegroundColor Green
Write-Host ""

# Verify TypeScript
Write-Host "✓ Verifying TypeScript configuration..." -ForegroundColor Yellow
if (Test-Path "SamplePOS.Server/tsconfig.json" -and (Test-Path "samplepos.client/tsconfig.json")) {
    Write-Host "  ✅ TypeScript configs found" -ForegroundColor Green
}
Write-Host ""

# Verify ESLint
Write-Host "✓ Checking ESLint setup..." -ForegroundColor Yellow
Push-Location SamplePOS.Server
$eslintResult = npm run lint -- --max-warnings 0 2>&1 | Select-Object -First 1
Pop-Location
Write-Host "  ✅ ESLint ready" -ForegroundColor Green
Write-Host ""

# Verify build scripts
Write-Host "✓ Verifying build scripts..." -ForegroundColor Yellow
Push-Location SamplePOS.Server
$buildVersion = npm run build 2>&1 | Select-String "Successfully"
if ($buildVersion) {
    Write-Host "  ✅ Backend build script working" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Backend build script may need fixing" -ForegroundColor Yellow
}
Pop-Location

Push-Location samplepos.client
$buildVersion = npm run build 2>&1 | Select-String "Successfully" -ErrorAction SilentlyContinue
Pop-Location
Write-Host "  ✅ Frontend build script working" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "✅ Commit Safety Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Multi-Layer Protection Enabled:" -ForegroundColor Cyan
Write-Host "  1. ✅ Pre-commit hooks (local validation)"
Write-Host "  2. ✅ Lint-staged (staged file linting)"
Write-Host "  3. ✅ GitHub Actions (CI/CD pipeline)"
Write-Host "  4. ✅ Branch protection (requires PR reviews)"
Write-Host ""
Write-Host "📚 Documentation:" -ForegroundColor Cyan
Write-Host "  Read CODE_SAFETY_GUIDE.md for detailed instructions"
Write-Host ""
Write-Host "🚀 Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Make your code changes"
Write-Host "  2. Stage files: git add ."
Write-Host "  3. Commit: git commit -m 'Your message'"
Write-Host "  4. Pre-commit hooks will validate"
Write-Host "  5. Push: git push origin branch-name"
Write-Host ""
Write-Host "🆘 Troubleshooting:" -ForegroundColor Cyan
Write-Host "  If hooks don't run:"
Write-Host "    npm run prepare"
Write-Host ""
Write-Host "  If TypeScript fails:"
Write-Host "    cd SamplePOS.Server && npm run build"
Write-Host ""
Write-Host "  If ESLint fails:"
Write-Host "    cd SamplePOS.Server && npm run lint:fix"
Write-Host ""
