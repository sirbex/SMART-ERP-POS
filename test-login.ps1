$body = @{
    email = "test@test.com"
    password = "password123"
} | ConvertTo-Json

Write-Host "Sending login request..."
Write-Host "Body: $body"

try {
    $response = Invoke-RestMethod -Uri 'http://localhost:3001/api/auth/login' -Method POST -ContentType 'application/json' -Body $body
    Write-Host "`nSuccess!"
    $response | ConvertTo-Json -Depth 5
    
    if ($response.data.token) {
        Write-Host "`nToken obtained:"
        Write-Host $response.data.token
    }
} catch {
    Write-Host "`nError occurred:"
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails.Message) {
        Write-Host "`nError details:"
        Write-Host $_.ErrorDetails.Message
    }
}
