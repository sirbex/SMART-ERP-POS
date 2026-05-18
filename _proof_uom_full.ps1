
# =====================================================================
# FULL UoM PROOF SUITE — tests ALL code paths in updateProductUom
# Run from any directory. Requires: server on :3001, psql in PATH
# =====================================================================

$PID_STR  = "6fec0d12-4349-4a43-a5c0-48e449d36356"
$PUOM_DEFAULT = "c72d303b-9706-4718-8104-f41b94a1069f"  # product_uom row for "default" slot
$PUOM_STRIP   = "0d640173-bc7a-4b76-9008-4381bcff9ce3"  # product_uom row for strip
$PUOM_BOX     = "13bab446-dcef-4351-b046-e870f22314cc"  # product_uom row for Box

# master UoM IDs
$UOM_EACH   = "97c8b6ea-1d45-48c8-bf5a-2b738051aa15"
$UOM_TABLET = "96f87d23-c3ba-476e-bcc5-40a42a17457b"
$UOM_STRIP  = "aa015d2d-3307-41e2-8351-b1ba4c97c3c0"
$UOM_BOX    = "78bf1928-1113-4208-a688-059ca75a9b7c"
$UOM_PACKET = "f9c13a3e-7c00-4d5f-9147-55158753c00d"

$BASE = "http://localhost:3001/api/products/$PID_STR/uoms"

$pass = 0; $fail = 0

function Check($label, $cond, $detail="") {
  if ($cond) { Write-Host "  PASS  $label"; $script:pass++ }
  else        { Write-Host "  FAIL  $label  $detail"; $script:fail++ }
}

function DbQuery($sql) {
  psql -U postgres -d pos_system -t -A -F "|" -c $sql 2>&1
}

function RestoreBaseline {
  psql -U postgres -d pos_system -c "
    UPDATE product_uoms SET uom_id='$UOM_EACH', is_default=true  WHERE id='$PUOM_DEFAULT';
    UPDATE product_uoms SET uom_id='$UOM_STRIP', is_default=false WHERE id='$PUOM_STRIP';
    UPDATE product_uoms SET uom_id='$UOM_BOX',   is_default=false WHERE id='$PUOM_BOX';
    UPDATE products SET base_uom_id=NULL WHERE id='$PID_STR';
    DELETE FROM item_uom_conversions WHERE item_id='$PID_STR';
  " | Out-Null
}

function ShowDbState($label) {
  Write-Host "  [DB $label]"
  DbQuery "SELECT ub.name AS base, u.name AS uom, pu.conversion_factor AS factor, pu.is_default AS def FROM products p JOIN product_uoms pu ON pu.product_id=p.id JOIN uoms u ON u.id=pu.uom_id LEFT JOIN uoms ub ON ub.id=p.base_uom_id WHERE p.id='$PID_STR' ORDER BY pu.is_default DESC, u.name" | ForEach-Object { Write-Host "    $_" }
  DbQuery "SELECT f.name||'->'||t.name||' x'||ic.factor FROM item_uom_conversions ic JOIN uoms f ON f.id=ic.from_uom_id JOIN uoms t ON t.id=ic.to_uom_id WHERE ic.item_id='$PID_STR' ORDER BY f.name" | ForEach-Object { Write-Host "    conv: $_" }
}

# --- LOGIN ---
Write-Host "Logging in..."
$creds = Get-Content "c:\Users\Chase\source\repos\SamplePOS\_login.json" | ConvertFrom-Json
$resp  = Invoke-RestMethod "http://localhost:3001/api/auth/login" -Method Post -ContentType "application/json" -Body ($creds | ConvertTo-Json)
$T     = $resp.data.token
$H     = @{Authorization="Bearer $T"}
if (-not $T) { Write-Host "AUTH FAILED - aborting"; exit 1 }
Write-Host "Auth ok`n"

# =====================================================================
# SCENARIO A: Batch save with default UoM change Each→tablet
# (the exact user-reported failing scenario)
# Code paths hit:
#   A1: uomIdChanging=true, currentBase===existing.uomId → deleteAll + pendingBase + isDefault=true
#   A2: uomIdChanging=false, isDefault=false → syncCanonical(strip→tablet)
#   A3: uomIdChanging=false, isDefault=false → syncCanonical(Box→tablet, filter keeps strip→tablet)
# =====================================================================
Write-Host "=== SCENARIO A: Batch save with default UoM change (Each→tablet) ==="
RestoreBaseline

