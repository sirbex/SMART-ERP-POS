# Run All Pricing & Costing Migrations
# Purpose: Execute all SQL migration scripts against PostgreSQL database
# Date: 2025-10-31

param(
    [string]$DatabaseUrl = $env:DATABASE_URL,
    [switch]$Rollback
)

# Check if DATABASE_URL is set
if (-not $DatabaseUrl) {
    Write-Host "❌ DATABASE_URL environment variable not set" -ForegroundColor Red
    Write-Host "Set it in .env file or pass as parameter: -DatabaseUrl 'postgresql://...'" -ForegroundColor Yellow
    exit 1
}

# Parse connection string
if ($DatabaseUrl -match 'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)') {
    $dbUser = $matches[1]
    $dbPass = $matches[2]
    $dbHost = $matches[3]
    $dbPort = $matches[4]
    $dbName = $matches[5]
} else {
    Write-Host "❌ Invalid DATABASE_URL format" -ForegroundColor Red
    exit 1
}

# Set PGPASSWORD for passwordless authentication
$env:PGPASSWORD = $dbPass

Write-Host ""
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Pricing & Costing System - Database Migration" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Database: $dbName@$dbHost" -ForegroundColor White
Write-Host "Migration Path: .\shared\sql\" -ForegroundColor White
Write-Host ""

# Test database connection
Write-Host "🔌 Testing database connection..." -ForegroundColor Yellow
$testQuery = "SELECT version();"
$testResult = & psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -c $testQuery 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Database connection failed" -ForegroundColor Red
    Write-Host $testResult -ForegroundColor Red
    exit 1
}

Write-Host "✅ Database connection successful" -ForegroundColor Green
Write-Host ""

if ($Rollback) {
    Write-Host "⚠️  ROLLBACK MODE - This will DELETE all pricing & costing data!" -ForegroundColor Red
    Write-Host ""
    $confirmation = Read-Host "Type 'ROLLBACK' to confirm"
    
    if ($confirmation -ne 'ROLLBACK') {
        Write-Host "❌ Rollback cancelled" -ForegroundColor Yellow
        exit 0
    }
    
    Write-Host ""
    Write-Host "📋 Running rollback script..." -ForegroundColor Yellow
    
    $rollbackFile = ".\shared\sql\999_rollback_pricing_costing.sql"
    if (Test-Path $rollbackFile) {
        Write-Host "  → Executing: $rollbackFile" -ForegroundColor Gray
        & psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -f $rollbackFile
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Rollback completed successfully" -ForegroundColor Green
        } else {
            Write-Host "❌ Rollback failed" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "❌ Rollback script not found: $rollbackFile" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "📋 Running migration scripts..." -ForegroundColor Yellow
    Write-Host ""
    
    # Discover all SQL migration files (excluding rollback and helper scripts)
    $allSql = Get-ChildItem -Path ".\shared\sql" -Filter "*.sql" | Where-Object { $_.Name -notmatch "^999_rollback|^apply-|^fix_" }
    # Sort by name to enforce natural migration order (prefix files with numeric or date-based names)
    $migrations = $allSql | Sort-Object Name | Select-Object -ExpandProperty Name
    
    $successCount = 0
    $failCount = 0
    
    foreach ($migration in $migrations) {
        $filePath = ".\shared\sql\$migration"
        
        if (Test-Path $filePath) {
            Write-Host "  → Executing: $migration" -ForegroundColor Gray
            
            $output = & psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -f $filePath 2>&1
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "    ✅ Success" -ForegroundColor Green
                $successCount++
            } else {
                Write-Host "    ❌ Failed" -ForegroundColor Red
                Write-Host $output -ForegroundColor Red
                $failCount++
            }
        } else {
            Write-Host "    ⚠️  File not found: $filePath" -ForegroundColor Yellow
            $failCount++
        }
    }
    
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  Migration Summary" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  ✅ Successful: $successCount" -ForegroundColor Green
    Write-Host "  ❌ Failed: $failCount" -ForegroundColor $(if ($failCount -eq 0) { 'Green' } else { 'Red' })
    Write-Host ""
    
    if ($failCount -eq 0) {
        Write-Host "🎉 All migrations completed successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "New tables created:" -ForegroundColor White
        Write-Host "  • cost_layers" -ForegroundColor Cyan
        Write-Host "  • customer_groups" -ForegroundColor Cyan
        Write-Host "  • pricing_tiers" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Products table extended with:" -ForegroundColor White
        Write-Host "  • costing_method (FIFO/AVCO/STANDARD)" -ForegroundColor Cyan
        Write-Host "  • average_cost, last_cost" -ForegroundColor Cyan
        Write-Host "  • pricing_formula, auto_update_price" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Customers table extended with:" -ForegroundColor White
        Write-Host "  • customer_group_id" -ForegroundColor Cyan
        Write-Host ""
    } else {
        Write-Host "⚠️  Some migrations failed. Please check errors above." -ForegroundColor Yellow
        exit 1
    }
}

# Clean up
Remove-Item Env:\PGPASSWORD
