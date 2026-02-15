# Initialize SamplePOS Database
# Runs the initial schema migration

$ErrorActionPreference = "Stop"

Write-Host "🗄️  Initializing SamplePOS Database..." -ForegroundColor Cyan
Write-Host ""

# Check if psql is available
try {
    $psqlVersion = psql --version
    Write-Host "✅ Found PostgreSQL: $psqlVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: PostgreSQL (psql) not found in PATH" -ForegroundColor Red
    Write-Host "   Please install PostgreSQL or add it to your PATH" -ForegroundColor Yellow
    exit 1
}

# Load .env file
$envPath = Join-Path $PSScriptRoot "SamplePOS.Server\.env"
if (Test-Path $envPath) {
    Write-Host "📄 Loading environment variables from .env..." -ForegroundColor Gray
    Get-Content $envPath | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim('"')
            [Environment]::SetEnvironmentVariable($key, $value, 'Process')
        }
    }
} else {
    Write-Host "⚠️  No .env file found, using defaults" -ForegroundColor Yellow
}

# Parse DATABASE_URL
$dbUrl = $env:DATABASE_URL
if (-not $dbUrl) {
    $dbUrl = "postgresql://postgres:password@localhost:5432/pos_system"
    Write-Host "⚠️  Using default DATABASE_URL: $dbUrl" -ForegroundColor Yellow
}

# Extract connection details
if ($dbUrl -match 'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/([^\?]+)') {
    $dbUser = $matches[1]
    $dbPassword = $matches[2]
    $dbHost = $matches[3]
    $dbPort = $matches[4]
    $dbName = $matches[5]
    
    Write-Host "🔌 Connection Details:" -ForegroundColor Cyan
    Write-Host "   Host: $dbHost" -ForegroundColor Gray
    Write-Host "   Port: $dbPort" -ForegroundColor Gray
    Write-Host "   Database: $dbName" -ForegroundColor Gray
    Write-Host "   User: $dbUser" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "❌ Error: Invalid DATABASE_URL format" -ForegroundColor Red
    exit 1
}

# Check if database exists
Write-Host "🔍 Checking if database exists..." -ForegroundColor Yellow
$env:PGPASSWORD = $dbPassword
$dbExists = psql -h $dbHost -p $dbPort -U $dbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$dbName'" 2>$null

if ($dbExists -ne "1") {
    Write-Host "📦 Creating database '$dbName'..." -ForegroundColor Yellow
    psql -h $dbHost -p $dbPort -U $dbUser -d postgres -c "CREATE DATABASE $dbName" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Database created successfully" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to create database" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✅ Database already exists" -ForegroundColor Green
}

# Run schema migration
$schemaPath = Join-Path $PSScriptRoot "shared\sql\001_initial_schema.sql"
if (-not (Test-Path $schemaPath)) {
    Write-Host "❌ Error: Schema file not found at $schemaPath" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🚀 Running schema migration..." -ForegroundColor Yellow
Write-Host "   File: 001_initial_schema.sql" -ForegroundColor Gray

psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -f $schemaPath

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Database initialization complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Database Info:" -ForegroundColor Cyan
    Write-Host "   Connection: postgresql://${dbUser}@${dbHost}:${dbPort}/${dbName}" -ForegroundColor Gray
    Write-Host ""
    Write-Host "🔐 Default Admin Login:" -ForegroundColor Cyan
    Write-Host "   Email: admin@samplepos.com" -ForegroundColor Gray
    Write-Host "   Password: admin123" -ForegroundColor Gray
    Write-Host "   ⚠️  Change this password in production!" -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ Schema migration failed" -ForegroundColor Red
    Write-Host "   Check error messages above" -ForegroundColor Yellow
    exit 1
}