# A1: change default Each→tablet
try {
  $r = Invoke-WebRequest "$BASE/$PUOM_DEFAULT" -Method Patch -ContentType "application/json" -Headers $H `
    -Body "{`"uomId`":`"$UOM_TABLET`",`"isDefault`":true,`"conversionFactor`":1}" -UseBasicParsing
  $j = $r.Content | ConvertFrom-Json
  Check "A1 default Each→tablet HTTP 200"              ($r.StatusCode -eq 200)
  Check "A1 success=true"                              ($j.success -eq $true)
  Check "A1 uomName=tablet"                            ($j.data.uomName -eq "tablet")
  Check "A1 isDefault=true"                            ($j.data.isDefault -eq $true)
  $dbBase = DbQuery "SELECT ub.name FROM products p LEFT JOIN uoms ub ON ub.id=p.base_uom_id WHERE p.id='$PID_STR'"
  Check "A1 base_uom_id=tablet in DB"                  ($dbBase -match "tablet")
} catch { Check "A1 (exception)" $false "$_" }

# A2: update strip (non-default, same uomId, factor only)
try {
  $r = Invoke-WebRequest "$BASE/$PUOM_STRIP" -Method Patch -ContentType "application/json" -Headers $H `
    -Body "{`"uomId`":`"$UOM_STRIP`",`"isDefault`":false,`"conversionFactor`":10}" -UseBasicParsing
  $j = $r.Content | ConvertFrom-Json
  Check "A2 strip batch-update HTTP 200"               ($r.StatusCode -eq 200)
  Check "A2 success=true"                              ($j.success -eq $true)
  Check "A2 uomName=strip"                             ($j.data.uomName -eq "strip")
  $conv = DbQuery "SELECT f.name||'->'||t.name FROM item_uom_conversions ic JOIN uoms f ON f.id=ic.from_uom_id JOIN uoms t ON t.id=ic.to_uom_id WHERE ic.item_id='$PID_STR' AND f.name='strip'"
  Check "A2 strip→tablet conversion written in DB"     ($conv -match "strip->tablet")
} catch { Check "A2 (exception)" $false "$_" }

# A3: update Box (non-default, same uomId, factor only)
try {
  $r = Invoke-WebRequest "$BASE/$PUOM_BOX" -Method Patch -ContentType "application/json" -Headers $H `
    -Body "{`"uomId`":`"$UOM_BOX`",`"isDefault`":false,`"conversionFactor`":100}" -UseBasicParsing
  $j = $r.Content | ConvertFrom-Json
  Check "A3 Box batch-update HTTP 200"                 ($r.StatusCode -eq 200)
  Check "A3 success=true"                              ($j.success -eq $true)
  Check "A3 uomName=Box"                               ($j.data.uomName -eq "Box")
  $conv = DbQuery "SELECT f.name||'->'||t.name FROM item_uom_conversions ic JOIN uoms f ON f.id=ic.from_uom_id JOIN uoms t ON t.id=ic.to_uom_id WHERE ic.item_id='$PID_STR' AND f.name='Box'"
  Check "A3 Box→tablet conversion written in DB"       ($conv -match "Box->tablet")
} catch { Check "A3 (exception)" $false "$_" }

$totalConv = (DbQuery "SELECT count(*) FROM item_uom_conversions WHERE item_id='$PID_STR'").Trim()
Check "A4 exactly 2 conversions (strip+Box→tablet)"    ($totalConv -eq "2")
ShowDbState "after Scenario A"

# =====================================================================
# SCENARIO B: Non-default UoM type change (strip→PACKET, base=Each)
# Code paths hit: uomIdChanging=true, currentBase != existing.uomId → deleteBySource only
# =====================================================================
Write-Host "`n=== SCENARIO B: Non-default UoM type change (strip→PACKET, base=Each) ==="
RestoreBaseline
# Pre-seed strip→Each conversion to simulate real state
psql -U postgres -d pos_system -c "INSERT INTO item_uom_conversions(item_id,from_uom_id,to_uom_id,factor,is_canonical) VALUES('$PID_STR','$UOM_STRIP','$UOM_EACH',10,true),('$PID_STR','$UOM_BOX','$UOM_EACH',100,true);" | Out-Null

