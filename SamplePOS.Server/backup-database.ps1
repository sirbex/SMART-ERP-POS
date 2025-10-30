# Database Backup Script
# Run this script to backup the PostgreSQL database

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = "backup_pos_system_$timestamp.sql"
$backupPath = ".\backups\$backupFile"

# Create backups directory if it doesn't exist
if (!(Test-Path ".\backups")) {
    New-Item -ItemType Directory -Path ".\backups" | Out-Null
}

Write-Host "📦 Starting database backup..." -ForegroundColor Cyan
Write-Host "   Database: pos_system" -ForegroundColor Gray
Write-Host "   File: $backupFile" -ForegroundColor Gray

# Run pg_dump
try {
    & pg_dump -U postgres -d pos_system -F c -f $backupPath
    
    if ($LASTEXITCODE -eq 0) {
        $fileSize = (Get-Item $backupPath).Length / 1MB
        Write-Host "✅ Backup completed successfully!" -ForegroundColor Green
        Write-Host "   Location: $backupPath" -ForegroundColor Gray
        Write-Host "   Size: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Gray
        
        # Keep only last 7 backups
        Write-Host "`n🧹 Cleaning old backups..." -ForegroundColor Cyan
        Get-ChildItem ".\backups\backup_pos_system_*.sql" | 
            Sort-Object LastWriteTime -Descending | 
            Select-Object -Skip 7 | 
            Remove-Item -Force
        
        $remainingBackups = (Get-ChildItem ".\backups\backup_pos_system_*.sql").Count
        Write-Host "   Kept $remainingBackups most recent backups" -ForegroundColor Gray
    } else {
        Write-Host "❌ Backup failed!" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error during backup: $_" -ForegroundColor Red
    exit 1
}

# Optional: Upload to cloud storage (uncomment and configure)
# Write-Host "`n☁️  Uploading to cloud storage..." -ForegroundColor Cyan
# aws s3 cp $backupPath s3://your-bucket/database-backups/$backupFile
# Write-Host "   Uploaded to S3" -ForegroundColor Gray
