# Admin API Test Script
# Tests all admin endpoints for data management

$BASE_URL = "http://localhost:3001"
$API_BASE = "$BASE_URL/api"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Admin Data Management API - Test Suite" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# Step 1: Login as Admin
# ============================================================

Write-Host "Step 1: Authenticating as Admin..." -ForegroundColor Yellow

$loginData = @{
    email = "admin@samplepos.com"
    password = "admin123"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$API_BASE/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $loginData

    if ($loginResponse.success) {
        $token = $loginResponse.data.token
        $user = $loginResponse.data.user
        Write-Host "✓ Login successful" -ForegroundColor Green
        Write-Host "  User: $($user.fullName) ($($user.email))" -ForegroundColor Gray
        Write-Host "  Role: $($user.role)" -ForegroundColor Gray
        Write-Host "  Token: $($token.Substring(0, 20))..." -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "✗ Login failed: $($loginResponse.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Login request failed: $_" -ForegroundColor Red
    Write-Host "  Make sure the server is running on port 3001" -ForegroundColor Yellow
    exit 1
}

# Create authorization header
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# ============================================================
# Step 2: Get Database Statistics
# ============================================================

Write-Host "Step 2: Fetching Database Statistics..." -ForegroundColor Yellow

try {
    $statsResponse = Invoke-RestMethod -Uri "$API_BASE/admin/stats" `
        -Method GET `
        -Headers $headers

    if ($statsResponse.success) {
        Write-Host "✓ Statistics retrieved successfully" -ForegroundColor Green
        
        $stats = $statsResponse.data
        
        Write-Host ""
        Write-Host "  Master Data:" -ForegroundColor Cyan
        foreach ($key in $stats.masterData.PSObject.Properties.Name) {
            $value = $stats.masterData.$key
            Write-Host "    - $($key): $value" -ForegroundColor Gray
        }
        
        Write-Host ""
        Write-Host "  Transactional Data:" -ForegroundColor Cyan
        $totalTransactions = 0
        foreach ($key in $stats.transactionalData.PSObject.Properties.Name) {
            $value = $stats.transactionalData.$key
            $totalTransactions += $value
            Write-Host "    - $($key): $value" -ForegroundColor Gray
        }
        
        Write-Host ""
        Write-Host "  Database Size: $($stats.databaseSize)" -ForegroundColor Cyan
        Write-Host "  Total Transactions: $totalTransactions" -ForegroundColor Cyan
        
        Write-Host ""
        Write-Host "  Integrity Check:" -ForegroundColor Cyan
        if ($stats.integrity.valid) {
            Write-Host "    ✓ Database is healthy" -ForegroundColor Green
        } else {
            Write-Host "    ✗ Issues found:" -ForegroundColor Red
            foreach ($issue in $stats.integrity.issues) {
                Write-Host "      - $issue" -ForegroundColor Yellow
            }
        }
        
        Write-Host ""
    } else {
        Write-Host "✗ Failed to get statistics: $($statsResponse.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Statistics request failed: $_" -ForegroundColor Red
}

# ============================================================
# Step 3: Validate Database Integrity
# ============================================================

Write-Host "Step 3: Validating Database Integrity..." -ForegroundColor Yellow

try {
    $integrityResponse = Invoke-RestMethod -Uri "$API_BASE/admin/validate-integrity" `
        -Method GET `
        -Headers $headers

    if ($integrityResponse.success) {
        $integrity = $integrityResponse.data
        
        if ($integrity.valid) {
            Write-Host "✓ Database integrity check passed" -ForegroundColor Green
            Write-Host "  No orphaned records or integrity issues found" -ForegroundColor Gray
        } else {
            Write-Host "✗ Integrity issues detected:" -ForegroundColor Red
            foreach ($issue in $integrity.issues) {
                Write-Host "  - $issue" -ForegroundColor Yellow
            }
        }
        Write-Host ""
    } else {
        Write-Host "✗ Integrity check failed: $($integrityResponse.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Integrity check request failed: $_" -ForegroundColor Red
}

# ============================================================
# Step 4: List Existing Backups
# ============================================================

Write-Host "Step 4: Listing Existing Backups..." -ForegroundColor Yellow

try {
    $backupsResponse = Invoke-RestMethod -Uri "$API_BASE/admin/backups" `
        -Method GET `
        -Headers $headers

    if ($backupsResponse.success) {
        $backups = $backupsResponse.data
        
        if ($backups.Count -gt 0) {
            Write-Host "✓ Found $($backups.Count) backup(s)" -ForegroundColor Green
            Write-Host ""
            
            foreach ($backup in $backups) {
                $sizeInMB = [math]::Round($backup.size / 1MB, 2)
                $created = [DateTime]::Parse($backup.created).ToString("yyyy-MM-dd HH:mm:ss")
                Write-Host "  - $($backup.fileName)" -ForegroundColor Cyan
                Write-Host "    Size: $sizeInMB MB" -ForegroundColor Gray
                Write-Host "    Created: $created" -ForegroundColor Gray
                Write-Host ""
            }
        } else {
            Write-Host "✓ No existing backups found" -ForegroundColor Green
            Write-Host ""
        }
    } else {
        Write-Host "✗ Failed to list backups: $($backupsResponse.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ List backups request failed: $_" -ForegroundColor Red
}

# ============================================================
# Step 5: Create a Database Backup
# ============================================================

Write-Host "Step 5: Creating Database Backup..." -ForegroundColor Yellow

$backupFileName = "test_backup_$(Get-Date -Format 'yyyy_MM_dd_HH_mm_ss').dump"
$backupPath = Join-Path $PSScriptRoot "backups\$backupFileName"

try {
    $backupResponse = Invoke-WebRequest -Uri "$API_BASE/admin/backup" `
        -Method POST `
        -Headers $headers `
        -OutFile $backupPath

    if (Test-Path $backupPath) {
        $fileSize = (Get-Item $backupPath).Length
        $sizeInMB = [math]::Round($fileSize / 1MB, 2)
        
        Write-Host "✓ Backup created successfully" -ForegroundColor Green
        Write-Host "  File: $backupFileName" -ForegroundColor Gray
        Write-Host "  Size: $sizeInMB MB" -ForegroundColor Gray
        Write-Host "  Path: $backupPath" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "✗ Backup file not created" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Backup creation failed: $_" -ForegroundColor Red
    Write-Host "  Note: This requires pg_dump to be installed and in PATH" -ForegroundColor Yellow
    Write-Host ""
}

# ============================================================
# Step 6: Export Master Data to JSON
# ============================================================

Write-Host "Step 6: Exporting Master Data to JSON..." -ForegroundColor Yellow

try {
    $exportResponse = Invoke-RestMethod -Uri "$API_BASE/admin/export-master-data" `
        -Method POST `
        -Headers $headers

    if ($exportResponse.success) {
        $masterData = $exportResponse.data
        
        Write-Host "✓ Master data exported successfully" -ForegroundColor Green
        Write-Host ""
        
        Write-Host "  Master Data Counts:" -ForegroundColor Cyan
        Write-Host "    - Customers: $($masterData.customers.Count)" -ForegroundColor Gray
        Write-Host "    - Suppliers: $($masterData.suppliers.Count)" -ForegroundColor Gray
        Write-Host "    - Products: $($masterData.products.Count)" -ForegroundColor Gray
        Write-Host "    - Categories: $($masterData.categories.Count)" -ForegroundColor Gray
        Write-Host "    - Units of Measure: $($masterData.units_of_measure.Count)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "✗ Export failed: $($exportResponse.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Export request failed: $_" -ForegroundColor Red
}

# ============================================================
# Step 7: Test Clear Transactions (DRY RUN - Wrong Confirmation)
# ============================================================

Write-Host "Step 7: Testing Transaction Clearing (Wrong Confirmation)..." -ForegroundColor Yellow

$clearDataWrong = @{
    confirmation = "WRONG PHRASE"
} | ConvertTo-Json

try {
    $clearResponse = Invoke-RestMethod -Uri "$API_BASE/admin/clear-transactions" `
        -Method POST `
        -Headers $headers `
        -Body $clearDataWrong `
        -ErrorAction Stop

    Write-Host "✗ Should have rejected wrong confirmation" -ForegroundColor Red
} catch {
    $errorResponse = $_.ErrorDetails.Message | ConvertFrom-Json
    if ($errorResponse.error -like "*confirmation phrase*") {
        Write-Host "✓ Correctly rejected wrong confirmation phrase" -ForegroundColor Green
        Write-Host "  Error: $($errorResponse.error)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "✗ Unexpected error: $($errorResponse.error)" -ForegroundColor Red
    }
}

# ============================================================
# Step 8: Test Unauthorized Access (Non-Admin User)
# ============================================================

Write-Host "Step 8: Testing Authorization (Non-Admin Access)..." -ForegroundColor Yellow

# Try to create a manager user and test access
Write-Host "  (Skipping - requires existing non-admin user)" -ForegroundColor Gray
Write-Host "  Note: Only ADMIN role can access /api/admin endpoints" -ForegroundColor Gray
Write-Host ""

# ============================================================
# Summary
# ============================================================

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Test Suite Summary" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Endpoints Tested:" -ForegroundColor Yellow
Write-Host "  ✓ POST /api/admin/backup" -ForegroundColor Green
Write-Host "  ✓ GET  /api/admin/backups" -ForegroundColor Green
Write-Host "  ✓ GET  /api/admin/stats" -ForegroundColor Green
Write-Host "  ✓ GET  /api/admin/validate-integrity" -ForegroundColor Green
Write-Host "  ✓ POST /api/admin/export-master-data" -ForegroundColor Green
Write-Host "  ✓ POST /api/admin/clear-transactions (validation)" -ForegroundColor Green
Write-Host ""

Write-Host "NOT Tested (Destructive Operations):" -ForegroundColor Yellow
Write-Host "  - POST /api/admin/restore (requires backup file)" -ForegroundColor Gray
Write-Host "  - POST /api/admin/clear-transactions (with correct confirmation)" -ForegroundColor Gray
Write-Host "  - DELETE /api/admin/backups/:fileName" -ForegroundColor Gray
Write-Host "  - POST /api/admin/cleanup-backups" -ForegroundColor Gray
Write-Host ""

Write-Host "⚠️  WARNING: Do not run destructive tests on production database!" -ForegroundColor Red
Write-Host ""

Write-Host "To test destructive operations on a TEST database:" -ForegroundColor Yellow
Write-Host "  1. Create a test database" -ForegroundColor Gray
Write-Host "  2. Update DATABASE_URL in .env" -ForegroundColor Gray
Write-Host "  3. Run: curl -X POST http://localhost:3001/api/admin/clear-transactions \" -ForegroundColor Gray
Write-Host "           -H 'Authorization: Bearer <token>' \" -ForegroundColor Gray
Write-Host "           -H 'Content-Type: application/json' \" -ForegroundColor Gray
Write-Host "           -d '{\"confirmation\": \"CLEAR ALL DATA\"}'" -ForegroundColor Gray
Write-Host ""

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Admin API Test Complete" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
