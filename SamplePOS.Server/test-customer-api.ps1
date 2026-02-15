# Customer API Smoke Test
# Requires backend running on http://localhost:3001

$baseUrl = "http://localhost:3001"

Write-Host "`n==============================" -ForegroundColor Cyan
Write-Host " Customer API Smoke Test" -ForegroundColor Cyan
Write-Host "==============================`n" -ForegroundColor Cyan

# 0) Health
try {
  $health = Invoke-WebRequest -Uri "$baseUrl/health" -UseBasicParsing -TimeoutSec 5
  Write-Host "[0] Health: $($health.StatusCode)" -ForegroundColor Green
} catch {
  Write-Host "[0] Health failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

# 1) Login or Register
$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$testEmail = "customer.test+$timestamp@example.com"
$testPassword = "Password123!"
$testFullName = "Customer Tester"
$token = $null
${userId} = $null
try {
  $loginBody = @{ email = $testEmail; password = $testPassword } | ConvertTo-Json
  $loginResp = Invoke-WebRequest -Uri "$baseUrl/api/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -UseBasicParsing
  $loginData = $loginResp.Content | ConvertFrom-Json
  $token = $loginData.data.token
  # Fetch profile to get user id
  $profileResp = Invoke-WebRequest -Uri "$baseUrl/api/auth/profile" -Headers @{ Authorization = "Bearer $token" } -UseBasicParsing
  $profile = $profileResp.Content | ConvertFrom-Json
  ${userId} = $profile.data.id
} catch {
  Write-Host "[1] Login failed; attempting register" -ForegroundColor Yellow
  $registerBody = @{ email = $testEmail; password = $testPassword; fullName = $testFullName; role = "ADMIN" } | ConvertTo-Json
  $regResp = Invoke-WebRequest -Uri "$baseUrl/api/auth/register" -Method POST -Body $registerBody -ContentType "application/json" -UseBasicParsing
  $regData = $regResp.Content | ConvertFrom-Json
  $token = $regData.data.token
  # Fetch profile to get user id
  $profileResp = Invoke-WebRequest -Uri "$baseUrl/api/auth/profile" -Headers @{ Authorization = "Bearer $token" } -UseBasicParsing
  $profile = $profileResp.Content | ConvertFrom-Json
  ${userId} = $profile.data.id
}

if (-not $token) { Write-Host "[1] No token" -ForegroundColor Red; exit 1 }
if (-not ${userId}) { Write-Host "[1] No userId from profile" -ForegroundColor Red; exit 1 }
$auth = @{ Authorization = "Bearer $token" }
$authJson = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
Write-Host "[1] Authenticated" -ForegroundColor Green

# 2) Pick first active supplier
$suppliersResp = Invoke-WebRequest -Uri "$baseUrl/api/suppliers?page=1&limit=1" -Headers $auth -UseBasicParsing
$suppliers = $suppliersResp.Content | ConvertFrom-Json
if (-not $suppliers.data -or $suppliers.data.Count -eq 0) { Write-Host "[2] No suppliers found" -ForegroundColor Red; exit 1 }
$supplier = $suppliers.data[0]
Write-Host "[2] Supplier: $($supplier.name)" -ForegroundColor Green

# 3) Pick first active product
$productsResp = Invoke-WebRequest -Uri "$baseUrl/api/products?page=1&limit=1" -Headers $auth -UseBasicParsing
$products = $productsResp.Content | ConvertFrom-Json
if (-not $products.data -or $products.data.Count -eq 0) { Write-Host "[3] No products found" -ForegroundColor Red; exit 1 }
$product = $products.data[0]
Write-Host "[3] Product: $($product.name) (Price: $($product.sellingPrice))" -ForegroundColor Green

# 4) Create test customer
$customerName = "Test Customer " + (Get-Date -Format "yyyyMMdd-HHmmss")
$uniqueCustomerEmail = "test.customer+${timestamp}@example.com"
try {
  $custBody = @{ name = $customerName; email = $uniqueCustomerEmail; phone = "+256700000001"; address = "Kampala"; creditLimit = 100000 } | ConvertTo-Json
  $custResp = Invoke-WebRequest -Uri "$baseUrl/api/customers" -Method POST -Headers $authJson -Body $custBody -UseBasicParsing
  $custData = $custResp.Content | ConvertFrom-Json
  $customer = $custData.data
  Write-Host "[4] Customer created: $($customer.name) [$($customer.id)]" -ForegroundColor Green
} catch {
  # If duplicate or other error, try to find by name
  Write-Host "[4] Create customer failed; attempting to fetch existing by list..." -ForegroundColor Yellow
  $custListResp = Invoke-WebRequest -Uri "$baseUrl/api/customers?page=1&limit=50" -Headers $auth -UseBasicParsing
  $custList = $custListResp.Content | ConvertFrom-Json
  $customer = $custList.data | Where-Object { $_.name -eq $customerName } | Select-Object -First 1
  if ($null -eq $customer) { Write-Host "[4] No matching customer found; aborting" -ForegroundColor Red; exit 1 }
  Write-Host "[4] Using existing customer: $($customer.name) [$($customer.id)]" -ForegroundColor Yellow
}

# 5) Create Purchase Order for inventory (module schema)
$poQty = 5
$poUnitCost = [double]$product.sellingPrice
$poItem = @{ productId = $product.id; productName = $product.name; quantity = $poQty; unitCost = $poUnitCost }
$poBody = @{ supplierId = $supplier.id; orderDate = (Get-Date).ToString("o"); expectedDate = (Get-Date).AddDays(3).ToString("o"); createdBy = ${userId}; items = @($poItem) } | ConvertTo-Json -Depth 6
$poResp = Invoke-WebRequest -Uri "$baseUrl/api/purchase-orders" -Method POST -Headers $authJson -Body $poBody -UseBasicParsing
$poData = $poResp.Content | ConvertFrom-Json
$po = $poData.data.po
if ($null -eq $po) { $po = $poData.data }
Write-Host "[5] PO: $($po.poNumber) [$($po.id)]" -ForegroundColor Green

# 6) Create and finalize Goods Receipt (module schema)
$batch = "BATCH-" + (Get-Date -Format "HHmmss")
$poItemId = $null
try { if ($po.items -and $po.items.Count -gt 0) { $poItemId = $po.items[0].id } } catch { $poItemId = $null }
$grItem = @{ poItemId = $poItemId; productId = $product.id; productName = $product.name; orderedQuantity = $poQty; receivedQuantity = $poQty; unitCost = $poUnitCost; batchNumber = $batch; expiryDate = (Get-Date).AddMonths(12).ToString("o") }
$grBody = @{ purchaseOrderId = $po.id; supplierId = $supplier.id; receiptDate = (Get-Date).ToString("o"); receivedBy = ${userId}; notes = "Smoke test"; items = @($grItem) } | ConvertTo-Json -Depth 6
$grResp = Invoke-WebRequest -Uri "$baseUrl/api/goods-receipts" -Method POST -Headers $authJson -Body $grBody -UseBasicParsing
$grData = $grResp.Content | ConvertFrom-Json
$gr = $grData.data.gr
if ($null -eq $gr) { $gr = $grData.data }
$grFin = Invoke-WebRequest -Uri "$baseUrl/api/goods-receipts/$($gr.id)/finalize" -Method POST -Headers $authJson -UseBasicParsing
Write-Host "[6] GR finalized: $($gr.grNumber)" -ForegroundColor Green

# 7) Create CREDIT sale for the customer (POS format)
$unitPrice = [double]$product.sellingPrice
$uom = if ($product.unitOfMeasure) { $product.unitOfMeasure } else { 'PIECE' }
$line = @{ productId = $product.id; productName = $product.name; sku = $product.sku; uom = $uom; quantity = 1; unitPrice = $unitPrice; costPrice = 0; subtotal = $unitPrice }
$saleBody = @{ customerId = $customer.id; lineItems = @($line); subtotal = $unitPrice; taxAmount = 0; totalAmount = $unitPrice; paymentMethod = 'CREDIT'; amountTendered = $unitPrice; changeGiven = 0; notes = 'Test credit sale' } | ConvertTo-Json -Depth 6
$saleResp = Invoke-WebRequest -Uri "$baseUrl/api/sales" -Method POST -Headers $authJson -Body $saleBody -UseBasicParsing
$saleData = $saleResp.Content | ConvertFrom-Json
$sale = $saleData.data.sale
if ($null -eq $sale) { $sale = $saleData.data }
$saleNumberOut = if ($sale.saleNumber) { $sale.saleNumber } elseif ($sale.sale_number) { $sale.sale_number } else { '' }
$saleTotalOut = if ($sale.totalAmount) { $sale.totalAmount } elseif ($sale.total_amount) { $sale.total_amount } else { '' }
Write-Host "[7] Sale created: $saleNumberOut -> Total: $saleTotalOut" -ForegroundColor Green

# 8) Verify customer endpoints
$salesList = Invoke-WebRequest -Uri "$baseUrl/api/customers/$($customer.id)/sales?page=1&limit=10" -Headers $auth -UseBasicParsing
$txList = Invoke-WebRequest -Uri "$baseUrl/api/customers/$($customer.id)/transactions?page=1&limit=10" -Headers $auth -UseBasicParsing
$summary = Invoke-WebRequest -Uri "$baseUrl/api/customers/$($customer.id)/summary" -Headers $auth -UseBasicParsing

$salesData = $salesList.Content | ConvertFrom-Json
$txData = $txList.Content | ConvertFrom-Json
$summaryData = $summary.Content | ConvertFrom-Json

Write-Host "[8] Customer sales returned: $($salesData.data.Count)" -ForegroundColor Green
Write-Host "[8] Customer transactions returned: $($txData.data.Count)" -ForegroundColor Green
Write-Host "[8] Summary invoices: $($summaryData.data.totalInvoices) TotalSpent: $($summaryData.data.totalSpent)" -ForegroundColor Green

Write-Host "`n✅ Customer API smoke test complete" -ForegroundColor Green
