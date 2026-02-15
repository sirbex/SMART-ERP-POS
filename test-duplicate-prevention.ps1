# Test script to verify duplicate GL entries are prevented
# This tests that CASH sales do NOT create invoice payment GL entries

$baseUrl = "http://localhost:3001"
$env:PGPASSWORD = "password"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "DUPLICATE GL ENTRY PREVENTION TEST" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Step 1: Get current counts
Write-Host "1. Getting baseline counts..." -ForegroundColor Yellow
$beforeSales = psql -h localhost -U postgres -d pos_system -t -c "SELECT COUNT(*) FROM sales;"
$beforeInvoicePayments = psql -h localhost -U postgres -d pos_system -t -c "SELECT COUNT(*) FROM invoice_payments;"
$beforeGLTransactions = psql -h localhost -U postgres -d pos_system -t -c "SELECT COUNT(*) FROM ledger_transactions;"
$beforeCashBalance = psql -h localhost -U postgres -d pos_system -t -c "SELECT COALESCE(SUM(`"DebitAmount`" - `"CreditAmount`"), 0) FROM ledger_entries le JOIN accounts a ON le.`"AccountId`" = a.`"Id`" WHERE a.`"AccountCode`" = '1010';"

Write-Host "   - Sales: $($beforeSales.Trim())" -ForegroundColor White
Write-Host "   - Invoice Payments: $($beforeInvoicePayments.Trim())" -ForegroundColor White
Write-Host "   - GL Transactions: $($beforeGLTransactions.Trim())" -ForegroundColor White
Write-Host "   - Cash Balance: $($beforeCashBalance.Trim())" -ForegroundColor White

