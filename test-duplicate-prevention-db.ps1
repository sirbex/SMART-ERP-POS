# Test script to verify duplicate GL entries are prevented
# This tests DIRECTLY via database (no API auth needed)

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

# Step 2: Create a CASH sale directly via database (simulating what the API does)
Write-Host "`n2. Creating new CASH sale directly via database..." -ForegroundColor Yellow

$testSaleSQL = @"
-- Create a test CASH sale with all the triggers
DO `$`$
DECLARE
    v_sale_id UUID;
    v_invoice_id UUID;
    v_sale_number TEXT;
    v_invoice_number TEXT;
BEGIN
    -- Generate sale number
    SELECT 'SALE-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
           LPAD((COALESCE(MAX(CAST(SUBSTRING(sale_number FROM '\d+`$') AS INTEGER)), 0) + 1)::TEXT, 4, '0')
    INTO v_sale_number
    FROM sales 
    WHERE sale_number LIKE 'SALE-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%';

    -- Insert sale
    INSERT INTO sales (
        sale_number, total_amount, total_cost, profit, payment_method, 
        amount_paid, change_amount, status, sale_date, created_at, updated_at
    ) VALUES (
        v_sale_number, 25000, 15000, 10000, 'CASH', 
        25000, 0, 'COMPLETED', CURRENT_DATE, NOW(), NOW()
    ) RETURNING id INTO v_sale_id;

    RAISE NOTICE 'Created sale: % (ID: %)', v_sale_number, v_sale_id;

    -- Insert sale item
    INSERT INTO sale_items (
        sale_id, product_name, quantity, unit_price, total_price, total_cost, 
        profit, created_at, updated_at
    ) VALUES (
        v_sale_id, 'Test Product for Duplicate Prevention', 1, 25000, 25000, 15000, 
        10000, NOW(), NOW()
    );

    -- Manually trigger GL posting (simulating what trigger does)
    PERFORM fn_post_sale_to_ledger() FROM sales WHERE id = v_sale_id;

    -- Generate invoice number
    SELECT 'INV-' || LPAD((COALESCE(MAX(CAST(SUBSTRING("InvoiceNumber" FROM '\d+`$') AS INTEGER)), 0) + 1)::TEXT, 5, '0')
    INTO v_invoice_number
    FROM invoices;

    -- Insert invoice
    INSERT INTO invoices (
        "InvoiceNumber", "SaleId", "TotalAmount", "AmountPaid", "AmountDue", 
        "Status", "IssueDate", "DueDate", "CreatedAt", "UpdatedAt"
    ) VALUES (
        v_invoice_number, v_sale_id, 25000, 25000, 0, 
        'PAID', CURRENT_DATE, CURRENT_DATE, NOW(), NOW()
    ) RETURNING "Id" INTO v_invoice_id;

    RAISE NOTICE 'Created invoice: % (ID: %)', v_invoice_number, v_invoice_id;

    -- Insert invoice payment (THIS is where the fix is tested)
    -- The trigger should detect CASH sale and SKIP GL posting
    INSERT INTO invoice_payments (
        invoice_id, amount, payment_method, payment_date, 
        receipt_number, created_at, updated_at
    ) VALUES (
        v_invoice_id, 25000, 'CASH', CURRENT_DATE,
        'RCPT-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD((COALESCE(MAX(CAST(SUBSTRING(receipt_number FROM '\d+`$') AS INTEGER)), 0) + 1)::TEXT, 4, '0'),
        NOW(), NOW()
    ) FROM invoice_payments WHERE receipt_number LIKE 'RCPT-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-%';

    RAISE NOTICE 'Created invoice payment - trigger should skip GL posting for CASH sale';
END`$`$;
"@

# Execute the test sale creation
psql -h localhost -U postgres -d pos_system -c $testSaleSQL

# Step 3: Wait for triggers to complete
Write-Host "`n3. Waiting for database triggers..." -ForegroundColor Yellow
Start-Sleep -Seconds 1

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
Write-Host "   - GL transactions increased by: $glTxnsIncreased (expected: 1 for SALE only)" -ForegroundColor White
Write-Host "   - Cash increased by: $cashIncrease (expected: 25000.000000)" -ForegroundColor White

# Validation checks
$allPassed = $true

if ($salesIncreased -ne 1) {
    Write-Host "   ✗ FAIL: Expected 1 new sale, got $salesIncreased" -ForegroundColor Red
    $allPassed = $false
} else {
    Write-Host "   ✓ PASS: 1 sale created" -ForegroundColor Green
}

if ($paymentsIncreased -ne 1) {
    Write-Host "   ✗ FAIL: Expected 1 new invoice payment, got $paymentsIncreased" -ForegroundColor Red
    $allPassed = $false
} else {
    Write-Host "   ✓ PASS: 1 invoice payment created" -ForegroundColor Green
}

if ($glTxnsIncreased -eq 1) {
    Write-Host "   ✓ PASS: Only 1 GL transaction created (SALE only, no duplicate from INVOICE_PAYMENT)" -ForegroundColor Green
} else {
    Write-Host "   ✗ FAIL: Expected 1 GL transaction, got $glTxnsIncreased (duplicate detected!)" -ForegroundColor Red
    $allPassed = $false
}

if ($cashIncrease -eq 25000) {
    Write-Host "   ✓ PASS: Cash balance increased by exactly 25,000 (no duplicate debit)" -ForegroundColor Green
} else {
    Write-Host "   ✗ FAIL: Cash increased by $cashIncrease, expected 25000.000000" -ForegroundColor Red
    $allPassed = $false
}

# Step 6: Check what GL transactions exist for new entities
Write-Host "`n6. Checking GL transaction types..." -ForegroundColor Yellow
$glTypes = psql -h localhost -U postgres -d pos_system -c "SELECT `"ReferenceType`", COUNT(*) as count FROM ledger_transactions GROUP BY `"ReferenceType`" ORDER BY `"ReferenceType`";"
Write-Host $glTypes

# Check for INVOICE_PAYMENT transaction for the latest invoice payment
$latestInvoicePaymentId = psql -h localhost -U postgres -d pos_system -t -c "SELECT id FROM invoice_payments ORDER BY created_at DESC LIMIT 1;"
$invoicePaymentGLCount = psql -h localhost -U postgres -d pos_system -t -c "SELECT COUNT(*) FROM ledger_transactions WHERE `"ReferenceType`" = 'INVOICE_PAYMENT' AND `"ReferenceId`" = '$($latestInvoicePaymentId.Trim())';"

Write-Host "`n7. Checking for duplicate INVOICE_PAYMENT GL transaction..." -ForegroundColor Yellow
if ([int]$invoicePaymentGLCount.Trim() -eq 0) {
    Write-Host "   ✓ PASS: No INVOICE_PAYMENT GL transaction created for CASH sale" -ForegroundColor Green
    Write-Host "   ✓ This proves the trigger correctly detected CASH payment and skipped GL posting!" -ForegroundColor Green
} else {
    Write-Host "   ✗ FAIL: Found $($invoicePaymentGLCount.Trim()) INVOICE_PAYMENT GL transaction (duplicate!)" -ForegroundColor Red
    $allPassed = $false
    
    # Show the duplicate transaction
    $duplicateTxn = psql -h localhost -U postgres -d pos_system -c "SELECT `"TransactionNumber`", `"Description`", `"TotalDebitAmount`", `"TotalCreditAmount`" FROM ledger_transactions WHERE `"ReferenceType`" = 'INVOICE_PAYMENT' AND `"ReferenceId`" = '$($latestInvoicePaymentId.Trim())';"
    Write-Host $duplicateTxn
}

# Final result
Write-Host "`n========================================" -ForegroundColor Cyan
if ($allPassed) {
    Write-Host "ALL TESTS PASSED ✓✓✓" -ForegroundColor Green
    Write-Host "Duplicate GL entries are PREVENTED!" -ForegroundColor Green
    Write-Host "The fix is working correctly." -ForegroundColor Green
} else {
    Write-Host "TESTS FAILED ✗✗✗" -ForegroundColor Red
    Write-Host "Duplicate GL entries still occurring!" -ForegroundColor Red
}
Write-Host "========================================`n" -ForegroundColor Cyan
