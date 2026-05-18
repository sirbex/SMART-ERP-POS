$r = Invoke-RestMethod -Method POST -Uri "http://localhost:3001/api/auth/login" `
    -ContentType "application/json" `
    -Body '{"email":"admin@samplepos.com","password":"admin123"}'
$token = $r.data.token
$h = @{ Authorization = "Bearer $token" }

# Abchlor eye drops product id
$productId = "98cc5e26-bd41-462d-b072-0e73a2c02229"

Write-Host "=== PRODUCT HISTORY API — Abchlor eye drops ===" -ForegroundColor Cyan
$hist = Invoke-RestMethod -Uri "http://localhost:3001/api/products/$productId/history" -Headers $h
$hist | ConvertTo-Json -Depth 6

Write-Host ""
Write-Host "=== SUMMARY: quantityChange and runningQuantity per GOODS_RECEIPT event ===" -ForegroundColor Cyan
foreach ($item in $hist.data.items) {
    if ($item.type -eq "GOODS_RECEIPT") {
        $gr = $item.reference.grNumber
        $qty = $item.quantityChange
        $uom = $item.uomName
        $running = $item.runningQuantity
        Write-Host ('GR: ' + $gr + ' | qty: ' + $qty + ' ' + $uom + ' | running: ' + $running)
    }
}