# Step 2: Create a CASH sale via API
Write-Host "`n2. Creating new CASH sale..." -ForegroundColor Yellow
$saleData = @{
    customerId = $null
    customerName = "Walk-in Customer"
    items = @(
        @{
            productId = $null
            productName = "Test Product"
            quantity = 1
            unitPrice = 25000
            totalPrice = 25000
            totalCost = 15000
        }
    )
    totalAmount = 25000
    totalCost = 15000
    profit = 10000
    paymentMethod = "CASH"
    amountPaid = 25000
    changeAmount = 0
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/sales" -Method Post -Body $saleData -ContentType "application/json"
    if ($response.success) {
        $newSaleNumber = $response.data.saleNumber
        Write-Host "   ✓ Sale created: $newSaleNumber" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Sale creation failed: $($response.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ✗ API request failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 3: Wait for triggers to complete
Write-Host "`n3. Waiting for database triggers..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

# Step 4: Check new counts
Write-Host "`n4. Checking post-sale counts..." -ForegroundColor Yellow
$afterSales = psql -h localhost -U postgres -d pos_system -t -c "SELECT COUNT(*) FROM sales;"
$afterInvoicePayments = psql -h localhost -U postgres -d pos_system -t -c "SELECT COUNT(*) FROM invoice_payments;"
$afterGLTransactions = psql -h localhost -U postgres -d pos_system -t -c "SELECT COUNT(*) FROM ledger_transactions;"
$afterCashBalance = psql -h localhost -U postgres -d pos_system -t -c "SELECT COALESCE(SUM(`"DebitAmount`" - `"CreditAmount`"), 0) FROM ledger_entries le JOIN accounts a ON le.`"AccountId`" = a.`"Id`" WHERE a.`"AccountCode`" = '1010';"

Write-Host "   - Sales: $($afterSales.Trim())" -ForegroundColor White
Write-Host "   - Invoice Payments: $($afterInvoicePayments.Trim())" -ForegroundColor White
Write-Host "   - GL Transactions: $($afterGLTransactions.Trim())" -ForegroundColor White
Write-Host "   - Cash Balance: $($afterCashBalance.Trim())" -ForegroundColor White

# Step 5: Validate results
Write-Host "`n5. Validating results..." -ForegroundColor Yellow

$salesIncreased = [int]$afterSales - [int]$beforeSales
$paymentsIncreased = [int]$afterInvoicePayments - [int]$beforeInvoicePayments
$glTxnsIncreased = [int]$afterGLTransactions - [int]$beforeGLTransactions
$cashIncrease = [decimal]$afterCashBalance - [decimal]$beforeCashBalance

Write-Host "   - Sales increased by: $salesIncreased (expected: 1)" -ForegroundColor White
Write-Host "   - Invoice payments increased by: $paymentsIncreased (expected: 1)" -ForegroundColor White
Write-Host "   - GL transactions increased by: $glTxnsIncreased (expected: 1)" -ForegroundColor White
Write-Host "   - Cash increased by: $cashIncrease (expected: 25000)" -ForegroundColor White

# Validation checks
$allPassed = $true

if ($salesIncreased -ne 1) {
    Write-Host "   ✗ FAIL: Expected 1 new sale, got $salesIncreased" -ForegroundColor Red
    $allPassed = $false
}

if ($paymentsIncreased -ne 1) {
    Write-Host "   ✗ FAIL: Expected 1 new invoice payment, got $paymentsIncreased" -ForegroundColor Red
    $allPassed = $false
}

if ($glTxnsIncreased -ne 1) {
    Write-Host "   ✓ PASS: Only 1 GL transaction created (no duplicate from invoice payment)" -ForegroundColor Green
} else {
    Write-Host "   ✗ FAIL: Expected 1 GL transaction, got $glTxnsIncreased (duplicate detected!)" -ForegroundColor Red
    $allPassed = $false
}

if ($cashIncrease -eq 25000) {
    Write-Host "   ✓ PASS: Cash balance increased by exactly 25,000 (no duplicate)" -ForegroundColor Green
} else {
    Write-Host "   ✗ FAIL: Cash increased by $cashIncrease, expected 25000" -ForegroundColor Red
    $allPassed = $false
}

# Step 6: Check GL entries for the new sale
Write-Host "`n6. Checking GL entries for new sale..." -ForegroundColor Yellow
$glEntries = psql -h localhost -U postgres -d pos_system -c "SELECT lt.`"TransactionNumber`", lt.`"ReferenceType`", lt.`"Description`", le.`"DebitAmount`", le.`"CreditAmount`", a.`"AccountCode`", a.`"Name`" FROM ledger_transactions lt JOIN ledger_entries le ON le.`"TransactionId`" = lt.`"Id`" JOIN accounts a ON le.`"AccountId`" = a.`"Id`" WHERE lt.`"ReferenceType`" = 'SALE' AND lt.`"ReferenceId`" = (SELECT id FROM sales WHERE sale_number = '$newSaleNumber') ORDER BY a.`"AccountCode`";"

Write-Host $glEntries

# Check for duplicate invoice payment transaction
$duplicateCheck = psql -h localhost -U postgres -d pos_system -t -c "SELECT COUNT(*) FROM ledger_transactions WHERE `"ReferenceType`" = 'INVOICE_PAYMENT' AND `"ReferenceId`" = (SELECT id FROM invoice_payments WHERE invoice_id = (SELECT `"Id`" FROM invoices WHERE `"SaleId`" = (SELECT id FROM sales WHERE sale_number = '$newSaleNumber')));"

if ([int]$duplicateCheck.Trim() -eq 0) {
    Write-Host "`n   ✓ PASS: No INVOICE_PAYMENT GL transaction created for CASH sale" -ForegroundColor Green
} else {
    Write-Host "`n   ✗ FAIL: INVOICE_PAYMENT GL transaction found (duplicate!)" -ForegroundColor Red
    $allPassed = $false
}

# Final result
Write-Host "`n========================================" -ForegroundColor Cyan
if ($allPassed) {
    Write-Host "ALL TESTS PASSED ✓" -ForegroundColor Green
    Write-Host "Duplicate GL entries are prevented!" -ForegroundColor Green
} else {
    Write-Host "TESTS FAILED ✗" -ForegroundColor Red
    Write-Host "Duplicate GL entries still occurring!" -ForegroundColor Red
}
Write-Host "========================================`n" -ForegroundColor Cyan
