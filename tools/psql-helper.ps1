<#
.SYNOPSIS
  Secure, zero-prompt psql helper for Windows/PowerShell.

.DESCRIPTION
  Stores the Postgres password encrypted with DPAPI under the current user profile
  and injects it only for the lifetime of the psql command via PGPASSWORD.

  Benefits vs pgpass.conf:
  - No plain-text password on disk
  - No ACL gymnastics
  - Works for both interactive and scripted use

.USAGE
  # 1) Save password once (encrypted to your user)
  .\tools\psql-helper.ps1; Set-DbPassword  # prompts securely

  # 2) Run psql without prompts (defaults shown)
  .\tools\psql-helper.ps1 -- -c "\\d users"

  # 3) Override connection parameters when needed
  .\tools\psql-helper.ps1 -- -h localhost -p 5432 -U postgres -d pos_system -c "SELECT 1" 

  # Dot-source to use functions in your session
  . .\tools\psql-helper.ps1
  Invoke-Psql -Db pos_system -PsqlArgs @('-c','SELECT 1')

.NOTES
  - Password is stored at: %APPDATA%\SamplePOS\secrets\pg_pos_system.sec (user+machine protected)
  - PGPASSWORD is set only for the child psql process and cleared afterward
  - For CI, you can set PGPASSWORD as an environment secret instead
#>
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $Args
)

$ErrorActionPreference = 'Stop'

$secretRoot = Join-Path $env:APPDATA 'SamplePOS\secrets'
$secretFile = Join-Path $secretRoot 'pg_pos_system.sec'

function Set-DbPassword {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $false)]
    [SecureString] $Password
  )

  if (-not $Password) {
    $Password = Read-Host -AsSecureString 'Enter PostgreSQL password'
  }

  if (-not (Test-Path $secretRoot)) {
    New-Item -Path $secretRoot -ItemType Directory -Force | Out-Null
  }

  $Password | ConvertFrom-SecureString | Set-Content -Path $secretFile -Force
  Write-Host "Saved encrypted DB password to $secretFile (protected by Windows DPAPI)." -ForegroundColor Green
}

function Get-DbPassword {
  [CmdletBinding()]
  param()

  if (-not (Test-Path $secretFile)) { return $null }
  try {
    $secure = Get-Content $secretFile | ConvertTo-SecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  } catch {
    Write-Verbose "Failed to decrypt stored password: $($_.Exception.Message)"
    return $null
  }
}

function Invoke-Psql {
  [CmdletBinding()]
  param(
    [string] $User = 'postgres',
    [string] $Db   = 'pos_system',
    [string] $Host = 'localhost',
    [int]    $Port = 5432,
    [string[]] $PsqlArgs
  )

  $pwd = Get-DbPassword
  if (-not $pwd) {
    Write-Host "No saved DB password found. You'll be prompted once and it will be saved encrypted." -ForegroundColor Yellow
    $sec = Read-Host -AsSecureString 'Enter PostgreSQL password'
    Set-DbPassword -Password $sec
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    try {
      $pwd = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  }

  # Set for child process only
  $env:PGPASSWORD = $pwd
  try {
    if ($PsqlArgs -and $PsqlArgs.Count -gt 0) {
      & psql -h $Host -p $Port -U $User -d $Db @PsqlArgs
    } else {
      & psql -h $Host -p $Port -U $User -d $Db
    }
    exit $LASTEXITCODE
  } finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
}

# If executed directly (not dot-sourced), call psql forwarding args
if ($MyInvocation.InvocationName -ne '.') {
  Invoke-Psql -PsqlArgs $Args
}
