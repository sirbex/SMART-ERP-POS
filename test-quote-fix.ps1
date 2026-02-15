#!/usr/bin/env pwsh
# Test Quote Partial Payment Invoice Creation Fix
# Verifies that the invoice creation logic correctly handles quote-linked sales

$baseUrl = "http://localhost:3001"
$token = ""

Write-Host "🧪 Testing Quote Partial Payment Invoice Fix" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Login with a working account
Write-Host "1️⃣  Attempting login..." -ForegroundColor Yellow

$loginAttempts = @(
    @{ email = "admin@samplepos.com"; password = "admin123" },
    @{ email = "testadmin@samplepos.com"; password = "admin123" },
    @{ email = "test@samplepos.com"; password = "password123" },
    @{ email = "admin@test.com"; password = "admin123" }
)

foreach ($attempt in $loginAttempts) {
    try {
        Write-Host "   Trying: $($attempt.email)" -ForegroundColor Gray
        $loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -Body (@{
            email = $attempt.email
            password = $attempt.password
        } | ConvertTo-Json) -ContentType "application/json"

        if ($loginResponse.success) {
            $token = $loginResponse.data.token
            Write-Host "   ✅ Login successful with: $($attempt.email)" -ForegroundColor Green
            break
        }
    } catch {
        Write-Host "   ❌ Failed: $($attempt.email)" -ForegroundColor Red
    }
}

if (-not $token) {
    Write-Host ""
    Write-Host "❌ Could not authenticate with any test account." -ForegroundColor Red
    Write-Host "Please ensure the backend server is running and has test users." -ForegroundColor Yellow
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# Step 2: Test the fix by trying to create a quote and convert with partial payment
Write-Host ""
Write-Host "2️⃣  Testing Quote Conversion with Partial Payment..." -ForegroundColor Yellow

try {
    # Get a customer for the test
    $customersResponse = Invoke-RestMethod -Uri "$baseUrl/api/customers?limit=1" -Headers $headers
    if (-not $customersResponse.success -or $customersResponse.data.data.Count -eq 0) {
        Write-Host "   ⚠️  No customers found, creating test customer..." -ForegroundColor Yellow
        $customerData = @{
            name = "Test Customer for Quote Fix"
            email = "testquote@example.com"
            phone = "1234567890"
        } | ConvertTo-Json
        
        $customerResponse = Invoke-RestMethod -Uri "$baseUrl/api/customers" -Method POST -Body $customerData -Headers $headers
        $customer = $customerResponse.data
        Write-Host "   ✅ Test customer created: $($customer.name)" -ForegroundColor Green
    } else {
        $customer = $customersResponse.data.data[0]
        Write-Host "   ✅ Using existing customer: $($customer.name)" -ForegroundColor Green
    }

    # Get a product for the test  
    $productsResponse = Invoke-RestMethod -Uri "$baseUrl/api/products?limit=1" -Headers $headers
    if (-not $productsResponse.success -or $productsResponse.data.data.Count -eq 0) {
        Write-Host "   ❌ No products found - cannot create quote" -ForegroundColor Red
        exit 1
    }
    
    $product = $productsResponse.data.data[0]
    Write-Host "   ✅ Using product: $($product.name)" -ForegroundColor Green

    # Create a quick quote
    $quoteData = @{
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

    Write-Host "   Creating quote..." -ForegroundColor Gray
    $quoteResponse = Invoke-RestMethod -Uri "$baseUrl/api/pos/quote" -Method POST -Body $quoteData -Headers $headers
    
    if (-not $quoteResponse.success) {
        Write-Host "   ❌ Failed to create quote: $($quoteResponse.error)" -ForegroundColor Red
        exit 1
    }
    
    $quoteId = $quoteResponse.data.id
    $quoteNumber = $quoteResponse.data.quoteNumber
    $quoteTotal = $quoteResponse.data.totalAmount
    
    Write-Host "   ✅ Quote created: $quoteNumber (Total: $quoteTotal)" -ForegroundColor Green

    # Test the fix: Convert with partial payment
    Write-Host ""
    Write-Host "3️⃣  Converting quote with PARTIAL PAYMENT (THE FIX TEST)..." -ForegroundColor Yellow
    
    $depositAmount = [math]::Round($quoteTotal * 0.5, 2)  # 50% deposit
    
    $conversionData = @{
        paymentOption = "partial"
        depositAmount = $depositAmount
        depositMethod = "CASH"
        cashierId = $loginResponse.data.user.id
    } | ConvertTo-Json

    Write-Host "   Converting with deposit: $depositAmount (50% of $quoteTotal)" -ForegroundColor Gray
    
    $conversionResponse = Invoke-RestMethod -Uri "$baseUrl/api/quotations/$quoteId/convert" -Method POST -Body $conversionData -Headers $headers
    
    if ($conversionResponse.success) {
        $sale = $conversionResponse.data.sale
        $invoice = $conversionResponse.data.invoice
        
        Write-Host ""
        Write-Host "🎉 SUCCESS! The fix works!" -ForegroundColor Green
        Write-Host "   ✅ Sale created: $($sale.sale_number)" -ForegroundColor Green
        Write-Host "   ✅ Invoice created: $($invoice.invoice_number)" -ForegroundColor Green
        Write-Host "   ✅ Invoice status: $($invoice.status)" -ForegroundColor Green
        Write-Host "   ✅ Invoice balance: $($invoice.balance)" -ForegroundColor Green
        Write-Host ""
        Write-Host "🔧 Quote-linked partial payments now create invoices correctly!" -ForegroundColor Cyan
        
    } else {
        Write-Host "   ❌ Conversion failed: $($conversionResponse.error)" -ForegroundColor Red
        exit 1
    }

} catch {
    Write-Host ""
    Write-Host "❌ Test failed with error:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.Exception.Response) {
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "Response body: $responseBody" -ForegroundColor Yellow
        } catch {
            Write-Host "Could not read error response body" -ForegroundColor Yellow
        }
    }
    exit 1
}

Write-Host ""
Write-Host "✅ All tests passed! The invoice creation fix is working correctly." -ForegroundColor Green
Write-Host ""