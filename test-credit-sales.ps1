#!/usr/bin/env pwsh
<#
.SYNOPSIS
Test script for credit sale functionality (partial payment and zero payment invoices)

.DESCRIPTION
Tests the following scenarios:
1. Full credit sale (zero payment)
2. Partial payment credit sale
3. Credit sale without customer (should fail)
4. Full payment (no credit)
#>

$ErrorActionPreference = "Stop"
$baseUrl = "http://localhost:3001"

Write-Host "`n🧪 CREDIT SALE FUNCTIONALITY TEST`n" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Gray

# Colors
function Write-Success { param($msg) Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Failure { param($msg) Write-Host "❌ $msg" -ForegroundColor Red }
function Write-Info { param($msg) Write-Host "ℹ️  $msg" -ForegroundColor Blue }
function Write-Test { param($msg) Write-Host "`n🔬 TEST: $msg" -ForegroundColor Yellow }

# Helper function to make API calls
function Invoke-ApiCall {
    param(
        [string]$Method,
        [string]$Endpoint,
        [hashtable]$Body = $null,
        [string]$Token = $null
    )
    
    $headers = @{
        "Content-Type" = "application/json"
    }
    
    if ($Token) {
        $headers["Authorization"] = "Bearer $Token"
    }
    
    $params = @{
        Method = $Method
        Uri = "$baseUrl$Endpoint"
        Headers = $headers
    }
    
    if ($Body) {
        $params["Body"] = ($Body | ConvertTo-Json -Depth 10)
    }
    
    try {
        $response = Invoke-RestMethod @params
        return $response
    } catch {
        Write-Host "API Error: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "Response: $responseBody" -ForegroundColor Red
        }
        throw
    }
}

# Step 1: Login
Write-Test "Login as admin user"
try {
    $loginResponse = Invoke-ApiCall -Method POST -Endpoint "/api/auth/login" -Body @{
        email = "admin@samplepos.com"
        password = "Admin@123"
    }
    
    if ($loginResponse.success -and $loginResponse.data.token) {
        $token = $loginResponse.data.token
        Write-Success "Login successful. Token obtained."
    } else {
        Write-Failure "Login failed"
        exit 1
    }
} catch {
    Write-Failure "Login error: $_"
    exit 1
}

# Step 2: Get or create a test customer
Write-Test "Get or create test customer"
try {
    $customersResponse = Invoke-ApiCall -Method GET -Endpoint "/api/customers" -Token $token
    
    $testCustomer = $customersResponse.data | Where-Object { $_.email -eq "test.credit@example.com" }
    
    if (-not $testCustomer) {
        Write-Info "Creating test customer..."
        $createCustomerResponse = Invoke-ApiCall -Method POST -Endpoint "/api/customers" -Token $token -Body @{
            name = "Test Credit Customer"
            email = "test.credit@example.com"
            phone = "0700000000"
            creditLimit = 1000000
            balance = 0
        }
        $testCustomer = $createCustomerResponse.data
    }
    
    $customerId = $testCustomer.id
    Write-Success "Customer ready: $($testCustomer.name) (ID: $customerId)"
} catch {
    Write-Failure "Customer setup error: $_"
    exit 1
}

# Step 3: Get test products
Write-Test "Get test products for sale"
try {
    $productsResponse = Invoke-ApiCall -Method GET -Endpoint "/api/products?limit=2" -Token $token
    
    if ($productsResponse.data.length -lt 1) {
        Write-Failure "No products available for testing"
        exit 1
    }
    
    $product1 = $productsResponse.data[0]
    Write-Success "Product selected: $($product1.name) @ $('{0:N0}' -f $product1.price) UGX"
} catch {
    Write-Failure "Product fetch error: $_"
    exit 1
}

# Step 4: Test Full Credit Sale (Zero Payment)
Write-Test "TEST 1: Full Credit Sale (Zero Payment)"
try {
    $totalAmount = 50000
    
    $saleData = @{
        customerId = $customerId
        lineItems = @(
            @{
                productId = $product1.id
                productName = $product1.name
                sku = $product1.sku
                uom = "pcs"
                quantity = 2
                unitPrice = 25000
                costPrice = $product1.cost
                subtotal = $totalAmount
                taxAmount = 0
            }
        )
        subtotal = $totalAmount
        discountAmount = 0
        taxAmount = 0
        totalAmount = $totalAmount
        paymentLines = @(
            @{
                paymentMethod = "CREDIT"
                amount = 0
                reference = $null
            }
        )
    }
    
    $saleResponse = Invoke-ApiCall -Method POST -Endpoint "/api/pos/sales" -Token $token -Body $saleData
    
    if ($saleResponse.success -and $saleResponse.data) {
        $sale = $saleResponse.data
        Write-Success "Full credit sale created: $($sale.saleNumber)"
        Write-Info "  Total: $('{0:N0}' -f $sale.totalAmount) UGX"
        Write-Info "  Amount Paid: 0 UGX"
        Write-Info "  Balance Due: $('{0:N0}' -f $sale.totalAmount) UGX"
        Write-Info "  Payment Method: CREDIT"
    } else {
        Write-Failure "Full credit sale failed"
        Write-Host ($saleResponse | ConvertTo-Json -Depth 5)
    }
} catch {
    Write-Failure "Full credit sale error: $_"
}

