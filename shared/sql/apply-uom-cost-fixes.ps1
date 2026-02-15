# Apply UoM-related cost fixes
# - Clears incorrect product_uoms.cost_override values
# - Normalizes base unit costs in DRAFT GRs and PENDING POs

param(
    [string]$DatabaseUrl = $env:DATABASE_URL
)

if (-not $DatabaseUrl) {
    Write-Host "❌ DATABASE_URL environment variable not set" -ForegroundColor Red
    Write-Host "Set it in .env or pass -DatabaseUrl 'postgresql://user:pass@host:port/db'" -ForegroundColor Yellow
    exit 1
}

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

$env:PGPASSWORD = $dbPass

Write-Host ""; Write-Host "═════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " Applying UoM Cost Fixes" -ForegroundColor Cyan
Write-Host "═════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Database: $dbName@$dbHost" -ForegroundColor White

# Test connection
Write-Host "🔌 Testing database connection..." -ForegroundColor Yellow
$test = & psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -c "SELECT 1;" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Connection failed" -ForegroundColor Red
    Write-Host $test -ForegroundColor Red
    exit 1
}
Write-Host "✅ Connected" -ForegroundColor Green

$scripts = @(
    "fix_uom_cost_overrides.sql",
    "fix_base_cost_normalization.sql"
)

$ok = 0; $fail = 0
foreach ($s in $scripts) {
    $path = Join-Path ".\shared\sql" $s
    if (!(Test-Path $path)) { Write-Host "⚠️  Missing: $s" -ForegroundColor Yellow; $fail++; continue }
    Write-Host "→ Running $s" -ForegroundColor Gray
    $out = & psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -f $path 2>&1
    if ($LASTEXITCODE -eq 0) { Write-Host "   ✅ Success" -ForegroundColor Green; $ok++ }
    else { Write-Host "   ❌ Failed" -ForegroundColor Red; Write-Host $out -ForegroundColor Red; $fail++ }
}

Write-Host ""; Write-Host "Summary: ✅ $ok  ❌ $fail" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($fail -ne 0) { exit 1 }

Remove-Item Env:\PGPASSWORD
