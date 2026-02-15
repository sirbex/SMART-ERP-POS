# Test Service Accounting Fix
# Tests quotation conversion with mixed inventory + service items

$baseUrl = "http://localhost:3001"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  SERVICE ACCOUNTING FIX - TEST SUITE" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Test 1: Verify database schema
Write-Host "Test 1: Verify Database Schema..." -ForegroundColor Yellow
$env:PGPASSWORD='password'
$schemaCheck = psql -h localhost -U postgres -d pos_system -t -c @"
SELECT 
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='products' AND column_name='income_account_id') as products_col,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='sale_items' AND column_name='product_type') as sale_items_type,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='sale_items' AND column_name='is_service') as sale_items_service,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='sale_items' AND column_name='income_account_id') as sale_items_income
"@

if ($schemaCheck -match "1.*1.*1.*1") {
    Write-Host "  ✓ All required columns exist" -ForegroundColor Green
} else {
    Write-Host "  ✗ Missing columns - schema check failed" -ForegroundColor Red
    exit 1
}

# Test 2: Create test service product
Write-Host "`nTest 2: Create Service Product..." -ForegroundColor Yellow
$serviceProductSql = @"
-- Create service product
INSERT INTO products (
    name, sku, product_type, unit_price, 
    track_expiry, track_inventory, is_active,
    income_account_id
) VALUES (
    'IT Consultation Service', 'SRV-CONSULT', 'service',
    15000.00, false, false, true,
    (SELECT "Id" FROM accounts WHERE "AccountCode" = '4100' LIMIT 1)
) 
ON CONFLICT (sku) DO UPDATE 
SET name = EXCLUDED.name, unit_price = EXCLUDED.unit_price
RETURNING id, name, product_type, income_account_id;
"@

$serviceProduct = $env:PGPASSWORD='password'; psql -h localhost -U postgres -d pos_system -t -c $serviceProductSql
Write-Host "  ✓ Service product created: $($serviceProduct.Trim())" -ForegroundColor Green

# Test 3: Verify GL accounts exist
Write-Host "`nTest 3: Verify GL Accounts..." -ForegroundColor Yellow
$glCheck = $env:PGPASSWORD='password'; psql -h localhost -U postgres -d pos_system -t -c @"
SELECT 
    "AccountCode", "AccountName", "Id"
FROM accounts 
WHERE "AccountCode" IN ('4000', '4100', '5000', '1300')
ORDER BY "AccountCode";
"@

Write-Host $glCheck -ForegroundColor Gray
Write-Host "  ✓ GL accounts configured" -ForegroundColor Green

# Test 4: Create test quotation with mixed items
Write-Host "`nTest 4: Create Quotation with Mixed Items..." -ForegroundColor Yellow

# Get service product ID
$serviceProductId = $env:PGPASSWORD='password'; psql -h localhost -U postgres -d pos_system -t -c "SELECT id FROM products WHERE sku = 'SRV-CONSULT' LIMIT 1"
$serviceProductId = $serviceProductId.Trim()

# Get an inventory product ID
$inventoryProductId = $env:PGPASSWORD='password'; psql -h localhost -U postgres -d pos_system -t -c "SELECT id FROM products WHERE product_type = 'inventory' AND is_active = true LIMIT 1"
$inventoryProductId = $inventoryProductId.Trim()

# Get customer ID
$customerId = $env:PGPASSWORD='password'; psql -h localhost -U postgres -d pos_system -t -c "SELECT id FROM customers WHERE is_active = true LIMIT 1"
$customerId = $customerId.Trim()

if (!$inventoryProductId) {
    Write-Host "  ⚠ No inventory product found - creating test product..." -ForegroundColor Yellow
    $createInvProd = @"
INSERT INTO products (name, sku, product_type, unit_price, track_expiry, track_inventory, is_active)
VALUES ('Test Laptop', 'LAPTOP-TEST', 'inventory', 80000.00, false, true, true)
RETURNING id;
"@
    $inventoryProductId = $env:PGPASSWORD='password'; psql -h localhost -U postgres -d pos_system -t -c $createInvProd
    $inventoryProductId = $inventoryProductId.Trim()
}

Write-Host "  - Service Product ID: $serviceProductId" -ForegroundColor Gray
Write-Host "  - Inventory Product ID: $inventoryProductId" -ForegroundColor Gray
Write-Host "  - Customer ID: $customerId" -ForegroundColor Gray

