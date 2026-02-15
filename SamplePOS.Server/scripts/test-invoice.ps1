param(
  [string]$BaseUrl = 'http://localhost:3001'
)

Write-Host "`n==============================" -ForegroundColor Cyan
Write-Host " Invoice API Quick Test" -ForegroundColor Cyan
Write-Host "==============================`n" -ForegroundColor Cyan

# Login/register fresh user for token
$ts = Get-Date -Format 'yyyyMMddHHmmss'
$loginBody = @{ email = "invoice.tester+$ts@example.com"; password = 'Password123!' } | ConvertTo-Json
try {
  $loginResp = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/api/auth/login" -Method POST -Body $loginBody -ContentType 'application/json'
  $token = ($loginResp.Content | ConvertFrom-Json).data.token
} catch {
  $regBody = @{ email = "invoice.tester+$ts@example.com"; password = 'Password123!'; fullName='Invoice Tester'; role='ADMIN' } | ConvertTo-Json
  $regResp = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/api/auth/register" -Method POST -Body $regBody -ContentType 'application/json'
  $token = ($regResp.Content | ConvertFrom-Json).data.token
}

if (-not $token) { throw 'No token' }
$auth = @{ Authorization = "Bearer $token" }
$authJson = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }

# Create a test customer and sale to ensure linkage exists
$custName = "Invoice Customer " + (Get-Date -Format 'yyyyMMdd-HHmmss')
$custBody = @{ name = $custName; email = "invoice.customer+$ts@example.com"; phone = "+256700000002"; address = "Kampala"; creditLimit = 100000 } | ConvertTo-Json
$custResp = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/api/customers" -Method POST -Headers $authJson -Body $custBody
$cust = ($custResp.Content | ConvertFrom-Json).data

$prod = (Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/api/products?page=1&limit=1" -Headers $auth | ConvertFrom-Json).data[0]
$unitPrice = [double]$prod.sellingPrice
$uom = if ($prod.unitOfMeasure) { $prod.unitOfMeasure } else { 'PIECE' }
$line = @{ productId = $prod.id; productName = $prod.name; sku = $prod.sku; uom = $uom; quantity = 1; unitPrice = $unitPrice; costPrice = 0; subtotal = $unitPrice }
$saleBody = @{ customerId = $cust.id; lineItems = @($line); subtotal = $unitPrice; taxAmount = 0; totalAmount = $unitPrice; paymentMethod = 'CREDIT'; amountTendered = $unitPrice; changeGiven = 0; notes = 'Invoice test sale' } | ConvertTo-Json -Depth 6
$saleResp = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/api/sales" -Method POST -Headers $authJson -Body $saleBody
$sale = ($saleResp.Content | ConvertFrom-Json).data.sale
if ($null -eq $sale) { $sale = ($saleResp.Content | ConvertFrom-Json).data }

# Create invoice with initial payment
$invBody = @{ customerId=$cust.id; saleId=$sale.id; dueDate=(Get-Date).AddDays(14).ToString('o'); initialPaymentAmount=2500 } | ConvertTo-Json
$invResp = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/api/invoices" -Headers $authJson -Method POST -Body $invBody
$invData = $invResp.Content | ConvertFrom-Json
$inv = $invData.data.invoice
Write-Host ("[1] Invoice: {0} Status: {1} Balance: {2}" -f $inv.invoice_number, $inv.status, $inv.balance) -ForegroundColor Green

# Record additional payment
$payBody = @{ amount=5000; paymentMethod='CASH' } | ConvertTo-Json
$payResp = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/api/invoices/$($inv.id)/payments" -Headers $authJson -Method POST -Body $payBody
$after = $payResp.Content | ConvertFrom-Json
$inv2 = $after.data.invoice
Write-Host ("[2] After payment -> Status: {0} AmountPaid: {1} Balance: {2}" -f $inv2.status, $inv2.amount_paid, $inv2.balance) -ForegroundColor Green

Write-Host "`n✅ Invoice API quick test complete" -ForegroundColor Green
