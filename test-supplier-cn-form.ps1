param(
    [string]$Token = $env:TEST_TOKEN,
    [string]$Base  = "http://localhost:3001/api/credit-debit-notes"
)

$h  = @{ "Authorization" = "Bearer $Token"; "Content-Type" = "application/json"; "X-Tenant-ID" = "default" }
$ep = "$Base/supplier/credit-note"
$inv1 = "2cc4b10e-e712-4e6b-85c0-57a7cc11e93b"  # SBILL-2026-0001  total=360000
$inv5 = "972b7242-61a4-48ee-a597-82e599f9ce28"  # SBILL-2026-0005  total=20000

$pass = 0; $fail = 0

function Req($body) {
    try   { $r = Invoke-RestMethod -Uri $ep -Method POST -Headers $h -Body ($body|ConvertTo-Json -Depth 5) -ErrorAction Stop; return @{ok=$true;data=$r.data} }
    catch { $raw=$_.ErrorDetails.Message|ConvertFrom-Json -EA SilentlyContinue; $m=if($raw.error){$raw.error}elseif($raw.details){$raw.details|ConvertTo-Json -Compress}else{$_.Exception.Message}; return @{ok=$false;msg=$m} }
}
function Pass($lbl) { $script:pass++; Write-Output "  [PASS]  $lbl" }
function Fail($lbl,$why) { $script:fail++; Write-Output "  [FAIL]  $lbl -- $why" }
function ExpectReject($lbl,$body,$pat) {
    $r=Req $body
    if(-not $r.ok -and $r.msg -match $pat){ Pass $lbl }
    elseif($r.ok)                          { Fail $lbl "expected rejection, got: $($r.data|ConvertTo-Json -Compress)" }
    else                                   { Fail $lbl "wrong error: $($r.msg) (expected pattern: $pat)" }
}
function ExpectOk($lbl,$body) {
    $r=Req $body
    if($r.ok){ Pass $lbl; return $r.data }
    else     { Fail $lbl $r.msg; return $null }
}

Write-Output ""
Write-Output "=== S1: Required field validation ==="
ExpectReject "Missing invoiceId"       @{reason="x";amount=500;noteType="PRICE_CORRECTION"} "required|invoice|uuid|Invalid"
ExpectReject "Invalid invoiceId"       @{invoiceId="not-a-uuid";reason="x";amount=500;noteType="PRICE_CORRECTION"} "uuid|UUID|invalid"
ExpectReject "Missing reason"          @{invoiceId=$inv1;amount=500;noteType="PRICE_CORRECTION"} "required|reason"
ExpectReject "Empty reason"            @{invoiceId=$inv1;reason="";amount=500;noteType="PRICE_CORRECTION"} "required|reason"
ExpectReject "No lines and no amount"  @{invoiceId=$inv1;reason="x";noteType="PRICE_CORRECTION"} "required|line|amount"
ExpectReject "Amount = 0"              @{invoiceId=$inv1;reason="x";amount=0;noteType="PRICE_CORRECTION"} "positive|amount"
ExpectReject "Negative amount"         @{invoiceId=$inv1;reason="x";amount=-1;noteType="PRICE_CORRECTION"} "positive|amount"

Write-Output ""
Write-Output "=== S2: noteType defaults to PRICE_CORRECTION when omitted ==="
$d0 = ExpectOk "noteType omitted — defaults to PRICE_CORRECTION" @{invoiceId=$inv1;reason="Default noteType test";amount=100}
if($d0){ Write-Output "         docType=$($d0.note.documentType) status=$($d0.note.status) total=$($d0.note.totalAmount)" }

Write-Output ""
Write-Output "=== S3: Business rule enforcement ==="
ExpectReject "Non-existent invoice UUID" @{invoiceId="00000000-0000-0000-0000-000000000000";reason="x";amount=100;noteType="PRICE_CORRECTION"} "not found|invoice"
ExpectReject "Amount exceeds invoice total (inv5 total=20000, req=25000)" @{invoiceId=$inv5;reason="correction";amount=25000;noteType="PRICE_CORRECTION"} "exceed|total"
ExpectReject "FULL without lines" @{invoiceId=$inv1;reason="full reversal";amount=360000;noteType="FULL"} "line|required|FULL|PARTIAL"
ExpectReject "Goods-return keyword without returnGrnId" @{invoiceId=$inv1;reason="Goods return to supplier";amount=500;noteType="PRICE_CORRECTION"} "Return GRN|GRN|returnGrn"
ExpectReject "Return-to-supplier keyword without returnGrnId" @{invoiceId=$inv1;reason="Return to supplier expired batch";amount=500;noteType="PRICE_CORRECTION"} "Return GRN|GRN|returnGrn"

Write-Output ""
Write-Output "=== S4: Happy path — all form fields ==="
$d1 = ExpectOk "invoiceId+reason+amount+noteType" @{
    invoiceId=$inv1; reason="Supplier overcharged on unit price"; amount=1500; noteType="PRICE_CORRECTION"
}
if($d1){ Write-Output "         note=$($d1.note.invoiceNumber) total=$($d1.note.totalAmount) status=$($d1.note.status)" }

$d2 = ExpectOk "With optional notes field" @{
    invoiceId=$inv1; reason="Volume discount not applied"; amount=800; noteType="PRICE_CORRECTION"; notes="Per agreement ref PO-2026-0003"
}
if($d2){ Write-Output "         note=$($d2.note.invoiceNumber) total=$($d2.note.totalAmount)" }

$d3 = ExpectOk "Minimal: invoiceId+reason+amount (noteType omitted, defaults)" @{
    invoiceId=$inv1; reason="Minor price allowance for late delivery"; amount=250
}
if($d3){ Write-Output "         note=$($d3.note.invoiceNumber) total=$($d3.note.totalAmount)" }

Write-Output ""
Write-Output "=== S5: Synthesized line item shape ==="
if($d1 -and $d1.lineItems -and $d1.lineItems.Count -gt 0){
    $l = $d1.lineItems[0]
    $qOk = [int]$l.quantity -eq 1
    $cOk = [decimal]$l.unitCost -eq 1500
    $nOk = $l.productName -eq "Price Correction"
    $tOk = [decimal]$l.taxRate -eq 0
    if($qOk -and $cOk -and $nOk -and $tOk){ Pass "Synthetic line: name='$($l.productName)' qty=$($l.quantity) unitCost=$($l.unitCost) taxRate=$($l.taxRate)" }
    else { Fail "Synthetic line shape" "got: $($l|ConvertTo-Json -Compress)" }
} else { Write-Output "  [SKIP]  lineItems not present in response (check controller)" }

Write-Output ""
Write-Output "=== S6: notes field edge cases ==="
ExpectOk "Notes field absent (fully optional)" @{invoiceId=$inv1;reason="Correction";amount=100;noteType="PRICE_CORRECTION"} | Out-Null
ExpectReject "Notes > 1000 chars" @{invoiceId=$inv1;reason="x";amount=100;noteType="PRICE_CORRECTION";notes=("x"*1001)} "1000|too long|max|String"

Write-Output ""
Write-Output "=== S7: reason max-length (500 chars) ==="
ExpectReject "Reason > 500 chars" @{invoiceId=$inv1;reason=("r"*501);amount=100;noteType="PRICE_CORRECTION"} "500|too long|max"

Write-Output ""
Write-Output "══════════════════════════════════════════"
Write-Output "  Results: $pass passed, $fail failed"
Write-Output "══════════════════════════════════════════"
exit $fail
