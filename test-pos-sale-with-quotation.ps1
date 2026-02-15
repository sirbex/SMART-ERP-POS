#!/usr/bin/env pwsh
# Test POS Sale Creation with Quotation Conversion
# Tests the duplicate trigger fix

$ErrorActionPreference = "Stop"
$baseUrl = "http://localhost:3001"

Write-Host "`n=== Testing POS Sale with Quotation Q-2025-0024 ===" -ForegroundColor Cyan

# Step 1: Verify quotation exists and is DRAFT
Write-Host "`n1. Checking quotation status..." -ForegroundColor Yellow
$env:PGPASSWORD='password'
$quoteBefore = psql -h localhost -U postgres -d pos_system -t -A -c @"
SELECT quote_number, status, total_amount, converted_to_sale_id 
FROM quotations 
WHERE quote_number = 'Q-2025-0024';
"@

if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($quoteBefore)) {
    Write-Host "ERROR: Quotation Q-2025-0024 not found!" -ForegroundColor Red
    exit 1
}

Write-Host "   Before: $quoteBefore" -ForegroundColor Gray
$quoteFields = $quoteBefore.Split('|')
if ($quoteFields[1] -ne 'DRAFT') {
    Write-Host "ERROR: Quotation is not DRAFT (status: $($quoteFields[1]))" -ForegroundColor Red
    exit 1
}

# Step 2: Get quotation details for sale creation
Write-Host "`n2. Fetching quotation details..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/quotations/Q-2025-0024" -Method Get
    if (-not $response.success) {
        throw "Failed to fetch quotation: $($response.error)"
    }
    $quotation = $response.data
    Write-Host "   Quotation: $($quotation.quoteNumber) - $($quotation.customerName) - UGX $($quotation.totalAmount)" -ForegroundColor Gray
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 3: Create POS sale with the quotation
Write-Host "`n3. Creating POS sale..." -ForegroundColor Yellow
$salePayload = @{
    customerId = $quotation.customerId
    customerName = $quotation.customerName
    items = $quotation.items | ForEach-Object {
        @{
            productId = $_.productId
            productName = $_.productName
            quantity = $_.quantity
            unitPrice = $_.unitPrice
            discount = $_.discount
            totalPrice = $_.totalPrice
        }
    }
    paymentLines = @(
        @{
            paymentMethod = "CASH"
            amount = [double]$quotation.totalAmount
        }
    )
    totalAmount = [double]$quotation.totalAmount
    totalDiscount = [double]$quotation.totalDiscount
    notes = "Test sale from quotation Q-2025-0024"
    quoteId = $quotation.id
} | ConvertTo-Json -Depth 10

try {
    $saleResponse = Invoke-RestMethod -Uri "$baseUrl/api/sales" -Method Post -Body $salePayload -ContentType "application/json"
    if (-not $saleResponse.success) {
        throw "Sale creation failed: $($saleResponse.error)"
    }
    $sale = $saleResponse.data
    Write-Host "   ✓ Sale created: $($sale.saleNumber)" -ForegroundColor Green
    Write-Host "   Sale ID: $($sale.id)" -ForegroundColor Gray
    Write-Host "   Total: UGX $($sale.totalAmount)" -ForegroundColor Gray
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "`nResponse details:" -ForegroundColor Yellow
    Write-Host $_.Exception.Response -ForegroundColor Gray
    exit 1
}

# Step 4: Verify quotation was converted
Write-Host "`n4. Verifying quotation conversion..." -ForegroundColor Yellow
Start-Sleep -Seconds 1
$quoteAfter = psql -h localhost -U postgres -d pos_system -t -A -c @"
SELECT quote_number, status, converted_to_sale_id 
FROM quotations 
WHERE quote_number = 'Q-2025-0024';
"@

Write-Host "   After: $quoteAfter" -ForegroundColor Gray
$quoteAfterFields = $quoteAfter.Split('|')
if ($quoteAfterFields[1] -ne 'CONVERTED') {
    Write-Host "   ✗ FAILED: Quotation status is $($quoteAfterFields[1]), expected CONVERTED" -ForegroundColor Red
    $testFailed = $true
} else {
    Write-Host "   ✓ Quotation marked as CONVERTED" -ForegroundColor Green
}

