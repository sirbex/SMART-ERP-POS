# Test Quotations API
# Verify POS quick quotes are visible in the API

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing Quotations API" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get auth token
$tokenFile = "$env:USERPROFILE\.pos-token"
if (-not (Test-Path $tokenFile)) {
    Write-Host "❌ No auth token found. Please login first." -ForegroundColor Red
    Write-Host "Run: .\test-login.ps1" -ForegroundColor Yellow
    exit 1
}

$token = (Get-Content $tokenFile -Raw).Trim()
$baseUrl = "http://localhost:3001"

Write-Host "🔍 Fetching quotations list..." -ForegroundColor Yellow
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/quotations?limit=10" `
        -Method GET `
        -Headers @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
        }
    
    if ($response.success) {
        Write-Host "✅ API Success!" -ForegroundColor Green
        Write-Host ""
        
        $quotations = $response.data.quotations
        $total = $response.data.total
        
        Write-Host "📊 Total Quotations: $total" -ForegroundColor Cyan
        Write-Host ""
        
        if ($quotations.Count -gt 0) {
            Write-Host "Recent Quotations:" -ForegroundColor Yellow
            Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
            
            foreach ($quote in $quotations) {
                $typeColor = if ($quote.quoteType -eq 'quick') { 'Green' } else { 'Blue' }
                $typeLabel = if ($quote.quoteType -eq 'quick') { 'Quick (POS)' } else { 'Standard' }
                
                Write-Host "$($quote.quoteNumber)" -ForegroundColor Cyan -NoNewline
                Write-Host " | " -NoNewline
                Write-Host "$typeLabel" -ForegroundColor $typeColor -NoNewline
                Write-Host " | " -NoNewline
                Write-Host "$($quote.customerName)" -ForegroundColor White -NoNewline
                Write-Host " | " -NoNewline
                Write-Host "UGX $([math]::Round($quote.totalAmount, 2))" -ForegroundColor Yellow -NoNewline
                Write-Host " | " -NoNewline
                Write-Host "$($quote.status)" -ForegroundColor Magenta
            }
            
            Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
            Write-Host ""
            
            # Count by type
            $quickCount = ($quotations | Where-Object { $_.quoteType -eq 'quick' }).Count
            $standardCount = ($quotations | Where-Object { $_.quoteType -eq 'standard' }).Count
            
            Write-Host "📈 Breakdown:" -ForegroundColor Yellow
            Write-Host "   Quick (POS): $quickCount" -ForegroundColor Green
            Write-Host "   Standard: $standardCount" -ForegroundColor Blue
            Write-Host ""
            
            if ($quickCount -gt 0) {
                Write-Host "✅ POS Quick Quotes ARE visible in the API!" -ForegroundColor Green
            } else {
                Write-Host "⚠️  No POS quick quotes found in results" -ForegroundColor Yellow
            }
        } else {
            Write-Host "ℹ️  No quotations found" -ForegroundColor Yellow
        }
        
    } else {
        Write-Host "❌ API returned error: $($response.error)" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Request failed: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error details:" -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
