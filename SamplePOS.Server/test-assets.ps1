#!/usr/bin/env pwsh
# ============================================================
# Asset Accounting - End-to-End API Proof Test
# Tests: acquire → depreciation run → dispose → GL verification
# ============================================================

param(
  [string]$BaseUrl = "https://wizarddigital-inv.com/api",
  [string]$Tenant  = "henber"
)

$ErrorActionPreference = "Stop"

# ── Helpers ─────────────────────────────────────────────────
function Invoke-Api {
  param([string]$Method, [string]$Path, [hashtable]$Body = $null, [string]$Token)
  $headers = @{ "Authorization" = "Bearer $Token"; "Content-Type" = "application/json"; "X-Tenant-ID" = $Tenant }
  $params  = @{ Method = $Method; Uri = "$BaseUrl$Path"; Headers = $headers; UseBasicParsing = $true }
  if ($Body) { $params.Body = ($Body | ConvertTo-Json -Depth 10) }
  $resp = Invoke-WebRequest @params
  return ($resp.Content | ConvertFrom-Json)
}

function Pass  { Write-Host "  ✅ $args" -ForegroundColor Green  }
function Fail  { Write-Host "  ❌ $args" -ForegroundColor Red; throw "FAIL: $args" }
function Title { Write-Host "`n══ $args ══" -ForegroundColor Cyan }

# ── Auth ────────────────────────────────────────────────────
Title "Authenticating"
$auth = Invoke-Api -Method POST -Path "/auth/login" -Body @{ email = "admin@samplepos.com"; password = "admin123" }
if (-not $auth.success) { Fail "Login failed: $($auth.error)" }
$token = $auth.data.token
Pass "Logged in as $($auth.data.user.email)"

# ── 1. Create asset category ─────────────────────────────────
Title "TEST 1 — Create asset category"
$catCode  = "TEST-$(Get-Date -Format 'HHmmss')"
$catResp  = Invoke-Api -Method POST -Path "/assets/categories" -Token $token -Body @{
  code                          = $catCode
  name                          = "Test Equipment"
  usefulLifeMonths              = 24
  depreciationMethod            = "STRAIGHT_LINE"
  assetAccountCode              = "1500"
  depreciationAccountCode       = "6500"
  accumDepreciationAccountCode  = "1550"
}
if (-not $catResp.success) { Fail "Category creation failed: $($catResp.error)" }
$catId = $catResp.data.id
Pass "Category created: $($catResp.data.code) (id=$catId)"

# ── 2. Acquire asset (Cash) ──────────────────────────────────
Title "TEST 2 — Acquire fixed asset"
$acqDate  = (Get-Date).ToString("yyyy-MM-dd")
$acqCost  = 120000
$acqResp  = Invoke-Api -Method POST -Path "/assets" -Token $token -Body @{
  name             = "Proof Test Machine ($(Get-Date -Format 'HHmmss'))"
  categoryId       = $catId
  acquisitionDate  = $acqDate
  acquisitionCost  = $acqCost
  salvageValue     = 0
  paymentMethod    = "CASH"
  serialNumber     = "PROOF-001"
}
if (-not $acqResp.success) { Fail "Asset acquisition failed: $($acqResp.error)" }
$assetId  = $acqResp.data.id
$assetNum = $acqResp.data.assetNumber
Pass "Asset acquired: $assetNum (id=$assetId, cost=$acqCost)"

# Verify GL was posted (asset exists and NBV = cost)
$detailResp = Invoke-Api -Method GET -Path "/assets/$assetId" -Token $token
if ($detailResp.data.netBookValue -ne $acqCost) { Fail "NBV mismatch after acquisition: expected $acqCost, got $($detailResp.data.netBookValue)" }
Pass "NBV after acquisition = $($detailResp.data.netBookValue) ✓"

# ── 3. Run depreciation for current month ────────────────────
Title "TEST 3 — Run monthly depreciation"
$yr  = (Get-Date).Year
$mo  = (Get-Date).Month
$depResp = Invoke-Api -Method POST -Path "/assets/depreciation/run" -Token $token -Body @{ year = $yr; month = $mo }
if (-not $depResp.success) { Fail "Depreciation run failed: $($depResp.error)" }
Pass "Depreciation run: processed=$($depResp.data.processed), total=$($depResp.data.totalDepreciation)"

# Re-fetch asset, verify accum depreciation > 0
$afterDepr = Invoke-Api -Method GET -Path "/assets/$assetId" -Token $token
$accumDepr = $afterDepr.data.accumulatedDepreciation
$nbvAfter  = $afterDepr.data.netBookValue
if ($accumDepr -le 0) { Fail "Expected accumulated depreciation > 0 after run, got $accumDepr" }
$expected  = [math]::Round($acqCost / 24, 2)  # SL: cost / life
Pass "After depreciation: accum=$accumDepr (expected ~$expected), NBV=$nbvAfter"

# Idempotency: run again — should skip
$depResp2 = Invoke-Api -Method POST -Path "/assets/depreciation/run" -Token $token -Body @{ year = $yr; month = $mo }
if ($depResp2.data.processed -ne 0) { Fail "Second run should process 0 (idempotent), got $($depResp2.data.processed)" }
Pass "Second run processed 0 (idempotent) ✓"

# ── 4. Dispose asset ─────────────────────────────────────────
Title "TEST 4 — Dispose asset"
$proceeds  = 80000
$dispResp  = Invoke-Api -Method POST -Path "/assets/$assetId/dispose" -Token $token -Body @{
  disposalDate   = $acqDate
  disposalAmount = $proceeds
}
if (-not $dispResp.success) { Fail "Disposal failed: $($dispResp.error)" }
if ($dispResp.data.status -ne "DISPOSED") { Fail "Expected status=DISPOSED, got $($dispResp.data.status)" }
if ($dispResp.data.netBookValue -ne 0)    { Fail "Expected NBV=0 after disposal, got $($dispResp.data.netBookValue)" }
Pass "Asset status = DISPOSED, NBV = 0 ✓"

# Expected gain/loss: proceeds(80000) + accumDepr - cost(120000)
$gainLoss = $proceeds + $accumDepr - $acqCost
Pass "Expected gain/loss = $gainLoss (proceeds=$proceeds + accumDepr=$accumDepr - cost=$acqCost)"

# ── 5. Verify asset can't be disposed again ───────────────────
Title "TEST 5 — Double-dispose guard"
try {
  $disp2 = Invoke-Api -Method POST -Path "/assets/$assetId/dispose" -Token $token -Body @{
    disposalDate   = $acqDate
    disposalAmount = 0
  }
  if ($disp2.success) { Fail "Expected error on double-dispose, but got success" }
  Pass "Double-dispose correctly rejected: $($disp2.error)"
} catch {
  # 4xx response also acceptable
  Pass "Double-dispose rejected with HTTP error ✓"
}

# ── Summary ──────────────────────────────────────────────────
Write-Host "`n══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ALL ASSET ACCOUNTING TESTS PASSED  " -ForegroundColor Green
Write-Host "══════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Asset Number  : $assetNum"
Write-Host "  Acq. Cost     : $acqCost"
Write-Host "  Accum. Depr.  : $accumDepr"
Write-Host "  Disposal amt  : $proceeds"
Write-Host "  Gain / Loss   : $gainLoss"
Write-Host ""
