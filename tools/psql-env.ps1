<#
SYNOPSIS
  psql wrapper that reads DB credentials from .env (no Windows password required).

DESCRIPTION
  - Looks for credentials in a few standard places (not committed to Git):
      1) SamplePOS.Server/.env.local
      2) SamplePOS.Server/.env
      3) ./.env
      4) %USERPROFILE%/.samplepos-db.env
  - Supports keys: PGPASSWORD, POSTGRES_PASSWORD, PGUSER, PGHOST, PGPORT, PGDATABASE, DATABASE_URL
  - If DATABASE_URL is provided, it will be parsed for user, password, host, port, db
  - Exports PGPASSWORD only for the child psql process and then clears it

USAGE
  # Basic: rely on .env for connection info and run a command
  .\tools\psql-env.ps1 -- -c "SELECT version()"

  # Override or provide flags explicitly
  .\tools\psql-env.ps1 -- -h localhost -p 5432 -U postgres -d pos_system -c "\\d users"

  # Example .env content (keep this out of Git):
  # PGPASSWORD=password
  # PGUSER=postgres
  # PGHOST=localhost
  # PGPORT=5432
  # PGDATABASE=pos_system
  # or a single DATABASE_URL=postgresql://postgres:password@localhost:5432/pos_system
#>
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

$ErrorActionPreference = 'Stop'

function Parse-DotEnvFile {
  param([string]$Path)
  $map = @{}
  if (-not (Test-Path $Path)) { return $map }
  Get-Content -Path $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line) { return }
    if ($line.StartsWith('#')) { return }
    $idx = $line.IndexOf('=')
    if ($idx -lt 1) { return }
    $key = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx+1).Trim().Trim('"')
    if ($key) { $map[$key] = $val }
  }
  return $map
}

# Probe locations (most specific first)
$repoRoot = Split-Path -Parent $PSScriptRoot
$paths = @(
  Join-Path $repoRoot 'SamplePOS.Server/.env.local'),
  (Join-Path $repoRoot 'SamplePOS.Server/.env'),
  (Join-Path $repoRoot '.env'),
  (Join-Path $env:USERPROFILE '.samplepos-db.env')

# Merge maps (first wins)
$cfg = @{}
foreach ($p in $paths) {
  $m = Parse-DotEnvFile -Path $p
  foreach ($k in $m.Keys) { if (-not $cfg.ContainsKey($k)) { $cfg[$k] = $m[$k] } }
}

# Extract from DATABASE_URL if present
if ($cfg.ContainsKey('DATABASE_URL')) {
  $url = $cfg['DATABASE_URL']
  if ($url -match 'postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/([^?]+)') {
    $cfg['PGUSER']     = $cfg['PGUSER']     ?? $matches[1]
    $cfg['PGPASSWORD'] = $cfg['PGPASSWORD'] ?? $matches[2]
    $cfg['PGHOST']     = $cfg['PGHOST']     ?? $matches[3]
    $cfg['PGPORT']     = $cfg['PGPORT']     ?? $matches[4]
    $cfg['PGDATABASE'] = $cfg['PGDATABASE'] ?? $matches[5]
  }
}

# Resolve password
$pwd = $null
if ($cfg.ContainsKey('PGPASSWORD')) { $pwd = $cfg['PGPASSWORD'] }
elseif ($cfg.ContainsKey('POSTGRES_PASSWORD')) { $pwd = $cfg['POSTGRES_PASSWORD'] }

# Defaults (avoid PowerShell automatic variable $Host)
$pgHost = $cfg['PGHOST']     ?? 'localhost'
$pgPort = $cfg['PGPORT']     ?? '5432'
$pgUser = $cfg['PGUSER']     ?? 'postgres'
$pgDb   = $cfg['PGDATABASE'] ?? 'pos_system'

# Determine if user supplied explicit connection flags
$hasConnFlags = $false
foreach ($flag in @('-h','--host','-p','--port','-U','--username','-d','--dbname')) {
  if ($Args -contains $flag) { $hasConnFlags = $true; break }
}

# Build final args
$finalArgs = @()
if (-not $hasConnFlags) { $finalArgs += @('-h', $pgHost, '-p', $pgPort, '-U', $pgUser, '-d', $pgDb) }
if ($Args) { $finalArgs += $Args }

if (-not $pwd) {
  Write-Host 'No password found in .env files. You can add PGPASSWORD=... or POSTGRES_PASSWORD=... to an ignored .env file.' -ForegroundColor Yellow
  Write-Host 'Proceeding without PGPASSWORD; psql may prompt if server requires a password.' -ForegroundColor Yellow
}

# Export for child only
if ($pwd) { $env:PGPASSWORD = $pwd }
try {
  & psql @finalArgs
  exit $LASTEXITCODE
} finally {
  if ($pwd) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
}
