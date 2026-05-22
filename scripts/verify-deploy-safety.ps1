#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Pre/post deploy data integrity audit for SMART-ERP tenants.

.DESCRIPTION
  Connects to the production PostgreSQL container and counts every business
  record in every tenant database.  Run it BEFORE a deploy (--snapshot) to
  save a baseline, then AFTER (--verify) to confirm zero rows were lost.
  An exit code of 0 means all counts are identical or increased; non-zero
  means rows disappeared and the deploy must be rolled back immediately.

.PARAMETER Snapshot
  Capture current counts and write them to verify-snapshot.json.

.PARAMETER Verify
  Compare current counts against verify-snapshot.json; exit 1 if any count
  dropped.

.PARAMETER SnapshotFile
  Path to the snapshot JSON file.  Defaults to ./verify-snapshot.json.

.EXAMPLE
  # Before deploying:
  .\scripts\verify-deploy-safety.ps1 -Snapshot

  # After deploying:
  .\scripts\verify-deploy-safety.ps1 -Verify
#>

param(
    [switch]$Snapshot,
    [switch]$Verify,
    [string]$SnapshotFile = "$PSScriptRoot\verify-snapshot.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Config ────────────────────────────────────────────────────────────────────
$SERVER       = '209.38.203.138'
$CONTAINER    = if ($env:POSTGRES_CONTAINER) { $env:POSTGRES_CONTAINER } else { 'smarterp-postgres' }
$PG_USER      = 'postgres'

$TENANT_DBS = $null  # resolved in Snapshot/Verify via Get-TenantDatabases

# Tables that contain irreplaceable business records.
# Grouped by domain so failures are easy to interpret.
$CRITICAL_TABLES = @(
    # ── Sales & POS ──────────────────────────────────────────────────────────
    'sales'
    'sale_items'
    'payments'

    # ── Credit / AR ──────────────────────────────────────────────────────────
    'customer_transactions'
    'credit_sales'

    # ── Purchasing ───────────────────────────────────────────────────────────
    'purchase_orders'
    'purchase_order_items'
    'goods_receipts'
    'goods_receipt_items'
    'supplier_invoices'
    'supplier_payments'
    'supplier_payment_allocations'

    # ── Inventory ────────────────────────────────────────────────────────────
    'inventory_items'
    'batches'
    'stock_movements'
    'stock_count_sessions'
    'stock_count_items'

    # ── Customers & Suppliers ────────────────────────────────────────────────
    'customers'
    'suppliers'

    # ── Accounting / GL ──────────────────────────────────────────────────────
    'gl_entries'
    'gl_entry_lines'
    'accounts'
    'journal_entries'

    # ── Invoicing ────────────────────────────────────────────────────────────
    'invoices'
    'invoice_items'
    'quotations'
    'quotation_items'
    'delivery_notes'
    'delivery_note_items'
    'credit_notes'
    'credit_note_items'

    # ── Banking ──────────────────────────────────────────────────────────────
    'bank_accounts'
    'bank_transactions'
    'bank_reconciliations'

    # ── Users / Auth ─────────────────────────────────────────────────────────
    'users'
)

# ── Helpers ───────────────────────────────────────────────────────────────────

function Run-PsqlQuery([string]$db, [string]$sql) {
    <#  Execute a single SQL query on the remote container via SSH + psql.
        Returns raw stdout string.  Throws if psql exits non-zero.  #>
    $escaped = $sql -replace '"', '\"'
    $cmd = "docker exec $CONTAINER psql -U $PG_USER -d $db -t -c `"$escaped`""
    $result = ssh -o BatchMode=yes -o ConnectTimeout=10 "root@$SERVER" $cmd 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "psql error on $db : $result"
    }
    return ($result -join "`n").Trim()
}

function Table-Exists([string]$db, [string]$table) {
    $sql = "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='$table' LIMIT 1;"
    $out = Run-PsqlQuery $db $sql
    return ($out -match '1')
}

function Get-TenantDatabases {
    $fromPg = (Run-PsqlQuery 'postgres' @"
SELECT datname FROM pg_database
WHERE datistemplate = false
  AND (datname IN ('pos_system','pos_template') OR datname LIKE 'pos_tenant_%')
ORDER BY datname;
"@) -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ }

    $merged = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($d in $fromPg) { [void]$merged.Add($d) }

    if ($merged.Contains('pos_system')) {
        $fromReg = (Run-PsqlQuery 'pos_system' @"
SELECT database_name FROM tenants
WHERE status IS DISTINCT FROM 'DELETED' AND database_name IS NOT NULL
ORDER BY database_name;
"@) -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ }
        foreach ($d in $fromReg) { [void]$merged.Add($d) }
    }

    return ($merged | Sort-Object)
}

function Get-Counts {
    <# Returns hashtable: { "db.table" = count } for every existing table. #>
    $counts = @{}
    foreach ($db in $TENANT_DBS) {
        Write-Host "  Checking $db..." -ForegroundColor Cyan
        foreach ($table in $CRITICAL_TABLES) {
            if (Table-Exists $db $table) {
                $raw = Run-PsqlQuery $db "SELECT COUNT(*) FROM $table;"
                $n   = [long]($raw -replace '\s', '')
                $key = "$db.$table"
                $counts[$key] = $n
            }
            # Tables that don't exist yet are simply skipped (not a failure).
        }
    }
    return $counts
}

# ── Snapshot mode ─────────────────────────────────────────────────────────────

if ($Snapshot -or $Verify) {
    $TENANT_DBS = Get-TenantDatabases
    Write-Host "Tenant databases: $($TENANT_DBS -join ', ')" -ForegroundColor DarkGray
}

if ($Snapshot) {
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Yellow
    Write-Host "║   PRE-DEPLOY SNAPSHOT  — $(Get-Date -Format 'yyyy-MM-dd HH:mm')   ║" -ForegroundColor Yellow
    Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Yellow
    Write-Host ""

    $counts = Get-Counts

    $snapshot = @{
        timestamp = (Get-Date -Format 'o')
        server    = $SERVER
        counts    = $counts
    }

    $snapshot | ConvertTo-Json -Depth 5 | Set-Content -Path $SnapshotFile -Encoding UTF8
    Write-Host ""
    Write-Host "✅  Snapshot saved → $SnapshotFile" -ForegroundColor Green
    Write-Host ""

    # Pretty-print summary
    Write-Host "RECORD COUNTS AT SNAPSHOT TIME:" -ForegroundColor White
    $counts.GetEnumerator() | Sort-Object Key | ForEach-Object {
        Write-Host ("  {0,-55} {1,10}" -f $_.Key, $_.Value)
    }
    Write-Host ""
    exit 0
}

# ── Verify mode ───────────────────────────────────────────────────────────────

if ($Verify) {
    if (-not (Test-Path $SnapshotFile)) {
        Write-Host "ERROR: No snapshot file found at $SnapshotFile" -ForegroundColor Red
        Write-Host "       Run with -Snapshot BEFORE deploying." -ForegroundColor Red
        exit 1
    }

    $snap      = Get-Content $SnapshotFile | ConvertFrom-Json
    $snapTime  = $snap.timestamp
    $baseline  = @{}
    # ConvertFrom-Json gives PSCustomObject — flatten to hashtable
    $snap.counts.PSObject.Properties | ForEach-Object { $baseline[$_.Name] = [long]$_.Value }

    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║   POST-DEPLOY VERIFY   — $(Get-Date -Format 'yyyy-MM-dd HH:mm')   ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host "  Baseline taken: $snapTime"
    Write-Host ""

    $current = Get-Counts

    $failures = @()
    $warnings = @()
    $ok       = @()

    # Check every key that existed at snapshot time
    foreach ($key in $baseline.Keys | Sort-Object) {
        $before = $baseline[$key]
        $after  = if ($current.ContainsKey($key)) { $current[$key] } else { -1 }

        if ($after -eq -1) {
            $failures += [PSCustomObject]@{ Key=$key; Before=$before; After='TABLE MISSING'; Delta='⛔ CRITICAL' }
        } elseif ($after -lt $before) {
            $delta = $after - $before
            $failures += [PSCustomObject]@{ Key=$key; Before=$before; After=$after; Delta="⛔ LOST $([Math]::Abs($delta)) rows" }
        } elseif ($after -gt $before) {
            $delta = $after - $before
            $warnings += [PSCustomObject]@{ Key=$key; Before=$before; After=$after; Delta="✅ +$delta new rows" }
        } else {
            $ok += [PSCustomObject]@{ Key=$key; Before=$before; After=$after; Delta='✅ unchanged' }
        }
    }

    # Print results
    if ($ok.Count -gt 0) {
        Write-Host "── UNCHANGED ($($ok.Count) tables) ──────────────────────────────────────────" -ForegroundColor Gray
        $ok | ForEach-Object {
            Write-Host ("  {0,-55} {1,10}" -f $_.Key, $_.After) -ForegroundColor Gray
        }
        Write-Host ""
    }

    if ($warnings.Count -gt 0) {
        Write-Host "── NEW ROWS ADDED (expected during live operation) ────────────────────────────" -ForegroundColor Green
        $warnings | ForEach-Object {
            Write-Host ("  {0,-55} {1}" -f $_.Key, $_.Delta) -ForegroundColor Green
        }
        Write-Host ""
    }

    if ($failures.Count -gt 0) {
        Write-Host "╔══════════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Red
        Write-Host "║  🚨 DATA LOSS DETECTED — ROLLBACK REQUIRED                                  ║" -ForegroundColor Red
        Write-Host "╚══════════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Red
        Write-Host ""
        $failures | ForEach-Object {
            Write-Host ("  {0,-55} BEFORE={1}  AFTER={2}  {3}" -f $_.Key, $_.Before, $_.After, $_.Delta) -ForegroundColor Red
        }
        Write-Host ""
        Write-Host "ROLLBACK STEPS:" -ForegroundColor Yellow
        Write-Host "  1. DO NOT run any further migrations."
        Write-Host "  2. Restore from latest pg_dump snapshot on server."
        Write-Host "  3. Rebuild previous Docker image from last-known-good git SHA."
        Write-Host "  4. Restart only backend+frontend containers (never touch postgres/redis)."
        Write-Host ""
        exit 1
    }

    Write-Host "╔══════════════════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║  ✅  ALL TENANT DATA INTACT — DEPLOY VERIFIED SAFE                         ║" -ForegroundColor Green
    Write-Host "╚══════════════════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Tables checked : $($baseline.Count)"
    Write-Host "  Unchanged      : $($ok.Count)"
    Write-Host "  New rows added : $($warnings.Count)"
    Write-Host "  DATA LOST      : 0"
    Write-Host ""
    exit 0
}

# ── Usage ─────────────────────────────────────────────────────────────────────

Write-Host "Usage:"
Write-Host "  Before deploy:  .\scripts\verify-deploy-safety.ps1 -Snapshot"
Write-Host "  After deploy:   .\scripts\verify-deploy-safety.ps1 -Verify"
Write-Host ""
Write-Host "Options:"
Write-Host "  -SnapshotFile <path>   Override snapshot file location (default: ./scripts/verify-snapshot.json)"
exit 1
