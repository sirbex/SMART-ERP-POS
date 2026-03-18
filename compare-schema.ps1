$platformTables = @('tenants','super_admins','tenant_api_keys','tenant_audit_log','sync_ledger','billing_events','schema_migrations','__EFMigrationsHistory')

$master = Get-Content master_schema.txt | Where-Object { $_.Trim() -ne '' } | ForEach-Object {
    $parts = $_ -split '\|'
    $tbl = $parts[0]
    if ($platformTables -notcontains $tbl) { $_ }
}

$tenant = Get-Content tenant_schema.txt | Where-Object { $_.Trim() -ne '' }

# Group by table
$masterByTable = @{}
foreach ($line in $master) {
    $parts = $line -split '\|'
    $tbl = $parts[0]
    if (-not $masterByTable.ContainsKey($tbl)) { $masterByTable[$tbl] = @() }
    $masterByTable[$tbl] += $line
}

$tenantByTable = @{}
foreach ($line in $tenant) {
    $parts = $line -split '\|'
    $tbl = $parts[0]
    if (-not $tenantByTable.ContainsKey($tbl)) { $tenantByTable[$tbl] += @() }
    $tenantByTable[$tbl] += $line
}

# Find tables in master but not tenant
$missingTables = $masterByTable.Keys | Where-Object { -not $tenantByTable.ContainsKey($_) } | Sort-Object
$extraTables = $tenantByTable.Keys | Where-Object { -not $masterByTable.ContainsKey($_) } | Sort-Object

Write-Host "=== TABLES IN MASTER BUT NOT TENANT ==="
$missingTables | ForEach-Object { Write-Host "  $_" }

Write-Host ""
Write-Host "=== TABLES IN TENANT BUT NOT MASTER ==="
$extraTables | ForEach-Object { Write-Host "  $_" }

# For tables in both, find column differences
Write-Host ""
Write-Host "=== COLUMN DIFFERENCES IN SHARED TABLES ==="
$sharedTables = $masterByTable.Keys | Where-Object { $tenantByTable.ContainsKey($_) } | Sort-Object

foreach ($tbl in $sharedTables) {
    $mCols = $masterByTable[$tbl] | ForEach-Object { ($_ -split '\|',2)[1] } | Sort-Object
    $tCols = $tenantByTable[$tbl] | ForEach-Object { ($_ -split '\|',2)[1] } | Sort-Object
    
    $diff = Compare-Object $mCols $tCols
    if ($diff) {
        Write-Host ""
        Write-Host "TABLE: $tbl"
        $diff | Where-Object { $_.SideIndicator -eq '<=' } | ForEach-Object { Write-Host "  MASTER ONLY: $($_.InputObject)" }
        $diff | Where-Object { $_.SideIndicator -eq '=>' } | ForEach-Object { Write-Host "  TENANT ONLY: $($_.InputObject)" }
    }
}