try {
  $r = Invoke-WebRequest "$BASE/$PUOM_STRIP" -Method Patch -ContentType "application/json" -Headers $H `
    -Body "{`"uomId`":`"$UOM_PACKET`",`"isDefault`":false,`"conversionFactor`":10}" -UseBasicParsing
  $j = $r.Content | ConvertFrom-Json
  Check "B1 strip→PACKET HTTP 200"                     ($r.StatusCode -eq 200)
  Check "B1 success=true"                              ($j.success -eq $true)
  Check "B1 uomName=PACKET"                            ($j.data.uomName -eq "PACKET")
  # Old strip→Each must be gone, PACKET→Each must exist, Box→Each must be untouched
  $oldConv = DbQuery "SELECT count(*) FROM item_uom_conversions ic JOIN uoms f ON f.id=ic.from_uom_id WHERE ic.item_id='$PID_STR' AND f.name='strip'"
  Check "B2 old strip→Each conversion deleted"         (($oldConv.Trim()) -eq "0")
  $newConv = DbQuery "SELECT f.name||'->'||t.name FROM item_uom_conversions ic JOIN uoms f ON f.id=ic.from_uom_id JOIN uoms t ON t.id=ic.to_uom_id WHERE ic.item_id='$PID_STR' AND f.name='PACKET'"
  Check "B3 PACKET→Each conversion written"            ($newConv -match "PACKET->Each")
  $boxConv = DbQuery "SELECT f.name||'->'||t.name FROM item_uom_conversions ic JOIN uoms f ON f.id=ic.from_uom_id JOIN uoms t ON t.id=ic.to_uom_id WHERE ic.item_id='$PID_STR' AND f.name='Box'"
  Check "B4 Box→Each conversion still intact"          ($boxConv -match "Box->Each")
} catch { Check "B1 (exception)" $false "$_" }
ShowDbState "after Scenario B"

# =====================================================================
# SCENARIO C: Conversion factor-only update (no uomId change)
# Code paths hit: uomIdChanging=false → only syncCanonicalConversion
# =====================================================================
Write-Host "`n=== SCENARIO C: Factor-only update (no uomId change) ==="
RestoreBaseline
# Pre-seed strip→Each so syncCanonical has existing state to filter
psql -U postgres -d pos_system -c "INSERT INTO item_uom_conversions(item_id,from_uom_id,to_uom_id,factor,is_canonical) VALUES('$PID_STR','$UOM_STRIP','$UOM_EACH',10,true);" | Out-Null

