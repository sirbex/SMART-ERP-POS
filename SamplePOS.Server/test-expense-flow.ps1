#!/usr/bin/env pwsh
# Test expense creation and mark-as-paid flow

$baseUrl = "http://localhost:3001/api"

# 1. Login
Write-Host "1. Logging in..." -ForegroundColor Cyan
$loginBody = @{ email = "admin@samplepos.com"; password = "admin123" } | ConvertTo-Json
$loginResp = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method POST -ContentType "application/json" -Body $loginBody
$token = $loginResp.data.token
Write-Host "   Token acquired: $($token.Substring(0, 50))..." -ForegroundColor Green

# Headers for all subsequent requests
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
}

# 2. Create expense
Write-Host "`n2. Creating expense..." -ForegroundColor Cyan
$expenseBody = @{
    title = "Test Office Supplies"
    description = "Pens and paper for accounting department"
    amount = 150.00
    expense_date = "2025-01-06"
    category = "OFFICE"
    vendor = "Office Mart"
    payment_method = "CASH"
} | ConvertTo-Json

try {
    $expenseResp = Invoke-RestMethod -Uri "$baseUrl/expenses" -Method POST -Headers $headers -Body $expenseBody
    $expenseId = $expenseResp.data.id
    $expenseNum = $expenseResp.data.expenseNumber
    Write-Host "   Created expense: $expenseNum (ID: $expenseId)" -ForegroundColor Green
    Write-Host "   Status: $($expenseResp.data.status)" -ForegroundColor Yellow
    Write-Host "   Account ID: $($expenseResp.data.accountId)" -ForegroundColor Yellow
} catch {
    Write-Host "   FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

# 3. Approve expense
Write-Host "`n3. Approving expense..." -ForegroundColor Cyan
try {
    $approveResp = Invoke-RestMethod -Uri "$baseUrl/expenses/$expenseId/approve" -Method POST -Headers $headers -Body "{}"
    Write-Host "   Approved! Status: $($approveResp.data.status)" -ForegroundColor Green
} catch {
    Write-Host "   FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

# 4. Mark as paid
Write-Host "`n4. Marking expense as paid..." -ForegroundColor Cyan
$paidBody = @{
    paymentDate = "2025-01-06"
    paymentReference = "OFFICE-001"
} | ConvertTo-Json

try {
    $paidResp = Invoke-RestMethod -Uri "$baseUrl/expenses/$expenseId/mark-paid" -Method POST -Headers $headers -Body $paidBody
    Write-Host "   Marked as PAID! Status: $($paidResp.data.status)" -ForegroundColor Green
} catch {
    Write-Host "   FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

# Wait for GL entry (async)
Write-Host "`n5. Waiting for GL entry (2 seconds)..." -ForegroundColor Cyan
Start-Sleep -Seconds 2

# 6. Verify GL entry in database
Write-Host "`n6. Verifying GL entry in database..." -ForegroundColor Cyan
$sqlCheck = @"
SELECT 
    lt."TransactionNumber",
    lt."Description",
    le."DebitAmount",
    le."CreditAmount",
    a."AccountCode",
    a."AccountName"
FROM ledger_transactions lt
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE lt."ReferenceType" = 'EXPENSE'
AND lt."ReferenceId" = '$expenseId'
ORDER BY le."DebitAmount" DESC;
"@

$result = psql -U postgres -d pos_system -c $sqlCheck 2>&1
Write-Host $result -ForegroundColor White

Write-Host "`n=== TEST COMPLETE ===" -ForegroundColor Green