# Step 5: Verify invoice payment was recorded correctly (not doubled)
Write-Host "`n5. Checking invoice payment..." -ForegroundColor Yellow
$invoiceCheck = psql -h localhost -U postgres -d pos_system -t -A -c @"
SELECT i."TotalAmount", i."AmountPaid", i."OutstandingBalance", COUNT(ip.id) as payment_count
FROM invoices i
LEFT JOIN invoice_payments ip ON ip.invoice_id = i."Id"
WHERE i."SaleId" = '$($sale.id)'
GROUP BY i."Id", i."TotalAmount", i."AmountPaid", i."OutstandingBalance";
"@

if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($invoiceCheck)) {
    Write-Host "   Invoice: $invoiceCheck" -ForegroundColor Gray
    $invoiceFields = $invoiceCheck.Split('|')
    $totalAmount = [double]$invoiceFields[0]
    $amountPaid = [double]$invoiceFields[1]
    $outstandingBalance = [double]$invoiceFields[2]
    $paymentCount = [int]$invoiceFields[3]
    
    if ($amountPaid -eq $totalAmount -and $outstandingBalance -eq 0 -and $paymentCount -eq 1) {
        Write-Host "   ✓ Payment recorded correctly (no doubling)" -ForegroundColor Green
        Write-Host "   Total: $totalAmount, Paid: $amountPaid, Outstanding: $outstandingBalance" -ForegroundColor Gray
    } else {
        Write-Host "   ✗ FAILED: Payment mismatch!" -ForegroundColor Red
        Write-Host "   Expected: Total=Paid=$totalAmount, Outstanding=0, Payments=1" -ForegroundColor Red
        Write-Host "   Got: Total=$totalAmount, Paid=$amountPaid, Outstanding=$outstandingBalance, Payments=$paymentCount" -ForegroundColor Red
        $testFailed = $true
    }
} else {
    Write-Host "   ✗ FAILED: Could not find invoice for sale" -ForegroundColor Red
    $testFailed = $true
}

# Step 6: Check GL entries
Write-Host "`n6. Checking GL entries..." -ForegroundColor Yellow
$glCount = psql -h localhost -U postgres -d pos_system -t -A -c @"
SELECT COUNT(*) 
FROM ledger_transactions 
WHERE "Description" LIKE '%$($sale.saleNumber)%' OR "Description" LIKE '%sale%';
"@

if ($LASTEXITCODE -eq 0) {
    $count = [int]$glCount.Trim()
    if ($count -gt 0) {
        Write-Host "   ✓ GL entries created ($count transaction(s))" -ForegroundColor Green
        
        # Show GL entry details
        $glDetails = psql -h localhost -U postgres -d pos_system -t -A -c @"
SELECT "TransactionId", "Description", "TotalDebitAmount", "TotalCreditAmount"
FROM ledger_transactions
WHERE "Description" LIKE '%$($sale.saleNumber)%' OR "Description" LIKE '%sale%'
ORDER BY "CreatedAt" DESC
LIMIT 1;
"@
        Write-Host "   GL: $glDetails" -ForegroundColor Gray
    } else {
        Write-Host "   ✗ WARNING: No GL entries found for this sale" -ForegroundColor Yellow
        Write-Host "   (Manual GL posting may not have executed)" -ForegroundColor Yellow
    }
}

# Summary
Write-Host "`n=== Test Summary ===" -ForegroundColor Cyan
if ($testFailed) {
    Write-Host "FAILED: Some checks did not pass" -ForegroundColor Red
    exit 1
} else {
    Write-Host "SUCCESS: All checks passed!" -ForegroundColor Green
    Write-Host "`nCreated sale: $($sale.saleNumber)" -ForegroundColor White
    Write-Host "Converted quotation: Q-2025-0024 → CONVERTED" -ForegroundColor White
    Write-Host "Payment recorded: No doubling detected" -ForegroundColor White
}

Write-Host "`n"
