# Database Backup Script
# Creates timestamped backups of the pos_system database
# Usage: .\backup-database.ps1

$BACKUP_DIR = "backups"
$DB_NAME = "pos_system"
$DB_USER = "postgres"
$TIMESTAMP = Get-Date -Format "yyyyMMdd_HHmmss"
$BACKUP_FILE = "$BACKUP_DIR\${DB_NAME}_${TIMESTAMP}.sql"

# Create backups directory if it doesn't exist
if (!(Test-Path $BACKUP_DIR)) {
    New-Item -ItemType Directory -Path $BACKUP_DIR | Out-Null
}

Write-Host "🔄 Creating database backup..." -ForegroundColor Cyan
Write-Host "  Database: $DB_NAME" -ForegroundColor Gray
Write-Host "  Backup file: $BACKUP_FILE" -ForegroundColor Gray

try {
    # Create backup using pg_dump
    pg_dump -U $DB_USER -d $DB_NAME -F p -f $BACKUP_FILE
    
    if ($LASTEXITCODE -eq 0) {
        $fileSize = (Get-Item $BACKUP_FILE).Length / 1MB
        Write-Host "✅ Backup completed successfully!" -ForegroundColor Green
        Write-Host "  File size: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Gray
        
        # Keep only last 30 backups
        Write-Host "`n🧹 Cleaning up old backups..." -ForegroundColor Cyan
        $backups = Get-ChildItem -Path $BACKUP_DIR -Filter "${DB_NAME}_*.sql" | Sort-Object -Property CreationTime -Descending
        $toDelete = $backups | Select-Object -Skip 30
        
        if ($toDelete) {
            $toDelete | ForEach-Object {
                Remove-Item $_.FullName
                Write-Host "  Deleted: $($_.Name)" -ForegroundColor Yellow
            }
            Write-Host "✅ Kept latest 30 backups" -ForegroundColor Green
        } else {
            Write-Host "  No old backups to delete" -ForegroundColor Gray
        }
    } else {
        Write-Host "❌ Backup failed!" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
    exit 1
}
