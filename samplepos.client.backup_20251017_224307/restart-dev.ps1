# Kill any running Node.js processes
Write-Host "Stopping any running Node.js processes..." -ForegroundColor Yellow
taskkill /F /IM node.exe 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Successfully stopped Node.js processes." -ForegroundColor Green
} else {
    Write-Host "No running Node.js processes found." -ForegroundColor Cyan
}

# Wait a moment for processes to fully terminate
Start-Sleep -Seconds 2

# Start the development server
Write-Host "Starting development server on port 3000..." -ForegroundColor Yellow
npm run dev