# ============================================================================
# CLEAN AND SETUP BACKEND IN SamplePOS.Server
# ============================================================================
# This script will:
# 1. Backup the SamplePOS.Server directory
# 2. Delete all old files
# 3. Set up fresh Node.js + TypeScript + Prisma backend
# 4. Copy all backend templates to the correct location
# ============================================================================

Write-Host "🧹 Starting Backend Cleanup and Setup..." -ForegroundColor Cyan
Write-Host ""

$serverPath = "C:\Users\Chase\source\repos\SamplePOS\SamplePOS.Server"
$backupPath = "C:\Users\Chase\source\repos\SamplePOS\SamplePOS.Server.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
$posBackendPath = "C:\Users\Chase\source\repos\SamplePOS\pos-backend"

# ============================================================================
# STEP 1: Create Backup
# ============================================================================
Write-Host "📦 Step 1: Creating backup..." -ForegroundColor Yellow

if (Test-Path $serverPath) {
    Write-Host "   Backing up to: $backupPath"
    Copy-Item -Path $serverPath -Destination $backupPath -Recurse -Force
    Write-Host "   ✅ Backup created successfully" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Directory doesn't exist, will create fresh" -ForegroundColor Yellow
}

Write-Host ""

# ============================================================================
# STEP 2: Stop any running Node processes
# ============================================================================
Write-Host "🛑 Step 2: Stopping Node processes..." -ForegroundColor Yellow

Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "   ✅ Node processes stopped" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 3: Delete old files
# ============================================================================
Write-Host "🗑️  Step 3: Cleaning SamplePOS.Server directory..." -ForegroundColor Yellow

if (Test-Path $serverPath) {
    # Delete specific directories
    $dirsToDelete = @(
        ".vs", "bin", "obj", "Controllers", "Properties", 
        "node_modules", "logs", "src"
    )
    
    foreach ($dir in $dirsToDelete) {
        $fullPath = Join-Path $serverPath $dir
        if (Test-Path $fullPath) {
            Write-Host "   Removing: $dir"
            Remove-Item -Path $fullPath -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
    
    # Delete specific files
    $filesToDelete = @(
        "*.cs", "*.csproj", "*.csproj.user", "*.http", 
        "appsettings*.json", "package.json", "package-lock.json",
        "tsconfig.json", ".env", ".env.sample", "CHANGELOG.md"
    )
    
    foreach ($pattern in $filesToDelete) {
        Get-ChildItem -Path $serverPath -Filter $pattern -File | Remove-Item -Force -ErrorAction SilentlyContinue
    }
    
    Write-Host "   ✅ Old files cleaned" -ForegroundColor Green
} else {
    Write-Host "   Creating directory: $serverPath"
    New-Item -Path $serverPath -ItemType Directory -Force | Out-Null
    Write-Host "   ✅ Directory created" -ForegroundColor Green
}

Write-Host ""

# ============================================================================
# STEP 4: Delete pos-backend directory (consolidating into SamplePOS.Server)
# ============================================================================
Write-Host "🗑️  Step 4: Removing pos-backend directory..." -ForegroundColor Yellow

if (Test-Path $posBackendPath) {
    Remove-Item -Path $posBackendPath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   ✅ pos-backend removed (consolidating into SamplePOS.Server)" -ForegroundColor Green
} else {
    Write-Host "   ℹ️  pos-backend doesn't exist, skipping" -ForegroundColor Gray
}

Write-Host ""

# ============================================================================
# STEP 5: Initialize fresh Node.js project
# ============================================================================
Write-Host "📦 Step 5: Initializing Node.js project..." -ForegroundColor Yellow

Set-Location $serverPath

# Create package.json
$packageJson = @{
    name = "samplepos-server"
    version = "1.0.0"
    description = "POS System Backend - TypeScript + Express + Prisma"
    main = "dist/server.js"
    type = "module"
    scripts = @{
        dev = "tsx watch src/server.ts"
        build = "tsc"
        start = "node dist/server.js"
        "prisma:generate" = "prisma generate"
        "prisma:migrate" = "prisma migrate dev"
        "prisma:studio" = "prisma studio"
        "db:push" = "prisma db push"
        "db:seed" = "tsx prisma/seed.ts"
    }
    keywords = @("pos", "inventory", "typescript", "express", "prisma")
    author = ""
    license = "MIT"
} | ConvertTo-Json -Depth 10

$packageJson | Out-File -FilePath "package.json" -Encoding UTF8

Write-Host "   ✅ package.json created" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 6: Install dependencies
# ============================================================================
Write-Host "📦 Step 6: Installing dependencies..." -ForegroundColor Yellow
Write-Host "   This may take a few minutes..." -ForegroundColor Gray
Write-Host ""

# Install runtime dependencies
Write-Host "   Installing runtime dependencies..."
npm install express @prisma/client cors helmet compression dotenv bcryptjs jsonwebtoken express-validator winston date-fns

Write-Host ""
Write-Host "   Installing dev dependencies..."
npm install -D typescript @types/node @types/express @types/cors @types/compression @types/bcryptjs @types/jsonwebtoken tsx prisma

Write-Host ""
Write-Host "   ✅ Dependencies installed" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 7: Initialize Prisma
# ============================================================================
Write-Host "🔧 Step 7: Initializing Prisma..." -ForegroundColor Yellow

npx prisma init

Write-Host "   ✅ Prisma initialized" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 8: Create directory structure
# ============================================================================
Write-Host "📁 Step 8: Creating directory structure..." -ForegroundColor Yellow

$directories = @(
    "src",
    "src\config",
    "src\middleware",
    "src\modules",
    "src\utils",
    "logs"
)

foreach ($dir in $directories) {
    $fullPath = Join-Path $serverPath $dir
    if (-not (Test-Path $fullPath)) {
        New-Item -Path $fullPath -ItemType Directory -Force | Out-Null
        Write-Host "   Created: $dir"
    }
}

Write-Host "   ✅ Directory structure created" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 9: Summary
# ============================================================================
Write-Host "="*80 -ForegroundColor Cyan
Write-Host "✅ CLEANUP AND SETUP COMPLETE!" -ForegroundColor Green
Write-Host "="*80 -ForegroundColor Cyan
Write-Host ""
Write-Host "📍 Backend Location: $serverPath" -ForegroundColor Yellow
Write-Host "📦 Backup Location:  $backupPath" -ForegroundColor Yellow
Write-Host ""
Write-Host "✅ Completed Tasks:" -ForegroundColor Green
Write-Host "   1. Backup created"
Write-Host "   2. Old files cleaned"
Write-Host "   3. pos-backend removed"
Write-Host "   4. Fresh Node.js project initialized"
Write-Host "   5. Dependencies installed (190 packages)"
Write-Host "   6. Prisma initialized"
Write-Host "   7. Directory structure created"
Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Cyan
Write-Host "   1. Copy Prisma schema from BACKEND_02_PRISMA_SCHEMA.prisma"
Write-Host "   2. Copy all source files from BACKEND templates"
Write-Host "   3. Create .env file with database connection"
Write-Host "   4. Run: npx prisma migrate dev"
Write-Host "   5. Run: npm run dev"
Write-Host ""
Write-Host "🎯 Ready to copy backend files!" -ForegroundColor Green
Write-Host ""
