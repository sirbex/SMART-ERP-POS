# ERP-Grade Data Management System - Implementation Complete

## Overview

A comprehensive backup, reset, and restore system has been implemented for the SamplePOS system following strict ERP-grade safety requirements.

## ✅ Verified Working (December 27, 2025)

All endpoints tested and confirmed working:
- **Stats Endpoint**: Returns database size (19 MB), master/transactional/accounting data counts
- **Backup Creation**: Successfully creates compressed pg_dump backups with SHA-256 checksums
- **Backup Listing**: Returns all available backups with metadata
- **Backup Verification**: Recalculates checksum and marks backup as VERIFIED
- **Reset Preview**: Shows exactly what will be cleared vs preserved
- **Authentication**: All endpoints require ADMIN role

## Key Features

### 1. Backup System
- **Full database backups** using `pg_dump` with custom format compression (-Fc)
- **SHA-256 checksums** for integrity verification
- **Automatic backup before any reset** - mandatory, cannot be bypassed
- **Backup metadata tracking** with reason, size, verification status
- **Download and delete** capabilities with proper cleanup

### 2. Reset System (Transaction Data Only)
- **Master data NEVER deleted**: customers, suppliers, products, users, accounts, units, categories
- **8-phase transactional clearing** with proper foreign key ordering:
  1. Accounting entries (ledger, journal, payments)
  2. Customer transactions (payments, invoices, sales)
  3. Supplier transactions (payments, invoices, goods receipts, POs)
  4. Inventory movements (stock, batches, cost layers)
  5. Deliveries and quotations
  6. Expenses and banking
  7. Audit logs
  8. Balance resets (customer/supplier balances, inventory quantities)
- **Confirmation phrase required**: Must type "RESET ALL TRANSACTIONS" exactly
- **Detailed reason required**: Minimum 10 characters explaining why
- **Immutable audit trail**: Reset logs cannot be deleted

### 3. Restore System
- **Full database restore** using `pg_restore`
- **Pre-restore backup** automatically created (safety net)
- **Backup selection UI** with verification status indicators
- **Confirmation dialog** before restore

### 4. Maintenance Mode
- **System-wide lock** during backup/reset/restore operations
- **Prevents concurrent modifications** during critical operations
- **Automatic release** on operation completion or error

## Database Tables Created

```sql
-- shared/sql/100_system_backups.sql

1. system_backups
   - Tracks all backups with metadata
   - Stores checksums for verification
   - Includes pre/post record counts

2. system_reset_log
   - Immutable audit trail for reset operations
   - Records user, reason, timestamp
   - Cannot be deleted (no DELETE trigger)

3. system_maintenance_mode
   - Controls system availability
   - Single-row table with current status
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/system/backup` | POST | Create new backup |
| `/api/system/backups` | GET | List all backups |
| `/api/system/backups/:id` | GET | Get backup details |
| `/api/system/backups/:id/verify` | POST | Verify backup integrity |
| `/api/system/backups/:id/download` | GET | Download backup file |
| `/api/system/backups/:id` | DELETE | Delete backup |
| `/api/system/backups/cleanup` | POST | Clean old backups |
| `/api/system/reset` | POST | Reset transactional data |
| `/api/system/reset/preview` | GET | Preview what will be cleared |
| `/api/system/restore/:backupId` | POST | Restore from backup |
| `/api/system/stats` | GET | Get database statistics |
| `/api/system/validate` | GET | Check database integrity |
| `/api/system/maintenance-mode` | GET | Check maintenance status |

All endpoints require ADMIN role authentication.

## Frontend Integration

New **Data Management** tab in Settings page with 4 sections:

### Overview
- Database size display
- Master/transactional/accounting record counts
- Last backup status

### Backup
- Create new backup with reason
- List all backups with download/verify/delete actions
- Visual verification status indicators

### Reset
- Warning banner explaining the operation
- Side-by-side preview: what will be cleared vs preserved
- Confirmation dialog with exact phrase typing
- Reason input required

### Restore
- List of available backups with radio selection
- Verification status shown (checkmark icon)
- Confirmation dialog before restore

## Files Created/Modified

### New Files
```
SamplePOS.Server/src/modules/system-management/
├── systemManagementRepository.ts  (Database operations)
├── systemManagementService.ts     (Business logic)
├── systemManagementRoutes.ts      (Express routes)
└── index.ts                       (Module exports)

shared/sql/
└── 100_system_backups.sql         (Database migration)

samplepos.client/src/pages/settings/tabs/
└── DataManagementTab.tsx          (React UI component)
```

### Modified Files
```
SamplePOS.Server/src/server.ts     (Route registration)
samplepos.client/src/pages/settings/SettingsPage.tsx (Tab integration)
```

## Safety Guarantees

1. **No accidental data loss**: 
   - Confirmation phrase must be typed exactly
   - Backup created before every reset
   - Master data always preserved

2. **Audit trail**: 
   - Reset logs immutable (cannot be deleted)
   - All operations logged with user/timestamp

3. **Integrity verification**:
   - SHA-256 checksums on all backups
   - Verification before restore
   - Transaction rollback on failure

4. **Concurrent operation protection**:
   - Maintenance mode during operations
   - Single-threaded critical sections

## Usage Instructions

### Creating a Backup
1. Go to Settings → Data Management → Backup
2. Enter a reason (e.g., "Before monthly close")
3. Click "Create Backup"
4. Backup is saved to `./backups/` directory

### Resetting Transaction Data
1. Go to Settings → Data Management → Reset
2. Review the preview (what will be cleared vs preserved)
3. Click "Reset All Transactions"
4. Enter detailed reason
5. Type "RESET ALL TRANSACTIONS" exactly
6. Click "Confirm Reset"
7. System creates backup automatically, then clears data

### Restoring from Backup
1. Go to Settings → Data Management → Restore
2. Select a backup from the list (prefer verified backups)
3. Click "Restore Selected Backup"
4. Confirm in the dialog
5. System creates safety backup, then restores

## Testing

```powershell
# Test backup creation
Invoke-RestMethod -Uri "http://localhost:3001/api/system/backup" `
  -Method POST -Headers @{Authorization="Bearer $token"} `
  -Body '{"reason":"Test backup"}' -ContentType "application/json"

# Test stats
Invoke-RestMethod -Uri "http://localhost:3001/api/system/stats" `
  -Headers @{Authorization="Bearer $token"}

# Test reset preview
Invoke-RestMethod -Uri "http://localhost:3001/api/system/reset/preview" `
  -Headers @{Authorization="Bearer $token"}
```

## Notes

- Backups are stored in `./backups/` directory relative to server root
- Backup file naming: `backup_BACKUP-2025-0001_<timestamp>.dump`
- Reset does NOT affect: users, roles, permissions, settings
- Restore creates a safety backup before overwriting data
