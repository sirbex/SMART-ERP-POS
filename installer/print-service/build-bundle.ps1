# Build a self-contained SMART Print Service bundle (no system Node required at runtime).
# Output: installer/dist/print-service-bundle/
$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$agentRoot = Join-Path $repoRoot 'smart-print-agent'
$outRoot = Join-Path $repoRoot 'installer\dist\print-service-bundle'
$cacheDir = Join-Path $repoRoot 'installer\dist\.cache'
$nodeVersion = '20.18.1'
$nodeZipName = "node-v$nodeVersion-win-x64.zip"
$nodeUrl = "https://nodejs.org/dist/v$nodeVersion/$nodeZipName"
$winswUrl = 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe'

Write-Host '=== Build SMART Print Service bundle ===' -ForegroundColor Cyan
Write-Host "Agent: $agentRoot"
Write-Host "Out:   $outRoot"

New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
if (Test-Path $outRoot) { Remove-Item -Recurse -Force $outRoot }
New-Item -ItemType Directory -Force -Path $outRoot | Out-Null

# 1) Compile TypeScript agent
Push-Location $agentRoot
try {
  if (-not (Test-Path .\node_modules)) { npm install }
  npm run build
  if (-not (Test-Path .\dist\index.js)) { throw 'Build failed: dist/index.js missing' }
} finally {
  Pop-Location
}

# 2) App payload
$appDir = Join-Path $outRoot 'app'
New-Item -ItemType Directory -Force -Path $appDir | Out-Null
Copy-Item -Recurse (Join-Path $agentRoot 'dist') (Join-Path $appDir 'dist')
Copy-Item (Join-Path $agentRoot 'package.json') (Join-Path $appDir 'package.json')
Copy-Item (Join-Path $agentRoot 'package-lock.json') (Join-Path $appDir 'package-lock.json') -ErrorAction SilentlyContinue

$publicSrc = Join-Path $agentRoot 'public'
if (Test-Path $publicSrc) {
  Copy-Item -Recurse $publicSrc (Join-Path $appDir 'public')
}

Push-Location $appDir
try {
  npm install --omit=dev --no-audit --no-fund
} finally {
  Pop-Location
}

New-Item -ItemType Directory -Force -Path (Join-Path $outRoot 'config') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $outRoot 'logs') | Out-Null
# Prefer config/logs next to app for agent path resolution
New-Item -ItemType Directory -Force -Path (Join-Path $appDir 'config') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $appDir 'logs') | Out-Null

# 3) Portable Node runtime
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
# Minimal LICENSE notice
Copy-Item (Join-Path $nodeExtract 'LICENSE') (Join-Path $runtimeDir 'NODE-LICENSE') -ErrorAction SilentlyContinue

# 4) WinSW service wrapper
$winswCache = Join-Path $cacheDir 'WinSW-x64.exe'
if (-not (Test-Path $winswCache)) {
  Write-Host 'Downloading WinSW ...'
  Invoke-WebRequest -Uri $winswUrl -OutFile $winswCache
}
Copy-Item $winswCache (Join-Path $outRoot 'SMART Print Service.exe')
Copy-Item (Join-Path $PSScriptRoot 'SMART-Print-Service.xml') (Join-Path $outRoot 'SMART Print Service.xml')

# 5) User-facing launchers (no PowerShell window)
Copy-Item (Join-Path $PSScriptRoot 'Start-PrintService.vbs') (Join-Path $outRoot 'Start-PrintService.vbs')
Copy-Item (Join-Path $PSScriptRoot 'Open-Printer-Setup.vbs') (Join-Path $outRoot 'Open-Printer-Setup.vbs')
Copy-Item (Join-Path $PSScriptRoot 'MANAGER-README.txt') (Join-Path $outRoot 'README.txt')

# Marker for health / diagnostics (UTF-8 without BOM — Node JSON.parse rejects BOM)
$metaJson = @{
  channel = 'commercial'
  bundledNode = $true
  builtAt = (Get-Date).ToUniversalTime().ToString('o')
  agentVersion = (Get-Content (Join-Path $agentRoot 'package.json') | ConvertFrom-Json).version
} | ConvertTo-Json
[System.IO.File]::WriteAllText(
  (Join-Path $appDir 'install-meta.json'),
  $metaJson,
  [System.Text.UTF8Encoding]::new($false)
)

Write-Host ''
Write-Host 'Bundle ready:' -ForegroundColor Green
Write-Host "  $outRoot"
Write-Host 'Next: compile installer/SMART-ERP-POS-PrintService.iss with Inno Setup 6.'