Start-Sleep -Seconds 1

# Step 5: Test Partial Payment Credit Sale
Write-Test "TEST 2: Partial Payment Credit Sale"
try {
    $totalAmount = 100000
    $paidAmount = 40000
    $creditAmount = 60000
    
    $saleData = @{
        customerId = $customerId
        lineItems = @(
            @{
                productId = $product1.id
                productName = $product1.name
                sku = $product1.sku
                uom = "pcs"
                quantity = 4
                unitPrice = 25000
                costPrice = $product1.cost
                subtotal = $totalAmount
                taxAmount = 0
            }
        )
        subtotal = $totalAmount
        discountAmount = 0
        taxAmount = 0
        totalAmount = $totalAmount
        paymentLines = @(
            @{
                paymentMethod = "CASH"
                amount = $paidAmount
                reference = $null
            },
            @{
                paymentMethod = "CREDIT"
                amount = $creditAmount
                reference = $null
            }
        )
    }
    
    $saleResponse = Invoke-ApiCall -Method POST -Endpoint "/api/pos/sales" -Token $token -Body $saleData
    
    if ($saleResponse.success -and $saleResponse.data) {
        $sale = $saleResponse.data
        Write-Success "Partial payment credit sale created: $($sale.saleNumber)"
        Write-Info "  Total: $('{0:N0}' -f $totalAmount) UGX"
        Write-Info "  Paid (CASH): $('{0:N0}' -f $paidAmount) UGX"
        Write-Info "  Credit: $('{0:N0}' -f $creditAmount) UGX"
    } else {
        Write-Failure "Partial payment credit sale failed"
        Write-Host ($saleResponse | ConvertTo-Json -Depth 5)
    }
} catch {
    Write-Failure "Partial payment credit sale error: $_"
}

Start-Sleep -Seconds 1

# Step 6: Test Credit Sale Without Customer (Should Fail)
Write-Test "TEST 3: Credit Sale Without Customer (Should Fail)"
try {
    $totalAmount = 50000
    
    $saleData = @{
        customerId = $null
        lineItems = @(
            @{
                productId = $product1.id
                productName = $product1.name
                sku = $product1.sku
                uom = "pcs"
                quantity = 2
                unitPrice = 25000
                costPrice = $product1.cost
                subtotal = $totalAmount
                taxAmount = 0
            }
        )
        subtotal = $totalAmount
        discountAmount = 0
        taxAmount = 0
        totalAmount = $totalAmount
        paymentLines = @(
            @{
                paymentMethod = "CREDIT"
                amount = 0
                reference = $null
            }
        )
    }
    
    try {
        $saleResponse = Invoke-ApiCall -Method POST -Endpoint "/api/pos/sales" -Token $token -Body $saleData
        Write-Failure "Credit sale without customer should have failed but succeeded!"
    } catch {
        Write-Success "Credit sale without customer correctly rejected"
    }
} catch {
    Write-Success "Credit sale without customer correctly rejected"
}

Start-Sleep -Seconds 1

# Step 7: Test Normal Full Payment Sale
Write-Test "TEST 4: Normal Full Payment Sale (No Credit)"
try {
    $totalAmount = 75000
    
    $saleData = @{
        customerId = $customerId
        lineItems = @(
            @{
                productId = $product1.id
                productName = $product1.name
                sku = $product1.sku
                uom = "pcs"
                quantity = 3
                unitPrice = 25000
                costPrice = $product1.cost
                subtotal = $totalAmount
                taxAmount = 0
            }
        )
        subtotal = $totalAmount
        discountAmount = 0
        taxAmount = 0
        totalAmount = $totalAmount
        paymentLines = @(
            @{
                paymentMethod = "CASH"
                amount = $totalAmount
                reference = $null
            }
        )
    }
    
    $saleResponse = Invoke-ApiCall -Method POST -Endpoint "/api/pos/sales" -Token $token -Body $saleData
    
    if ($saleResponse.success -and $saleResponse.data) {
        $sale = $saleResponse.data
        Write-Success "Full payment sale created: $($sale.saleNumber)"
        Write-Info "  Total: $('{0:N0}' -f $totalAmount) UGX"
        Write-Info "  Paid: $('{0:N0}' -f $totalAmount) UGX"
        Write-Info "  Payment Method: CASH"
    } else {
        Write-Failure "Full payment sale failed"
    }
} catch {
    Write-Failure "Full payment sale error: $_"
}

# Summary
Write-Host "`n" -NoNewline
Write-Host "=" * 60 -ForegroundColor Gray
Write-Host "`n✨ TEST SUITE COMPLETED" -ForegroundColor Cyan
Write-Host "`nKey Findings:" -ForegroundColor Yellow
Write-Host "  • Full credit sales (zero payment) should work"
Write-Host "  • Partial payment credit sales should work"
Write-Host "  • Credit sales without customer should be rejected"
Write-Host "  • Normal full payment sales should work"
Write-Host "`n"
