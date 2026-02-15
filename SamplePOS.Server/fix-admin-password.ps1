# Fix admin password hash in database

$hash = '$2b$10$CDa/2yDxiwf9pqZFbWvJLuiPxlgOypZpTKi2HPRLbocTvebohBLWC'
$email = 'admin@samplepos.com'

Write-Host "Updating admin user password hash..." -ForegroundColor Yellow

# Run UPDATE
psql postgresql://postgres@localhost:5432/pos_system -c "UPDATE users SET password_hash = '$hash' WHERE email = '$email';"

# Run SELECT to verify
Write-Host "`nVerifying update..." -ForegroundColor Yellow
psql postgresql://postgres@localhost:5432/pos_system -c "SELECT email, full_name, role FROM users WHERE email = '$email';"

Write-Host "`nPassword updated! You can now login with:" -ForegroundColor Green
Write-Host "  Email: admin@samplepos.com" -ForegroundColor Cyan
Write-Host "  Password: admin123" -ForegroundColor Cyan
