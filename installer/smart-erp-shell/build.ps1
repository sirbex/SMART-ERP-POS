# Build SMART ERP.exe (Phase 4 desktop launcher).
# Requires .NET 8 SDK. Falls back gracefully if missing (bundle keeps VBS launcher).
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$outDir = Join-Path $here 'dist'
$proj = Join-Path $here 'SmartErp.Shell.csproj'

Write-Host '=== Build SMART ERP.exe shell ===' -ForegroundColor Cyan

$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if (-not $dotnet) {
  Write-Host 'dotnet SDK not found — skipping SMART ERP.exe (VBS launcher remains).' -ForegroundColor Yellow
  exit 0
}

if (Test-Path $outDir) { Remove-Item -Recurse -Force $outDir }
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Push-Location $here
try {
  dotnet publish $proj -c Release -r win-x64 --self-contained false `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -o $outDir
} finally {
  Pop-Location
}

$exe = Join-Path $outDir 'SMART ERP.exe'
if (-not (Test-Path $exe)) { throw "Publish failed: $exe missing" }
Write-Host "Built: $exe" -ForegroundColor Green