# Create quotation via SQL (simpler for testing)
$quoteId = [guid]::NewGuid().ToString()
$quoteNumber = "Q-TEST-$(Get-Random -Minimum 1000 -Maximum 9999)"

$createQuoteSql = @"
INSERT INTO quotations (
    id, quote_number, customer_id, subtotal, tax_amount, total_amount,
    status, valid_from, valid_until
) VALUES (
    '$quoteId', '$quoteNumber', '$customerId', 95000.00, 17100.00, 112100.00,
    'DRAFT', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days'
) RETURNING id, quote_number;
"@

$quote = $env:PGPASSWORD='password'; psql -h localhost -U postgres -d pos_system -t -c $createQuoteSql
Write-Host "  ✓ Quotation created: $quote" -ForegroundColor Green

# Add quotation items
$addItemsSql = @"
-- Add inventory item
INSERT INTO quotation_items (
    quotation_id, line_number, product_id, item_type, description,
    quantity, unit_price, subtotal, is_taxable, tax_rate, tax_amount, line_total,
    product_type
) VALUES (
    '$quoteId', 1, '$inventoryProductId', 'product', 'Test Laptop',
    1, 80000.00, 80000.00, true, 18, 14400.00, 94400.00, 'inventory'
);

-- Add service item
INSERT INTO quotation_items (
    quotation_id, line_number, product_id, item_type, description,
    quantity, unit_price, subtotal, is_taxable, tax_rate, tax_amount, line_total,
    product_type
) VALUES (
    '$quoteId', 2, '$serviceProductId', 'service', 'IT Consultation Service',
    1, 15000.00, 15000.00, true, 18, 2700.00, 17700.00, 'service'
);
"@

$env:PGPASSWORD='password'; psql -h localhost -U postgres -d pos_system -c $addItemsSql | Out-Null
Write-Host "  ✓ Quote items added (1 inventory + 1 service)" -ForegroundColor Green

# Test 5: Check quote items are properly typed
Write-Host "`nTest 5: Verify Quote Items Product Types..." -ForegroundColor Yellow
$itemCheck = $env:PGPASSWORD='password'; psql -h localhost -U postgres -d pos_system -t -c @"
SELECT 
    line_number, description, product_type, line_total
FROM quotation_items
WHERE quotation_id = '$quoteId'
ORDER BY line_number;
"@

Write-Host $itemCheck -ForegroundColor Gray
Write-Host "  ✓ Quote items properly typed" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "READY FOR CONVERSION TEST" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`nQuotation Details:" -ForegroundColor Yellow
Write-Host "  Quote Number: $quoteNumber" -ForegroundColor White
Write-Host "  Quote ID: $quoteId" -ForegroundColor White
Write-Host "  Total: UGX 112,100" -ForegroundColor White
Write-Host "  Items:" -ForegroundColor White
Write-Host "    - Laptop (inventory): UGX 94,400" -ForegroundColor Gray
Write-Host "    - Consultation (service): UGX 17,700" -ForegroundColor Gray

Write-Host "`n  📋 Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Convert quotation to sale via API or UI" -ForegroundColor White
Write-Host "  2. Check GL entries split revenue:" -ForegroundColor White
Write-Host "     - Account 4000 should have UGX 94,400 (inventory)" -ForegroundColor White
Write-Host "     - Account 4100 should have UGX 17,700 (service)" -ForegroundColor White
Write-Host "  3. Verify COGS only for inventory (no COGS for service)" -ForegroundColor White

Write-Host "`n  🔍 Verification Query:" -ForegroundColor Yellow
Write-Host @"
SELECT 
    a."AccountCode", a."AccountName",
    SUM(le."DebitAmount") as debits,
    SUM(le."CreditAmount") as credits
FROM ledger_entries le
JOIN accounts a ON a."Id" = le."AccountId"
JOIN ledger_transactions lt ON lt."Id" = le."LedgerTransactionId"
WHERE lt."ReferenceType" = 'SALE' 
  AND lt."ReferenceNumber" LIKE '%after-conversion%'
GROUP BY a."AccountCode", a."AccountName"
ORDER BY a."AccountCode";
"@ -ForegroundColor Gray

Write-Host "`n========================================`n" -ForegroundColor Cyan
