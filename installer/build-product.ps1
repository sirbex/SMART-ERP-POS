# Build full SMART-ERP-POS product bundle (Phase 2).
# Output: installer/dist/product-bundle/
# Flags:
#   -IncludeBackend   also package SamplePOS.Server production build (large)
#   -SkipFrontend     skip vite build
#   -SkipPrintAgent   reuse existing print-service-bundle if present
param(
  [switch]$IncludeBackend,
  [switch]$SkipFrontend,
  [switch]$SkipPrintAgent
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$outRoot = Join-Path $repoRoot 'installer\dist\product-bundle'
$cacheDir = Join-Path $repoRoot 'installer\dist\.cache'
$printBundle = Join-Path $repoRoot 'installer\dist\print-service-bundle'
$nodeVersion = '20.18.1'
$nodeZipName = "node-v$nodeVersion-win-x64.zip"
$nodeUrl = "https://nodejs.org/dist/v$nodeVersion/$nodeZipName"
$winswUrl = 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe'
$productVersion = '2.0.0'

Write-Host '=== Build SMART-ERP-POS product bundle (Phase 2) ===' -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
if (Test-Path $outRoot) { Remove-Item -Recurse -Force $outRoot }
New-Item -ItemType Directory -Force -Path $outRoot | Out-Null

# Shared portable Node at product root
$nodeZip = Join-Path $cacheDir $nodeZipName
if (-not (Test-Path $nodeZip)) {
  Write-Host "Downloading Node $nodeVersion ..."
  Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip
}
$nodeExtract = Join-Path $cacheDir "node-v$nodeVersion-win-x64"
if (-not (Test-Path (Join-Path $nodeExtract 'node.exe'))) {
  if (Test-Path $nodeExtract) { Remove-Item -Recurse -Force $nodeExtract }
  Expand-Archive -Path $nodeZip -DestinationPath $cacheDir -Force
}
$runtimeDir = Join-Path $outRoot 'runtime'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
Copy-Item (Join-Path $nodeExtract 'node.exe') (Join-Path $runtimeDir 'node.exe')

$winswCache = Join-Path $cacheDir 'WinSW-x64.exe'
if (-not (Test-Path $winswCache)) {
  Write-Host 'Downloading WinSW ...'
  Invoke-WebRequest -Uri $winswUrl -OutFile $winswCache
}

# 1) Print Service
if (-not $SkipPrintAgent -or -not (Test-Path $printBundle)) {
  & (Join-Path $repoRoot 'installer\print-service\build-bundle.ps1')
}
Copy-Item -Recurse $printBundle (Join-Path $outRoot 'Print Service')

# 2) Service Helper
$helperSrc = Join-Path $repoRoot 'installer\service-helper'
$helperOut = Join-Path $outRoot 'Service Helper'
$helperApp = Join-Path $helperOut 'app'
New-Item -ItemType Directory -Force -Path $helperApp | Out-Null
Push-Location $helperSrc
try {
  if (-not (Test-Path .\node_modules)) { npm install }
  npm run build
} finally {
  Pop-Location
}
Copy-Item -Recurse (Join-Path $helperSrc 'dist') (Join-Path $helperApp 'dist')
Copy-Item (Join-Path $helperSrc 'package.json') (Join-Path $helperApp 'package.json')
$helperPublic = Join-Path $helperSrc 'public'
if (Test-Path $helperPublic) {
  Copy-Item -Recurse $helperPublic (Join-Path $helperApp 'public')
}
Push-Location $helperApp
try { npm install --omit=dev --no-audit --no-fund } finally { Pop-Location }
New-Item -ItemType Directory -Force -Path (Join-Path $helperOut 'logs') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $helperOut 'runtime') | Out-Null
Copy-Item (Join-Path $runtimeDir 'node.exe') (Join-Path $helperOut 'runtime\node.exe')
Copy-Item $winswCache (Join-Path $helperOut 'SMART Service Helper.exe')
Copy-Item (Join-Path $helperSrc 'SMART-Service-Helper.xml') (Join-Path $helperOut 'SMART Service Helper.xml')

# 3) Frontend static
if (-not $SkipFrontend) {
  $client = Join-Path $repoRoot 'samplepos.client'
  Push-Location $client
  try {
    if (-not (Test-Path .\node_modules)) { npm install }
    npm run build
  } finally {
    Pop-Location
  }
  $feOut = Join-Path $outRoot 'Frontend'
  New-Item -ItemType Directory -Force -Path $feOut | Out-Null
  Copy-Item -Recurse (Join-Path $client 'dist\*') $feOut
}

