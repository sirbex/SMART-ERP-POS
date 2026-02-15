$registerBody = @{
    email = 'test.admin@samplepos.com'
    password = 'TestAdmin123!'
    fullName = 'Test Administrator'
    role = 'ADMIN'
} | ConvertTo-Json

Write-Host "Registering new test admin user..."
Write-Host "Body: $registerBody"

try {
    $response = Invoke-RestMethod -Uri 'http://localhost:3001/api/auth/register' -Method POST -ContentType 'application/json' -Body $registerBody
    Write-Host "`nSuccess! User registered."
    $response | ConvertTo-Json -Depth 5
    
    if ($response.data.token) {
        Write-Host "`n=== TOKEN OBTAINED ==="
        Write-Host $response.data.token
        Write-Host "`n=== COPY THIS TOKEN TO BROWSER CONSOLE ==="
        Write-Host "localStorage.setItem('token', '$($response.data.token)');"
        Write-Host "window.location.reload();"
    }
} catch {
    Write-Host "`nError occurred:"
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails.Message) {
        Write-Host "`nError details:"
        Write-Host $_.ErrorDetails.Message
    }
}