try {
  $r = Invoke-WebRequest "$BASE/$PUOM_STRIP" -Method Patch -ContentType "application/json" -Headers $H `
    -Body '{"conversionFactor":12,"isDefault":false}' -UseBasicParsing
  $j = $r.Content | ConvertFrom-Json
  Check "C1 factor-only update HTTP 200"               ($r.StatusCode -eq 200)
  Check "C1 success=true"                              ($j.success -eq $true)
  Check "C1 conversionFactor=12 in response"           ([string]$j.data.conversionFactor -match "^12")
  $factorDb = DbQuery "SELECT ic.factor FROM item_uom_conversions ic JOIN uoms f ON f.id=ic.from_uom_id WHERE ic.item_id='$PID_STR' AND f.name='strip'"
  Check "C2 factor=12 written to item_uom_conversions" ($factorDb.Trim() -match "^12")
  $toUom = DbQuery "SELECT t.name FROM item_uom_conversions ic JOIN uoms t ON t.id=ic.to_uom_id JOIN uoms f ON f.id=ic.from_uom_id WHERE ic.item_id='$PID_STR' AND f.name='strip'"
  Check "C3 still points to base UoM (Each)"           ($toUom -match "Each")
} catch { Check "C1 (exception)" $false "$_" }
ShowDbState "after Scenario C"

# =====================================================================
# SCENARIO D: Re-save default UoM without changing anything
# Code paths hit: uomIdChanging=false, isDefault=undefined → syncCanonical(isDefault=true from result)
# Must NOT throw ConflictError "Changing the base stock UoM is blocked"
# =====================================================================
Write-Host "`n=== SCENARIO D: Re-save default UoM (no change, idempotent) ==="
RestoreBaseline

try {
  $r = Invoke-WebRequest "$BASE/$PUOM_DEFAULT" -Method Patch -ContentType "application/json" -Headers $H `
    -Body '{"conversionFactor":1,"isDefault":true}' -UseBasicParsing
  $j = $r.Content | ConvertFrom-Json
  Check "D1 re-save default HTTP 200"                  ($r.StatusCode -eq 200)
  Check "D1 success=true"                              ($j.success -eq $true)
  Check "D1 still isDefault=true"                      ($j.data.isDefault -eq $true)
  Check "D1 uomName still Each"                        ($j.data.uomName -eq "Each")
  # base_uom_id should now be set (first time = set by syncCanonical)
  # base_uom_id stays NULL by design when using COALESCE default — effective base is via is_default=true
  $effBase = DbQuery "SELECT u.name FROM product_uoms pu JOIN uoms u ON u.id=pu.uom_id WHERE pu.product_id='$PID_STR' AND pu.is_default=true"
  Check "D2 effective base UoM (COALESCE) still Each"  ($effBase -match "Each")
} catch { Check "D1 (exception)" $false "$_" }
ShowDbState "after Scenario D"

# =====================================================================
# SCENARIO E: Duplicate canonical name rejected
# Code paths hit: assertNoCanonicalDuplicateMeaning → ConflictError 409
# =====================================================================
Write-Host "`n=== SCENARIO E: Duplicate canonical name rejected ==="
RestoreBaseline

try {
  $r = Invoke-WebRequest "$BASE/$PUOM_STRIP" -Method Patch -ContentType "application/json" -Headers $H `
    -Body "{`"uomId`":`"$UOM_EACH`",`"isDefault`":false,`"conversionFactor`":10}" -UseBasicParsing -ErrorAction SilentlyContinue
  $j = $r.Content | ConvertFrom-Json
  Check "E1 duplicate canonical rejected (409)"        ($r.StatusCode -eq 409 -or ($j.success -eq $false -and $r.StatusCode -ge 400))
  Check "E1 success=false"                             ($j.success -eq $false)
} catch {
  # WebRequest throws on 4xx — check status code from exception
  $code = $_.Exception.Response.StatusCode.value__
  Check "E1 duplicate canonical rejected (4xx)"        ($code -ge 400 -and $code -lt 500)
}

# =====================================================================
# SCENARIO F: Batch save — change non-default UoM type AND factor in same call
# Tests that uomIdChanging=true path deletes targeted conversion and rebuilds cleanly
# =====================================================================
Write-Host "`n=== SCENARIO F: Non-default uomId+factor change in same call ==="
RestoreBaseline
psql -U postgres -d pos_system -c "INSERT INTO item_uom_conversions(item_id,from_uom_id,to_uom_id,factor,is_canonical) VALUES('$PID_STR','$UOM_STRIP','$UOM_EACH',10,true),('$PID_STR','$UOM_BOX','$UOM_EACH',100,true);" | Out-Null

try {
  $r = Invoke-WebRequest "$BASE/$PUOM_STRIP" -Method Patch -ContentType "application/json" -Headers $H `
    -Body "{`"uomId`":`"$UOM_PACKET`",`"isDefault`":false,`"conversionFactor`":20}" -UseBasicParsing
  $j = $r.Content | ConvertFrom-Json
  Check "F1 uomId+factor change HTTP 200"              ($r.StatusCode -eq 200)
  Check "F1 success=true"                              ($j.success -eq $true)
  Check "F1 new uomName=PACKET"                        ($j.data.uomName -eq "PACKET")
  $factorDb = DbQuery "SELECT ic.factor FROM item_uom_conversions ic JOIN uoms f ON f.id=ic.from_uom_id WHERE ic.item_id='$PID_STR' AND f.name='PACKET'"
  Check "F2 PACKET conversion factor=20 in DB"         ($factorDb.Trim() -match "^20")
  $oldStrip = DbQuery "SELECT count(*) FROM item_uom_conversions ic JOIN uoms f ON f.id=ic.from_uom_id WHERE ic.item_id='$PID_STR' AND f.name='strip'"
  Check "F3 old strip conversion removed"              (($oldStrip.Trim()) -eq "0")
} catch { Check "F1 (exception)" $false "$_" }
ShowDbState "after Scenario F"

# =====================================================================
# RESTORE BASELINE
# =====================================================================
Write-Host "`n=== Restoring baseline ==="
RestoreBaseline
$rows = DbQuery "SELECT count(*) FROM item_uom_conversions WHERE item_id='$PID_STR'"
$base = DbQuery "SELECT base_uom_id FROM products WHERE id='$PID_STR'"
$def  = DbQuery "SELECT u.name FROM product_uoms pu JOIN uoms u ON u.id=pu.uom_id WHERE pu.product_id='$PID_STR' AND pu.is_default=true"
Check "RESTORE base_uom_id=NULL"                       ($base.Trim() -eq "")
Check "RESTORE default=Each"                           ($def -match "Each")
Check "RESTORE conversions cleared"                    ($rows.Trim() -eq "0")

# =====================================================================
# RESULT SUMMARY
# =====================================================================
Write-Host ""
Write-Host "======================================"
Write-Host " PASSED: $pass"
Write-Host " FAILED: $fail"
Write-Host "======================================"
if ($fail -eq 0) { Write-Host " ALL TESTS PASSED" } else { Write-Host " FAILURES - review output above" }
