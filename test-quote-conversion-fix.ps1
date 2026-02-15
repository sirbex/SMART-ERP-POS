# Test Quote Conversion - All Payment Options Create Invoices
# This script verifies that quotes always create invoices regardless of payment option

$baseUrl = "http://localhost:3001"
$token = ""

Write-Host "🧪 Quote Conversion Invoice Test" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Login
Write-Host "1️⃣  Logging in..." -ForegroundColor Yellow
$loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -Body (@{
    email = "testadmin@samplepos.com"
    password = "admin123"
} | ConvertTo-Json) -ContentType "application/json"

if ($loginResponse.success) {
    $token = $loginResponse.data.token
    Write-Host "   ✅ Login successful" -ForegroundColor Green
} else {
    Write-Host "   ❌ Login failed" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# Get a customer
Write-Host ""
Write-Host "2️⃣  Getting customer..." -ForegroundColor Yellow
$customersResponse = Invoke-RestMethod -Uri "$baseUrl/api/customers?limit=1" -Headers $headers
$customer = $customersResponse.data.data[0]
Write-Host "   ✅ Customer: $($customer.name)" -ForegroundColor Green

# Get a product
Write-Host ""
Write-Host "3️⃣  Getting product..." -ForegroundColor Yellow
$productsResponse = Invoke-RestMethod -Uri "$baseUrl/api/products?limit=1" -Headers $headers
$product = $productsResponse.data.data[0]
Write-Host "   ✅ Product: $($product.name)" -ForegroundColor Green

# Test 1: Full Payment Conversion
Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "TEST 1: FULL PAYMENT CONVERSION" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan

Write-Host ""
Write-Host "4️⃣  Creating quick quote (for full payment test)..." -ForegroundColor Yellow
$quote1 = @{
    customerId = $customer.id
    customerName = $customer.name
    validityDays = 30
    items = @(
        @{
            productId = $product.id
            description = $product.name
            quantity = 2
            unitPrice = 10000
            isTaxable = $true
            taxRate = 18
            unitCost = 7000
        }
    )
} | ConvertTo-Json -Depth 10

$quote1Response = Invoke-RestMethod -Uri "$baseUrl/api/pos/quote" -Method POST -Body $quote1 -Headers $headers
$quote1Number = $quote1Response.data.quoteNumber
Write-Host "   ✅ Quote created: $quote1Number" -ForegroundColor Green

Write-Host ""
Write-Host "5️⃣  Converting quote with FULL PAYMENT..." -ForegroundColor Yellow
$conversion1 = @{
    paymentOption = "full"
    depositAmount = 23600
    depositMethod = "CASH"
    cashierId = $loginResponse.data.user.id
} | ConvertTo-Json

try {
    $result1 = Invoke-RestMethod -Uri "$baseUrl/api/quotations/$($quote1Response.data.id)/convert" -Method POST -Body $conversion1 -Headers $headers
    
    if ($result1.data.invoice) {
        Write-Host "   ✅ INVOICE CREATED for full payment!" -ForegroundColor Green
        Write-Host "      Invoice Number: $($result1.data.invoice.invoice_number)" -ForegroundColor Green
        Write-Host "      Invoice Status: $($result1.data.invoice.status)" -ForegroundColor Green
        Write-Host "      Invoice Balance: $($result1.data.invoice.balance)" -ForegroundColor Green
        Write-Host "      Quote ID Linked: $(if ($result1.data.invoice.quote_id) { '✅' } else { '❌' })" -ForegroundColor $(if ($result1.data.invoice.quote_id) { 'Green' } else { 'Red' })
    } else {
        Write-Host "   ❌ NO INVOICE CREATED for full payment - BUG!" -ForegroundColor Red
    }
} catch {
    Write-Host "   ❌ Conversion failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Partial Payment Conversion
Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "TEST 2: PARTIAL PAYMENT CONVERSION" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan

Write-Host ""
Write-Host "6️⃣  Creating quick quote (for partial payment test)..." -ForegroundColor Yellow
$quote2 = @{
    customerId = $customer.id
    customerName = $customer.name
    validityDays = 30
    items = @(
        @{
            productId = $product.id
            description = $product.name
            quantity = 3
            unitPrice = 10000
            isTaxable = $true
            taxRate = 18
            unitCost = 7000
        }
    )
} | ConvertTo-Json -Depth 10

$quote2Response = Invoke-RestMethod -Uri "$baseUrl/api/pos/quote" -Method POST -Body $quote2 -Headers $headers
$quote2Number = $quote2Response.data.quoteNumber
Write-Host "   ✅ Quote created: $quote2Number" -ForegroundColor Green

Write-Host ""
Write-Host "7️⃣  Converting quote with PARTIAL PAYMENT..." -ForegroundColor Yellow
$conversion2 = @{
    paymentOption = "partial"
    depositAmount = 10000
    depositMethod = "CARD"
    cashierId = $loginResponse.data.user.id
} | ConvertTo-Json

try {
    $result2 = Invoke-RestMethod -Uri "$baseUrl/api/quotations/$($quote2Response.data.id)/convert" -Method POST -Body $conversion2 -Headers $headers
    
    if ($result2.data.invoice) {
        Write-Host "   ✅ INVOICE CREATED for partial payment!" -ForegroundColor Green
        Write-Host "      Invoice Number: $($result2.data.invoice.invoice_number)" -ForegroundColor Green
        Write-Host "      Invoice Status: $($result2.data.invoice.status)" -ForegroundColor Green
        Write-Host "      Invoice Balance: $($result2.data.invoice.balance)" -ForegroundColor Green
        Write-Host "      Quote ID Linked: $(if ($result2.data.invoice.quote_id) { '✅' } else { '❌' })" -ForegroundColor $(if ($result2.data.invoice.quote_id) { 'Green' } else { 'Red' })
    } else {
        Write-Host "   ❌ NO INVOICE CREATED for partial payment - BUG!" -ForegroundColor Red
    }
} catch {
    Write-Host "   ❌ Conversion failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: No Payment Conversion
Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "TEST 3: NO PAYMENT CONVERSION" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan

Write-Host ""
Write-Host "8️⃣  Creating quick quote (for no payment test)..." -ForegroundColor Yellow
$quote3 = @{
    customerId = $customer.id
    customerName = $customer.name
    validityDays = 30
    items = @(
        @{
            productId = $product.id
            description = $product.name
            quantity = 1
            unitPrice = 10000
            isTaxable = $true
            taxRate = 18
            unitCost = 7000
        }
    )
} | ConvertTo-Json -Depth 10

$quote3Response = Invoke-RestMethod -Uri "$baseUrl/api/pos/quote" -Method POST -Body $quote3 -Headers $headers
$quote3Number = $quote3Response.data.quoteNumber
Write-Host "   ✅ Quote created: $quote3Number" -ForegroundColor Green

Write-Host ""
Write-Host "9️⃣  Converting quote with NO PAYMENT..." -ForegroundColor Yellow
$conversion3 = @{
    paymentOption = "none"
    cashierId = $loginResponse.data.user.id
} | ConvertTo-Json

try {
    $result3 = Invoke-RestMethod -Uri "$baseUrl/api/quotations/$($quote3Response.data.id)/convert" -Method POST -Body $conversion3 -Headers $headers
    
    if ($result3.data.invoice) {
        Write-Host "   ✅ INVOICE CREATED for no payment!" -ForegroundColor Green
        Write-Host "      Invoice Number: $($result3.data.invoice.invoice_number)" -ForegroundColor Green
        Write-Host "      Invoice Status: $($result3.data.invoice.status)" -ForegroundColor Green
        Write-Host "      Invoice Balance: $($result3.data.invoice.balance)" -ForegroundColor Green
        Write-Host "      Quote ID Linked: $(if ($result3.data.invoice.quote_id) { '✅' } else { '❌' })" -ForegroundColor $(if ($result3.data.invoice.quote_id) { 'Green' } else { 'Red' })
    } else {
        Write-Host "   ❌ NO INVOICE CREATED for no payment - BUG!" -ForegroundColor Red
    }
} catch {
    Write-Host "   ❌ Conversion failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Summary
Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "TEST SUMMARY" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ Expected: ALL three quote conversions should create invoices" -ForegroundColor Green
Write-Host "✅ Expected: Quote ID should be linked in all invoices" -ForegroundColor Green
Write-Host "✅ Expected: Invoice status varies by payment option" -ForegroundColor Green
Write-Host ""
Write-Host "Full Payment    → Invoice Status: PAID (balance = 0)" -ForegroundColor White
Write-Host "Partial Payment → Invoice Status: PARTIALLY_PAID (balance > 0)" -ForegroundColor White
Write-Host "No Payment      → Invoice Status: UNPAID (balance = total)" -ForegroundColor White
Write-Host ""
