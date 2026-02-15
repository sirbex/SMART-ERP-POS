# Fix UoM Cost Override Database Migration
# This script clears incorrect cost_override values in the product_uoms table

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$sqlFile = Join-Path $scriptPath "..\shared\sql\fix_uom_cost_overrides.sql"

Write-Host "🔧 Fixing UoM cost_override values..." -ForegroundColor Cyan
Write-Host ""

# Check if .env file exists
$envFile = Join-Path $scriptPath ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "❌ .env file not found at: $envFile" -ForegroundColor Red
    Write-Host "Please create a .env file with DATABASE_URL" -ForegroundColor Yellow
    exit 1
}

# Load DATABASE_URL from .env
$databaseUrl = $null
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^DATABASE_URL=(.+)$') {
        $databaseUrl = $matches[1].Trim('"')
    }
}

if (-not $databaseUrl) {
    Write-Host "❌ DATABASE_URL not found in .env file" -ForegroundColor Red
    exit 1
}

Write-Host "📊 Database URL loaded from .env" -ForegroundColor Green
Write-Host ""

# Execute SQL migration
Write-Host "Running SQL migration..." -ForegroundColor Yellow
Write-Host ""

try {
    # Using psql (PostgreSQL command-line tool)
    $env:PGPASSWORD = ""
    if ($databaseUrl -match 'postgresql://([^:]+):([^@]+)@([^/]+)/(.+)') {
        $username = $matches[1]
        $password = $matches[2]
        $hostPort = $matches[3]
        $database = $matches[4]
        
        $env:PGPASSWORD = $password
        
        if ($hostPort -match '([^:]+):(\d+)') {
            $host = $matches[1]
            $port = $matches[2]
        } else {
            $host = $hostPort
            $port = 5432
        }
        
        Write-Host "Connecting to: $host:$port/$database" -ForegroundColor Cyan
        
        psql -h $host -p $port -U $username -d $database -f $sqlFile
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "✅ Migration completed successfully!" -ForegroundColor Green
            Write-Host ""
            Write-Host "📋 Summary:" -ForegroundColor Cyan
            Write-Host "  - Cleared cost_override values where they matched base cost" -ForegroundColor White
            Write-Host "  - System will now auto-calculate: displayCost = baseCost × conversionFactor" -ForegroundColor White
            Write-Host ""
            Write-Host "🔄 Please refresh your browser to see the changes" -ForegroundColor Yellow
        } else {
            Write-Host ""
            Write-Host "❌ Migration failed with exit code: $LASTEXITCODE" -ForegroundColor Red
        }
    } else {
        Write-Host "❌ Invalid DATABASE_URL format" -ForegroundColor Red
        Write-Host "Expected format: postgresql://user:pass@host:port/database" -ForegroundColor Yellow
    }
} catch {
    Write-Host ""
    Write-Host "❌ Error executing migration: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Alternative: Run the SQL file manually using pgAdmin or psql:" -ForegroundColor Yellow
    Write-Host "  psql -U youruser -d yourdatabase -f ""$sqlFile""" -ForegroundColor White
} finally {
    $env:PGPASSWORD = ""
}
