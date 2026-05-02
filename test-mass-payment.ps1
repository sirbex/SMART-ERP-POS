$loginBody = '{"email":"admin@samplepos.com","password":"admin123"}'
$lr = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method POST -ContentType "application/json" -Body $loginBody
$t = $lr.data.token
Write-Host "Token obtained: $($t.Length) chars"
$h = @{ "Authorization" = "Bearer $t" }

Write-Host "`n--- GET /invoices/unpaid-all ---"
try {
  $r = Invoke-RestMethod -Uri "http://localhost:3001/api/supplier-payments/invoices/unpaid-all" -Headers $h
  Write-Host "Success: $($r.success), Items: $($r.data.Count)"
  if ($r.data.Count -gt 0) {
    $r.data | Select-Object invoiceNumber, supplierName, originalAmount, paidAmount, returnCredits, creditNotes, outstandingBalance | Format-Table -AutoSize
  } else {
    Write-Host "(no items returned)"
    exit
  }
} catch {
  Write-Host "Error: $($_.Exception.Message)"
  Write-Host $_.ErrorDetails.Message
  exit
}

# Pick the first two invoices and attempt a mass payment run
$invoices = $r.data | Where-Object { $_.outstandingBalance -gt 0 } | Select-Object -First 2
Write-Host "`n--- POST /payments/mass-run (dry run with 1 UGX each) ---"
$allocations = $invoices | ForEach-Object {
  @{ supplierId = $_.supplierId; invoiceId = $_.id; amount = 1 }
}
$body = @{
  paymentDate   = "2026-05-02"
  paymentMethod = "CASH"
  reference     = "TEST-MASS-001"
  notes         = "API test"
  allocations   = @($allocations)
} | ConvertTo-Json -Depth 5

try {
  $pr = Invoke-RestMethod -Uri "http://localhost:3001/api/supplier-payments/payments/mass-run" -Method POST -ContentType "application/json" -Headers $h -Body $body
  Write-Host "Success: $($pr.success), Payments created: $($pr.data.paymentCount), Total: $($pr.data.totalAmount)"
  $pr.data.payments | ForEach-Object { Write-Host "  -> $($_.paymentNumber) supplier=$($_.supplierId) amount=$($_.amount)" }
} catch {
  Write-Host "Error: $($_.Exception.Message)"
  Write-Host $_.ErrorDetails.Message
}
