# Run Quotations System Migration
# This creates the quotations and quotation_items tables

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Quotations System Migration" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Set database credentials
$env:PGPASSWORD = "password"
$dbUser = "postgres"
$dbName = "pos_system"
$migrationFile = "SamplePOS.Server/db/migrations/003_create_quotations_system.sql"

# Check if migration file exists
if (-not (Test-Path $migrationFile)) {
    Write-Host "❌ Migration file not found: $migrationFile" -ForegroundColor Red
    exit 1
}

Write-Host "📄 Running migration: $migrationFile" -ForegroundColor Yellow
Write-Host ""

try {
    # Run the migration
    $result = & psql -U $dbUser -d $dbName -f $migrationFile 2>&1
    
    # Display output
    $result | ForEach-Object {
        if ($_ -match "ERROR") {
            Write-Host $_ -ForegroundColor Red
        } elseif ($_ -match "NOTICE") {
            Write-Host $_ -ForegroundColor Green
        } else {
            Write-Host $_
        }
    }
    
    Write-Host ""
    Write-Host "✅ Migration completed successfully!" -ForegroundColor Green
    Write-Host ""
    
    # Verify tables were created
    Write-Host "Verifying tables..." -ForegroundColor Yellow
    $verification = & psql -U $dbUser -d $dbName -c "\dt quotation*" 2>&1
    Write-Host $verification
    
    Write-Host ""
    Write-Host "Checking quotations count..." -ForegroundColor Yellow
    $count = & psql -U $dbUser -d $dbName -c "SELECT COUNT(*) as total FROM quotations;" 2>&1
    Write-Host $count
    
} catch {
    Write-Host ""
    Write-Host "❌ Migration failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ Quotations system ready!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
