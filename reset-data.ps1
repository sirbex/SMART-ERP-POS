# =============================================================================
# SAFE DATA RESET - Run this script to reset all transactional data
# =============================================================================
# This script:
# - Backs up the current database (optional)
# - Resets ALL transactional data (sales, invoices, POs, inventory, GL, etc.)
# - Preserves master data (products, customers, suppliers, users, accounts)
# - Resets all balances to zero
# - Verifies data integrity after reset
# =============================================================================

param(
    [switch]$NoBackup,
    [switch]$Confirm
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  SAFE DATA RESET - SamplePOS System" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Check if user wants to proceed
if (-not $Confirm) {
    Write-Host "⚠️  WARNING: This will DELETE all transactional data!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "This includes:" -ForegroundColor Yellow
    Write-Host "  - All sales and sale items" -ForegroundColor Gray
    Write-Host "  - All invoices and payments" -ForegroundColor Gray
    Write-Host "  - All quotations" -ForegroundColor Gray
    Write-Host "  - All purchase orders and goods receipts" -ForegroundColor Gray
    Write-Host "  - All supplier invoices and payments" -ForegroundColor Gray
    Write-Host "  - All inventory batches and stock movements" -ForegroundColor Gray
    Write-Host "  - All GL transactions and journal entries" -ForegroundColor Gray
    Write-Host "  - All delivery orders" -ForegroundColor Gray
    Write-Host "  - All cash register sessions and movements" -ForegroundColor Gray
    Write-Host "  - All audit logs" -ForegroundColor Gray
    Write-Host ""
    Write-Host "The following will be PRESERVED:" -ForegroundColor Green
    Write-Host "  - Products (quantities reset to 0)" -ForegroundColor Gray
    Write-Host "  - Customers (balances reset to 0)" -ForegroundColor Gray
    Write-Host "  - Suppliers (balances reset to 0)" -ForegroundColor Gray
    Write-Host "  - GL Accounts (balances reset to 0)" -ForegroundColor Gray
    Write-Host "  - Users and authentication" -ForegroundColor Gray
    Write-Host "  - Cash Registers (configurations)" -ForegroundColor Gray
    Write-Host "  - System settings" -ForegroundColor Gray
    Write-Host "  - Discount rules and pricing tiers" -ForegroundColor Gray
    Write-Host ""
    
    $response = Read-Host "Type 'RESET' to proceed, or anything else to cancel"
    if ($response -ne "RESET") {
        Write-Host "❌ Reset cancelled." -ForegroundColor Red
        exit 0
    }
}

# Verify PostgreSQL is accessible
Write-Host "Checking database connection..." -ForegroundColor Gray
try {
    $testResult = psql -U postgres -d pos_system -c "SELECT 1;" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Cannot connect to database"
    }
    Write-Host "✓ Database connection OK" -ForegroundColor Green
} catch {
    Write-Host "❌ Cannot connect to PostgreSQL. Is it running?" -ForegroundColor Red
    exit 1
}

# Create backup unless skipped
if (-not $NoBackup) {
    Write-Host ""
    Write-Host "Creating database backup..." -ForegroundColor Cyan
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $backupFile = ".\backups\pos_system_backup_$timestamp.sql"
    
    # Create backups directory if it doesn't exist
    if (-not (Test-Path ".\backups")) {
        New-Item -ItemType Directory -Path ".\backups" | Out-Null
    }
    
    try {
        pg_dump -U postgres -d pos_system -f $backupFile 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Backup created: $backupFile" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Backup failed, but continuing..." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️  Backup failed: $_" -ForegroundColor Yellow
    }
}

# Run the safe reset script
Write-Host ""
Write-Host "Executing safe data reset..." -ForegroundColor Cyan
Write-Host ""

$scriptPath = Join-Path $PSScriptRoot "shared\sql\safe_data_reset.sql"
if (-not (Test-Path $scriptPath)) {
    $scriptPath = ".\shared\sql\safe_data_reset.sql"
}

try {
    $result = psql -U postgres -d pos_system -f $scriptPath 2>&1
    
    # Display output
    $result | ForEach-Object {
        $line = $_
        if ($line -match "NOTICE") {
            $line = $line -replace "NOTICE:\s*", ""
            if ($line -match "PHASE") {
                Write-Host "  $line" -ForegroundColor Cyan
            } elseif ($line -match "✅|COMPLETED") {
                Write-Host "  $line" -ForegroundColor Green
            } else {
                Write-Host "  $line" -ForegroundColor Gray
            }
        } elseif ($line -match "ERROR") {
            Write-Host "  $line" -ForegroundColor Red
        } elseif ($line -match "entity|count|total") {
            Write-Host $line -ForegroundColor Gray
        } elseif ($line -match "^-+$|^\s*$") {
            # Skip separator lines
        } else {
            Write-Host $line
        }
    }
    
    if ($LASTEXITCODE -ne 0) {
        throw "Reset script failed"
    }
    
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host "  ✅ DATA RESET COMPLETED SUCCESSFULLY" -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Restart the backend server to clear caches" -ForegroundColor Gray
    Write-Host "  2. Refresh the frontend application" -ForegroundColor Gray
    Write-Host "  3. Start entering fresh transactions" -ForegroundColor Gray
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ ERROR: Data reset failed!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if (-not $NoBackup) {
        Write-Host ""
        Write-Host "To restore from backup, run:" -ForegroundColor Yellow
        Write-Host "  psql -U postgres -d pos_system -f $backupFile" -ForegroundColor Gray
    }
    
    exit 1
}