# 4) Optional Backend
if ($IncludeBackend) {
  Write-Host 'Packaging Backend (this can take several minutes)...' -ForegroundColor Yellow
  $server = Join-Path $repoRoot 'SamplePOS.Server'
  Push-Location $server
  try {
    if (-not (Test-Path .\node_modules)) { npm install }
    npm run build:prod
  } finally {
    Pop-Location
  }
  $beOut = Join-Path $outRoot 'Backend'
  $beApp = Join-Path $beOut 'app'
  New-Item -ItemType Directory -Force -Path $beApp | Out-Null
  Copy-Item -Recurse (Join-Path $server 'dist') (Join-Path $beApp 'dist')
  Copy-Item (Join-Path $server 'package.json') (Join-Path $beApp 'package.json')
  Copy-Item (Join-Path $server 'package-lock.json') (Join-Path $beApp 'package-lock.json') -ErrorAction SilentlyContinue
  # Shared SQL / zod needed at runtime
  $shared = Join-Path $repoRoot 'shared'
  if (Test-Path $shared) {
    Copy-Item -Recurse $shared (Join-Path $beApp 'shared')
  }
  Push-Location $beApp
  try { npm install --omit=dev --no-audit --no-fund } finally { Pop-Location }
  # Embed Frontend so API serves SPA on :3001
  $feSrc = Join-Path $outRoot 'Frontend'
  if (Test-Path $feSrc) {
    $clientDist = Join-Path $beApp 'client-dist'
    New-Item -ItemType Directory -Force -Path $clientDist | Out-Null
    Copy-Item -Recurse (Join-Path $feSrc '*') $clientDist
  }
  New-Item -ItemType Directory -Force -Path (Join-Path $beOut 'runtime') | Out-Null
  Copy-Item (Join-Path $runtimeDir 'node.exe') (Join-Path $beOut 'runtime\node.exe')
  Copy-Item $winswCache (Join-Path $beOut 'SMART ERP Backend.exe')
  @"
<service>
  <id>SMART-ERP-Backend</id>
  <name>SMART ERP Backend</name>
  <description>SMART-ERP-POS API (localhost:3001)</description>
  <executable>%BASE%\runtime\node.exe</executable>
  <arguments>"%BASE%\app\dist\server.js"</arguments>
  <workingdirectory>%BASE%\app</workingdirectory>
  <logpath>%BASE%\logs</logpath>
  <log mode="roll-by-size"><sizeThreshold>4096</sizeThreshold><keepFiles>8</keepFiles></log>
  <env name="NODE_ENV" value="production"/>
  <env name="PORT" value="3001"/>
  <env name="FRONTEND_URL" value="http://127.0.0.1:3001"/>
  <env name="SERVE_FRONTEND" value="1"/>
  <env name="CLIENT_DIST_PATH" value="client-dist"/>
  <onfailure action="restart" delay="10 sec"/>
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
</service>
"@ | Set-Content -Path (Join-Path $beOut 'SMART ERP Backend.xml') -Encoding UTF8
  New-Item -ItemType Directory -Force -Path (Join-Path $beOut 'logs') | Out-Null
  Copy-Item (Join-Path $PSScriptRoot 'env.backend.template') (Join-Path $beApp '.env.template') -ErrorAction SilentlyContinue
}

# 5) SMART ERP.exe desktop shell (Phase 4)
& (Join-Path $repoRoot 'installer\smart-erp-shell\build.ps1')
$shellExe = Join-Path $repoRoot 'installer\smart-erp-shell\dist\SMART ERP.exe'
if (Test-Path $shellExe) {
  Copy-Item $shellExe (Join-Path $outRoot 'SMART ERP.exe')
  Write-Host 'Included SMART ERP.exe launcher' -ForegroundColor Green
} else {
  Write-Host 'SMART ERP.exe not built — Start Menu will use Open-SMART-ERP.vbs' -ForegroundColor Yellow
}

# 6) Launchers + docs
Copy-Item (Join-Path $PSScriptRoot 'Open-SMART-ERP.vbs') (Join-Path $outRoot 'Open-SMART-ERP.vbs')
Copy-Item (Join-Path $PSScriptRoot 'Open-Printer-Setup.vbs') (Join-Path $outRoot 'Open-Printer-Setup.vbs')
Copy-Item (Join-Path $PSScriptRoot 'Open-ERP-Setup.vbs') (Join-Path $outRoot 'Open-ERP-Setup.vbs')
Copy-Item (Join-Path $PSScriptRoot 'Start-PrintService.vbs') (Join-Path $outRoot 'Start-PrintService.vbs')
Copy-Item (Join-Path $repoRoot 'installer\print-service\MANAGER-README.txt') (Join-Path $outRoot 'README.txt') -ErrorAction SilentlyContinue

New-Item -ItemType Directory -Force -Path (Join-Path $outRoot 'config') | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'config\update-channel.example.json') (Join-Path $outRoot 'config\update-channel.example.json')
# Default channel file (empty CDN URL — IT fills or uses local updates/manifest.json)
$channelSrc = Join-Path $PSScriptRoot 'config\update-channel.example.json'
$channelDst = Join-Path $outRoot 'config\update-channel.json'
$channelText = [System.IO.File]::ReadAllText($channelSrc)
[System.IO.File]::WriteAllText($channelDst, $channelText, [System.Text.UTF8Encoding]::new($false))

New-Item -ItemType Directory -Force -Path (Join-Path $outRoot 'updates') | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'manifest.example.json') (Join-Path $outRoot 'updates\manifest.example.json')

$versionPath = Join-Path $outRoot 'version.json'
$versionJson = @{
  productVersion = $productVersion
  printServiceVersion = '1.3.1'
  helperVersion = '1.0.0'
  shellVersion = '2.0.0'
  channel = 'commercial'
  phase = 4
  builtAt = (Get-Date).ToUniversalTime().ToString('o')
  includeBackend = [bool]$IncludeBackend
  hasSmartErpExe = [bool](Test-Path (Join-Path $outRoot 'SMART ERP.exe'))
} | ConvertTo-Json
# UTF-8 without BOM — Node JSON.parse rejects PowerShell's default UTF8 BOM
[System.IO.File]::WriteAllText($versionPath, $versionJson, [System.Text.UTF8Encoding]::new($false))

Write-Host ''
Write-Host "Product bundle ready: $outRoot" -ForegroundColor Green
Write-Host 'Compile installer/SMART-ERP-POS-Setup.iss with Inno Setup 6.'
if (-not $IncludeBackend) {
  Write-Host 'Note: Backend omitted. Re-run with -IncludeBackend for on-prem API packaging.' -ForegroundColor Yellow
}
