# Step 4 — Post-deploy financial smoke (production API + DB)
# Usage: .\scripts\run-step4-post-deploy-smoke.ps1

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

. (Join-Path $Root 'scripts\load-proof-production-env.ps1')

Write-Host "`nVerifying Step 4 credentials..."
node scripts/verify-proof-production-env.mjs --step 4
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$EvidenceDir = Join-Path $Root 'release-evidence\step4-post-deploy-smoke'
New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null

$Ts = Get-Date -Format 'yyyy-MM-ddTHH-mm-ss'
$Log = Join-Path $EvidenceDir "post-deploy-smoke-$Ts.log"

Write-Host "`nRunning post-deploy financial smoke..."
npm run proof:post-deploy-smoke 2>&1 | Tee-Object -FilePath $Log
$Exit = $LASTEXITCODE

Copy-Item -Force $Log (Join-Path $Root 'release-evidence\post-deploy-smoke.log') -ErrorAction SilentlyContinue

if ($Exit -ne 0) { exit $Exit }

Write-Host "`nStep 4 complete."
Write-Host "  Log: release-evidence/step4-post-deploy-smoke/post-deploy-smoke-$Ts.log"
