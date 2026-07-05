# Step 3 — Henber AP/AR drift decomposition (production DB, read-only)
# Usage: .\scripts\run-step3-henber-decompose.ps1

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

. (Join-Path $Root 'scripts\load-proof-production-env.ps1')

Write-Host "`nVerifying Step 3 credentials..."
node scripts/verify-proof-production-env.mjs --step 3
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$EvidenceDir = Join-Path $Root 'release-evidence\step3-henber-decompose'
New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null

$Ts = Get-Date -Format 'yyyy-MM-ddTHH-mm-ss'
$ApLog = Join-Path $EvidenceDir "ap-decompose-$Ts.log"
$ArLog = Join-Path $EvidenceDir "ar-decompose-$Ts.log"

Write-Host "`nRunning AP drift decomposition..."
npm run proof:henber:ap-decompose 2>&1 | Tee-Object -FilePath $ApLog
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nRunning AR drift decomposition..."
npm run proof:henber:ar-decompose 2>&1 | Tee-Object -FilePath $ArLog
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Copy-Item -Force (Join-Path $Root 'PROOF_AP_DRIFT_DECOMPOSE.md') $EvidenceDir
Copy-Item -Force (Join-Path $Root 'PROOF_AR_DRIFT_DECOMPOSE.md') $EvidenceDir

Write-Host "`nStep 3 complete."
Write-Host "  Reports: PROOF_AP_DRIFT_DECOMPOSE.md, PROOF_AR_DRIFT_DECOMPOSE.md"
Write-Host "  Archive: release-evidence/step3-henber-decompose/"
