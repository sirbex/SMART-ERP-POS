#!/usr/bin/env pwsh
# Direct database test of the duplicate trigger fix

$ErrorActionPreference = "Stop"
$env:PGPASSWORD='password'

Write-Host "`n=== Testing Invoice Payment Trigger Fix ===" -ForegroundColor Cyan

# Step 1: Create test invoice
Write-Host "`n1. Creating test invoice..." -ForegroundColor Yellow
$testInvoice = psql -h localhost -U postgres -d pos_system -t -A -c @"
INSERT INTO invoices (
    "Id", "InvoiceNumber", "CustomerId", "CustomerName", "InvoiceDate", "DueDate",
    "Subtotal", "TaxAmount", "TotalAmount", "AmountPaid", "OutstandingBalance", 
    "Status", "PaymentTerms", "CreatedAt", "UpdatedAt"
)
VALUES (
    gen_random_uuid(), 'TEST-INV-001', 
    (SELECT id FROM customers LIMIT 1), 
    (SELECT name FROM customers LIMIT 1),
    NOW(), NOW() + INTERVAL '30 days',
    100000, 0, 100000, 0, 100000,
    'PENDING', 30, NOW(), NOW()
)
RETURNING "Id", "TotalAmount", "AmountPaid";
"@

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to create test invoice" -ForegroundColor Red
    exit 1
}

$invoiceFields = $testInvoice.Split('|')
$invoiceId = $invoiceFields[0]
$totalAmount = [double]$invoiceFields[1]
$initialPaid = [double]$invoiceFields[2]

Write-Host "   Created invoice: $invoiceId" -ForegroundColor Gray
Write-Host "   Total: $totalAmount, Initial Paid: $initialPaid" -ForegroundColor Gray

# Step 2: Record a payment (this triggers the payment sync)
Write-Host "`n2. Recording payment of 100,000..." -ForegroundColor Yellow
$payment = psql -h localhost -U postgres -d pos_system -t -A -c @"
INSERT INTO invoice_payments (id, invoice_id, amount, payment_method, payment_date, receipt_number, created_at)
VALUES (gen_random_uuid(), '$invoiceId', 100000, 'CASH', NOW(), 'TEST-RCPT-001', NOW())
RETURNING id, amount;
"@

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to record payment (constraint violation?)" -ForegroundColor Red
    
    # Show any failed invoice
    $failedInvoice = psql -h localhost -U postgres -d pos_system -t -A -c @"
SELECT "TotalAmount", "AmountPaid" FROM invoices WHERE "Id" = '$invoiceId';
"@
    Write-Host "   Invoice state: $failedInvoice" -ForegroundColor Red
    
    # Cleanup
    psql -h localhost -U postgres -d pos_system -c "DELETE FROM invoices WHERE \"InvoiceNumber\" = 'TEST-INV-001';" | Out-Null
    exit 1
}

Write-Host "   ✓ Payment recorded successfully" -ForegroundColor Green

# Step 3: Verify invoice AmountPaid was updated correctly (not doubled)
Write-Host "`n3. Verifying invoice payment amount..." -ForegroundColor Yellow
$invoiceAfter = psql -h localhost -U postgres -d pos_system -t -A -c @"
SELECT "TotalAmount", "AmountPaid", "OutstandingBalance"
FROM invoices
WHERE "Id" = '$invoiceId';
"@

$afterFields = $invoiceAfter.Split('|')
$finalTotal = [double]$afterFields[0]
$finalPaid = [double]$afterFields[1]
$finalOutstanding = [double]$afterFields[2]

Write-Host "   Total: $finalTotal" -ForegroundColor Gray
Write-Host "   Paid: $finalPaid" -ForegroundColor Gray
Write-Host "   Outstanding: $finalOutstanding" -ForegroundColor Gray

# Step 4: Check for payment doubling
$testPassed = $true
if ($finalPaid -eq 100000) {
    Write-Host "`n   ✓ SUCCESS: Payment NOT doubled (100,000)" -ForegroundColor Green
} elseif ($finalPaid -eq 200000) {
    Write-Host "`n   ✗ FAILED: Payment WAS doubled (200,000)" -ForegroundColor Red
    $testPassed = $false
} else {
    Write-Host "`n   ? UNEXPECTED: Payment amount is $finalPaid" -ForegroundColor Yellow
    $testPassed = $false
}

if ($finalPaid -le $finalTotal) {
    Write-Host "   ✓ Constraint satisfied: AmountPaid ($finalPaid) <= TotalAmount ($finalTotal)" -ForegroundColor Green
} else {
    Write-Host "   ✗ Constraint violated: AmountPaid ($finalPaid) > TotalAmount ($finalTotal)" -ForegroundColor Red
    $testPassed = $false
}

# Step 5: Count payment records
Write-Host "`n4. Checking payment records..." -ForegroundColor Yellow
$paymentCount = psql -h localhost -U postgres -d pos_system -t -A -c @"
SELECT COUNT(*) FROM invoice_payments WHERE invoice_id = '$invoiceId';
"@

$count = [int]$paymentCount.Trim()
Write-Host "   Payment records: $count" -ForegroundColor Gray

if ($count -eq 1) {
    Write-Host "   ✓ Correct: 1 payment record" -ForegroundColor Green
} else {
    Write-Host "   ✗ FAILED: Expected 1 payment record, found $count" -ForegroundColor Red
    $testPassed = $false
}

# Cleanup
Write-Host "`n5. Cleaning up test data..." -ForegroundColor Yellow
psql -h localhost -U postgres -d pos_system -c "DELETE FROM invoice_payments WHERE invoice_id = '$invoiceId';" | Out-Null
psql -h localhost -U postgres -d pos_system -c "DELETE FROM invoices WHERE `"Id`" = '$invoiceId';" | Out-Null
Write-Host "   ✓ Test data removed" -ForegroundColor Gray

# Summary
Write-Host "`n=== Test Result ===" -ForegroundColor Cyan
if ($testPassed) {
    Write-Host "✓ PASSED: Duplicate trigger fix verified" -ForegroundColor Green
    Write-Host "  - Payment recorded once (not doubled)" -ForegroundColor White
    Write-Host "  - Constraint not violated" -ForegroundColor White
    Write-Host "  - Invoice payment tracking correct" -ForegroundColor White
} else {
    Write-Host "✗ FAILED: Issues detected" -ForegroundColor Red
    exit 1
}

Write-Host "`n"
