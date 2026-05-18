$r = Invoke-RestMethod -Method POST -Uri "http://localhost:3001/api/auth/login" `
    -ContentType "application/json" `
    -Body '{"email":"admin@samplepos.com","password":"admin123"}'
$token = $r.data.token
$h = @{ Authorization = "Bearer $token" }

Write-Host "=== CLEARING BALANCE API ===" -ForegroundColor Cyan
$bal = Invoke-RestMethod -Uri "http://localhost:3001/api/grir-clearing/balance" -Headers $h
$bal | ConvertTo-Json -Depth 5

Write-Host ""
Write-Host "=== OPEN ITEMS API (all) ===" -ForegroundColor Cyan
$items = Invoke-RestMethod -Uri "http://localhost:3001/api/grir-clearing/open" -Headers $h
$items | ConvertTo-Json -Depth 5

Write-Host ""
Write-Host "=== OPEN ITEMS filtered UNMATCHED ===" -ForegroundColor Cyan
$unmatched = Invoke-RestMethod -Uri "http://localhost:3001/api/grir-clearing/open?status=UNMATCHED" -Headers $h
$unmatched | ConvertTo-Json -Depth 5
