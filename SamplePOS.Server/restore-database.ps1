# Database Restore Script
# Restores database from a backup file
# Usage: .\restore-database.ps1 -BackupFile "backups\pos_system_20251114_220000.sql"

param(
    [Parameter(Mandatory=$false)]
    [string]$BackupFile
)

$DB_NAME = "pos_system"
$DB_USER = "postgres"
$BACKUP_DIR = "backups"

# If no backup file specified, show list and prompt
if (!$BackupFile) {
    Write-Host "📂 Available backups:" -ForegroundColor Cyan
    $backups = Get-ChildItem -Path $BACKUP_DIR -Filter "${DB_NAME}_*.sql" | Sort-Object -Property CreationTime -Descending
    
    if ($backups.Count -eq 0) {
        Write-Host "  No backups found in $BACKUP_DIR" -ForegroundColor Yellow
        exit 1
    }
    
    for ($i = 0; $i -lt $backups.Count; $i++) {
        $backup = $backups[$i]
        $size = [math]::Round($backup.Length / 1MB, 2)
        $date = $backup.CreationTime.ToString("yyyy-MM-dd HH:mm:ss")
        Write-Host "  [$($i + 1)] $($backup.Name) - $size MB - $date" -ForegroundColor Gray
    }
    
    $selection = Read-Host "`nSelect backup number (or 'q' to quit)"
    if ($selection -eq 'q') {
        exit 0
    }
    
    $index = [int]$selection - 1
    if ($index -lt 0 -or $index -ge $backups.Count) {
        Write-Host "❌ Invalid selection" -ForegroundColor Red
        exit 1
    }
    
    $BackupFile = $backups[$index].FullName
}

if (!(Test-Path $BackupFile)) {
    Write-Host "❌ Backup file not found: $BackupFile" -ForegroundColor Red
    exit 1
}

Write-Host "`n⚠️  WARNING: This will REPLACE all data in database '$DB_NAME'" -ForegroundColor Yellow
Write-Host "  Backup file: $BackupFile" -ForegroundColor Gray
$confirm = Read-Host "Type 'YES' to confirm"

if ($confirm -ne 'YES') {
    Write-Host "❌ Restore cancelled" -ForegroundColor Yellow
    exit 0
}

Write-Host "`n🔄 Creating safety backup before restore..." -ForegroundColor Cyan
& ".\backup-database.ps1"

Write-Host "`n🔄 Restoring database..." -ForegroundColor Cyan

try {
    # Drop and recreate database
    Write-Host "  Dropping existing database..." -ForegroundColor Yellow
    psql -U $DB_USER -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};" 2>$null
    
    Write-Host "  Creating fresh database..." -ForegroundColor Yellow
    psql -U $DB_USER -d postgres -c "CREATE DATABASE ${DB_NAME};" 2>$null
    
    Write-Host "  Restoring from backup..." -ForegroundColor Yellow
    psql -U $DB_USER -d $DB_NAME -f $BackupFile 2>$null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Database restored successfully!" -ForegroundColor Green
        
        # Verify restore
        Write-Host "`n🔍 Verifying restored database..." -ForegroundColor Cyan
        & ".\verify-schema.ps1"
    } else {
        Write-Host "❌ Restore failed!" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
    exit 1
}
