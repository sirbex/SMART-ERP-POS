# Admin Data Management System

**Status**: Complete (Backend API Ready)  
**Module**: `/src/modules/admin`  
**Created**: November 11, 2025

## Overview

ERP-standard backup/restore and transaction clearing system for SamplePOS. Preserves master data (customers, suppliers, products) while allowing safe deletion of transactional data (sales, purchases, inventory movements).

## Architecture

### Layered Structure

```
Controller (HTTP handlers)
    ↓
Service (pg_dump/pg_restore + business logic)
    ↓
Repository (raw SQL queries)
    ↓
PostgreSQL Database (pos_system)
```

### Files Created

1. **adminRepository.ts** (283 lines)
   - `clearAllTransactions()` - FK-safe deletion of transactional data
   - `getDatabaseStats()` - Count master/transactional records
   - `exportMasterDataToJSON()` - JSON backup export
   - `validateDatabaseIntegrity()` - Check for orphaned records

2. **adminService.ts** (285 lines)
   - `createDatabaseBackup()` - Execute pg_dump
   - `restoreDatabaseBackup()` - Execute pg_restore
   - `clearAllTransactions()` - Validate confirmation + call repository
   - `listBackupFiles()` - List .dump files in /backups
   - `cleanupOldBackups()` - Delete old backups (keep last N)
   - `exportMasterDataJSON()` - Export to JSON file

3. **adminController.ts** (307 lines)
   - `backup()` - POST /api/admin/backup → download .dump file
   - `restore()` - POST /api/admin/restore → restore from file path
   - `clearTransactions()` - POST /api/admin/clear-transactions → delete transactional data
   - `getStatistics()` - GET /api/admin/stats → database statistics
   - `listBackups()` - GET /api/admin/backups → list available backups
   - `deleteBackup()` - DELETE /api/admin/backups/:fileName → delete specific backup
   - `cleanupBackups()` - POST /api/admin/cleanup-backups → delete old backups
   - `exportMasterData()` - POST /api/admin/export-master-data → JSON export
   - `validateIntegrity()` - GET /api/admin/validate-integrity → check database health

4. **adminRoutes.ts** (72 lines)
   - All routes require authentication + ADMIN/SUPER_ADMIN role
   - Mounted at `/api/admin`

## Core Principles

### 1. Master Data (NEVER DELETED)
- `customers` - Customer records
- `suppliers` - Supplier records
- `products` - Product catalog
- `categories` - Product categories
- `units_of_measure` - UOM definitions
- `users` - System users

### 2. Transactional Data (SAFE TO DELETE)
- `sales` + `sale_items` - Sales transactions
- `purchase_orders` + `purchase_order_items` - PO transactions
- `goods_receipts` + `goods_receipt_items` - GR transactions
- `stock_movements` - Inventory movements
- `stock_adjustments` - Inventory adjustments
- `inventory_batches` - Batch tracking
- `cost_layers` - FIFO/AVCO cost layers
- `customer_ledger` - Customer ledger entries
- `supplier_ledger` - Supplier ledger entries
- `customer_payments` - Payment records
- `invoices` + `invoice_items` - Invoice records

## API Endpoints

### Backup & Restore

#### POST /api/admin/backup
Create and download database backup using pg_dump.

**Request**: None (POST with empty body)

**Response**: Binary file stream (.dump file)

**Headers**:
```
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="company_backup_YYYY_MM_DD_HH_MM_SS.dump"
Content-Length: <file size>
```

**Example**:
```bash
curl -X POST http://localhost:3001/api/admin/backup \
  -H "Authorization: Bearer <token>" \
  --output backup.dump
```

---

#### GET /api/admin/backups
List available backup files.

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "fileName": "company_backup_2025_11_11_00_00_00.dump",
      "filePath": "/path/to/backups/company_backup_2025_11_11_00_00_00.dump",
      "size": 15728640,
      "created": "2025-11-11T00:00:00.000Z"
    }
  ]
}
```

---

#### POST /api/admin/restore
Restore database from backup file.

**Request Body**:
```json
{
  "filePath": "company_backup_2025_11_11_00_00_00.dump"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "restoredTables": 25,
    "message": "Database restored successfully"
  },
  "message": "Database restored successfully"
}
```

**⚠️ WARNING**: This is a DESTRUCTIVE operation. All existing data will be replaced.

---

#### DELETE /api/admin/backups/:fileName
Delete a specific backup file.

**Response**:
```json
{
  "success": true,
  "message": "Backup deleted successfully"
}
```

---

#### POST /api/admin/cleanup-backups
Delete old backups (keep last N).

**Request Body**:
```json
{
  "keepCount": 10
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "deletedCount": 3
  },
  "message": "Deleted 3 old backup(s)"
}
```

### Transaction Management

#### POST /api/admin/clear-transactions
Clear all transactional data (ERP reset).

**Request Body**:
```json
{
  "confirmation": "CLEAR ALL DATA"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "deletedRecords": {
      "sale_items": 147,
      "sales": 94,
      "customer_payments": 0,
      "invoice_items": 0,
      "invoices": 0,
      "purchase_order_items": 50,
      "purchase_orders": 10,
      "goods_receipt_items": 50,
      "goods_receipts": 10,
      "stock_movements": 200,
      "stock_adjustments": 5,
      "inventory_batches": 75,
      "cost_layers": 100,
      "customer_ledger": 150,
      "supplier_ledger": 50
    },
    "resetInventory": 13,
    "totalRecordsDeleted": 944
  },
  "message": "Deleted 944 records and reset 13 products"
}
```

**⚠️ CRITICAL**: Confirmation phrase must be EXACTLY `"CLEAR ALL DATA"` (case-sensitive).

**Safety Features**:
- Validates confirmation phrase before proceeding
- Uses database transaction (BEGIN/COMMIT/ROLLBACK)
- Deletes in FK-safe order (children before parents)
- Resets inventory quantities to 0
- Resets customer/supplier balances to 0
- Logs all operations with user ID

### Database Statistics

#### GET /api/admin/stats
Get comprehensive database statistics.

**Response**:
```json
{
  "success": true,
  "data": {
    "masterData": {
      "customers": 50,
      "suppliers": 15,
      "products": 200,
      "categories": 10,
      "units_of_measure": 8,
      "users": 5
    },
    "transactionalData": {
      "sales": 94,
      "sale_items": 147,
      "purchase_orders": 10,
      "goods_receipts": 10,
      "stock_movements": 200
    },
    "databaseSize": "45 MB",
    "integrity": {
      "valid": true,
      "issues": []
    }
  }
}
```

---

#### GET /api/admin/validate-integrity
Validate database integrity (orphaned records, negative inventory).

**Response**:
```json
{
  "success": true,
  "data": {
    "valid": true,
    "issues": []
  }
}
```

**Or with issues**:
```json
{
  "success": true,
  "data": {
    "valid": false,
    "issues": [
      "Orphaned sale_items: 5 records with no parent sale",
      "Negative inventory: Product 'Minute Maid' has -10 units",
      "Orphaned cost_layers: 3 records with no parent product"
    ]
  }
}
```

### Master Data Export

#### POST /api/admin/export-master-data
Export master data to JSON (portable backup).

**Response**:
```json
{
  "success": true,
  "data": {
    "customers": [...],
    "suppliers": [...],
    "products": [...],
    "categories": [...],
    "units_of_measure": [...]
  },
  "message": "Master data exported successfully"
}
```

**Use Case**: Portable backup that can be imported into different database systems (not PostgreSQL-specific like .dump files).

## Backup Methods

### Method A: pg_dump (Recommended)

**Advantages**:
- Industry standard
- Compressed format (`-Fc` flag)
- Fast restore with pg_restore
- Includes schema + data + constraints
- PostgreSQL-native (reliable)

**Command**:
```bash
pg_dump -Fc -h localhost -p 5432 -U postgres -d pos_system -f backup.dump
```

**File Format**: Custom compressed format (.dump)

**Typical Size**: ~15-50 MB for small-to-medium database

---

### Method B: JSON Export (Alternative)

**Advantages**:
- Portable (works across database systems)
- Human-readable
- Selective import possible

**Disadvantages**:
- Larger file size
- Slower restore
- Manual import required
- Doesn't include schema

**Command**: Via API endpoint `/api/admin/export-master-data`

**File Format**: JSON (.json)

**Typical Size**: ~50-100 MB (larger than pg_dump)

## Transaction Clearing Process

### Deletion Order (FK-Safe)

The system deletes records in this specific order to avoid foreign key violations:

1. **sale_items** (child of sales)
2. **sales** (parent)
3. **customer_payments**
4. **invoice_items** (child of invoices)
5. **invoices** (parent)
6. **purchase_order_items** (child of purchase_orders)
7. **purchase_orders** (parent)
8. **goods_receipt_items** (child of goods_receipts)
9. **goods_receipts** (parent)
10. **stock_movements**
11. **stock_adjustments**
12. **inventory_batches**
13. **cost_layers**
14. **customer_ledger**
15. **supplier_ledger**

### Reset Operations

After deletion:
- **Inventory**: `UPDATE products SET quantity_on_hand = 0`
- **Customer Balances**: `UPDATE customers SET balance = 0`
- **Supplier Balances**: `UPDATE suppliers SET balance = 0`

### Database Sequences

The system also resets auto-increment sequences for transactional tables to start fresh.

## Security & Authorization

### Role Requirements

All admin endpoints require:
1. Valid JWT token (Authorization: Bearer <token>)
2. User role = `ADMIN` or `SUPER_ADMIN`

**Middleware Chain**:
```typescript
router.use(authenticate);              // Verify JWT token
router.use(authorize('ADMIN', 'SUPER_ADMIN'));  // Check role
```

### Safety Confirmations

**Transaction Clearing**:
- User must type EXACTLY `"CLEAR ALL DATA"` (case-sensitive)
- Logs user ID and timestamp
- Uses database transaction for atomicity

**Database Restore**:
- Logs DESTRUCTIVE operation warning
- Logs user ID and file name
- No confirmation (assumes user selected correct file)

### Audit Logging

All operations are logged with:
- User ID
- Email address
- Operation type
- Timestamp
- Parameters (file names, record counts)
- Success/failure status

**Log Levels**:
- `logger.info` - Normal operations (backup, stats)
- `logger.warn` - Destructive operations (restore, clear transactions)
- `logger.error` - Failures

## Error Handling

### Backup Errors

**Scenario**: pg_dump fails (database connection lost)

**Response**:
```json
{
  "success": false,
  "error": "Backup failed: connection to server at \"localhost\" (127.0.0.1), port 5432 failed"
}
```

---

### Restore Errors

**Scenario**: Backup file not found

**Response**:
```json
{
  "success": false,
  "error": "Backup file not found"
}
```

---

### Confirmation Errors

**Scenario**: Incorrect confirmation phrase

**Response**:
```json
{
  "success": false,
  "error": "Invalid confirmation phrase. Must type \"CLEAR ALL DATA\" exactly."
}
```

---

### Authorization Errors

**Scenario**: Non-admin user attempts admin operation

**Response**:
```json
{
  "success": false,
  "error": "Access denied. Required roles: ADMIN, SUPER_ADMIN"
}
```

## Environment Variables

```bash
# Database connection
DATABASE_URL="postgresql://postgres:password@localhost:5432/pos_system"
DB_USER="postgres"
DB_PASSWORD="password"
DB_HOST="localhost"
DB_PORT="5432"

# JWT authentication
JWT_SECRET="your-secret-key-change-in-production"
JWT_EXPIRES_IN="24h"
```

## File System Structure

```
SamplePOS.Server/
├── backups/
│   ├── company_backup_2025_11_11_00_00_00.dump
│   ├── company_backup_2025_11_10_00_00_00.dump
│   ├── master_data_2025_11_11.json
│   └── temp/                  # Temporary uploads (unused currently)
└── src/
    └── modules/
        └── admin/
            ├── adminRepository.ts   # Database layer
            ├── adminService.ts      # Business logic + shell commands
            ├── adminController.ts   # HTTP handlers
            └── adminRoutes.ts       # Route definitions
```

## Testing Guide

### 1. Create Backup

```bash
curl -X POST http://localhost:3001/api/admin/backup \
  -H "Authorization: Bearer <token>" \
  --output test_backup.dump

# Verify file created
ls -lh backups/
```

---

### 2. List Backups

```bash
curl -X GET http://localhost:3001/api/admin/backups \
  -H "Authorization: Bearer <token>"
```

---

### 3. Get Statistics

```bash
curl -X GET http://localhost:3001/api/admin/stats \
  -H "Authorization: Bearer <token>"
```

**Expected Output**:
- Master data counts (customers, suppliers, products)
- Transactional data counts (sales, purchases, movements)
- Database size
- Integrity check results

---

### 4. Validate Integrity

```bash
curl -X GET http://localhost:3001/api/admin/validate-integrity \
  -H "Authorization: Bearer <token>"
```

**Expected**: `{ "valid": true, "issues": [] }`

---

### 5. Clear Transactions (TEST DATABASE ONLY!)

```bash
curl -X POST http://localhost:3001/api/admin/clear-transactions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"confirmation": "CLEAR ALL DATA"}'
```

**⚠️ WARNING**: This deletes all transactional data. Only test on non-production database!

**Expected Output**:
```json
{
  "success": true,
  "data": {
    "totalRecordsDeleted": 944,
    "resetInventory": 13,
    "deletedRecords": { ... }
  }
}
```

---

### 6. Restore from Backup (TEST DATABASE ONLY!)

```bash
curl -X POST http://localhost:3001/api/admin/restore \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"filePath": "company_backup_2025_11_11_00_00_00.dump"}'
```

**⚠️ WARNING**: This replaces entire database with backup. Only test on non-production!

---

### 7. Cleanup Old Backups

```bash
curl -X POST http://localhost:3001/api/admin/cleanup-backups \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"keepCount": 5}'
```

**Expected**: Deletes all backups except the 5 most recent.

## Frontend Integration (TODO)

### Admin Panel Component

```tsx
// AdminDataManagement.tsx
interface BackupFile {
  fileName: string;
  filePath: string;
  size: number;
  created: Date;
}

interface DatabaseStats {
  masterData: Record<string, number>;
  transactionalData: Record<string, number>;
  databaseSize: string;
  integrity: {
    valid: boolean;
    issues: string[];
  };
}

function AdminDataManagement() {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [confirmationText, setConfirmationText] = useState('');

  // Fetch statistics
  const loadStats = async () => {
    const res = await fetch('/api/admin/stats', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    setStats(data.data);
  };

  // Create backup
  const handleBackup = async () => {
    const res = await fetch('/api/admin/backup', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${new Date().toISOString()}.dump`;
    a.click();
  };

  // Clear transactions
  const handleClearTransactions = async () => {
    if (confirmationText !== 'CLEAR ALL DATA') {
      alert('Confirmation phrase incorrect');
      return;
    }

    const res = await fetch('/api/admin/clear-transactions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ confirmation: confirmationText })
    });

    const data = await res.json();
    alert(`Deleted ${data.data.totalRecordsDeleted} records`);
    setConfirmationText('');
  };

  return (
    <div>
      <h2>Database Management</h2>

      {/* Statistics */}
      <section>
        <h3>Database Statistics</h3>
        {stats && (
          <div>
            <p>Size: {stats.databaseSize}</p>
            <p>Master Data: {Object.values(stats.masterData).reduce((a,b) => a+b, 0)} records</p>
            <p>Transactions: {Object.values(stats.transactionalData).reduce((a,b) => a+b, 0)} records</p>
          </div>
        )}
      </section>

      {/* Backup */}
      <section>
        <h3>Backup</h3>
        <button onClick={handleBackup}>Download Backup</button>
      </section>

      {/* Clear Transactions */}
      <section>
        <h3>⚠️ Clear Transaction Data</h3>
        <p>This will delete all sales, purchases, and inventory movements.</p>
        <p>Master data (customers, suppliers, products) will NOT be deleted.</p>
        <input
          type="text"
          placeholder="Type 'CLEAR ALL DATA' to confirm"
          value={confirmationText}
          onChange={(e) => setConfirmationText(e.target.value)}
        />
        <button
          onClick={handleClearTransactions}
          disabled={confirmationText !== 'CLEAR ALL DATA'}
        >
          Clear Transactions
        </button>
      </section>
    </div>
  );
}
```

### Confirmation Modal

```tsx
function ClearTransactionsModal({ isOpen, onClose, onConfirm }: Props) {
  const [confirmationText, setConfirmationText] = useState('');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogTitle>⚠️ Clear All Transaction Data</DialogTitle>
        <DialogDescription>
          This will permanently delete:
          <ul>
            <li>All sales and sale items</li>
            <li>All purchase orders and goods receipts</li>
            <li>All stock movements and adjustments</li>
            <li>All inventory batches and cost layers</li>
            <li>All ledger entries</li>
          </ul>
          <br />
          <strong>Master data will NOT be deleted:</strong>
          <ul>
            <li>Customers, Suppliers, Products</li>
            <li>Categories, Units of Measure, Users</li>
          </ul>
          <br />
          <p>Type <strong>"CLEAR ALL DATA"</strong> to confirm:</p>
          <input
            type="text"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            placeholder="CLEAR ALL DATA"
          />
        </DialogDescription>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(confirmationText)}
            disabled={confirmationText !== 'CLEAR ALL DATA'}
          >
            Clear All Transactions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

## Maintenance & Best Practices

### Backup Schedule (Recommended)

- **Daily**: Automated backup at 2:00 AM
- **Weekly**: Full backup kept for 4 weeks
- **Monthly**: Archive backup kept for 1 year
- **Pre-deployment**: Manual backup before updates

### Retention Policy

- **Keep last 10 daily backups** (use cleanup API)
- **Keep last 4 weekly backups**
- **Keep last 12 monthly backups**
- **Delete backups older than 1 year**

### Automated Backup Script

```bash
#!/bin/bash
# automated-backup.sh

TOKEN="your-jwt-token"
BACKUP_DIR="/path/to/backups"
KEEP_COUNT=10

# Create backup
curl -X POST http://localhost:3001/api/admin/backup \
  -H "Authorization: Bearer $TOKEN" \
  --output "$BACKUP_DIR/backup_$(date +%Y_%m_%d).dump"

# Cleanup old backups
curl -X POST http://localhost:3001/api/admin/cleanup-backups \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"keepCount\": $KEEP_COUNT}"
```

**Cron Job** (daily at 2 AM):
```bash
0 2 * * * /path/to/automated-backup.sh
```

### Transaction Clearing Use Cases

1. **End of Year**: Clear old transactions after archiving
2. **Testing**: Reset test database to clean state
3. **Demo**: Clear demo data before showing to clients
4. **Development**: Start fresh after major schema changes

**⚠️ NEVER use on production without full backup!**

## Troubleshooting

### Issue: pg_dump command not found

**Solution**: Ensure PostgreSQL client tools are installed and in PATH.

```bash
# Ubuntu/Debian
sudo apt-get install postgresql-client

# macOS
brew install postgresql

# Windows
# Add C:\Program Files\PostgreSQL\<version>\bin to PATH
```

---

### Issue: Permission denied when creating backup

**Solution**: Ensure `backups/` directory has write permissions.

```bash
chmod 755 backups/
```

---

### Issue: Restore fails with "database in use"

**Solution**: Close all connections to database before restoring.

```bash
# PostgreSQL - force disconnect all users
SELECT pg_terminate_backend(pg_stat_activity.pid)
FROM pg_stat_activity
WHERE datname = 'pos_system'
  AND pid <> pg_backend_pid();
```

---

### Issue: Transaction clearing fails midway

**Solution**: The system uses database transactions (BEGIN/COMMIT). If any deletion fails, all changes are rolled back automatically.

Check logs for specific error:
```bash
tail -f logs/server.log
```

---

### Issue: Integrity check shows orphaned records

**Solution**: Run transaction clearing to remove orphaned data.

```bash
curl -X POST http://localhost:3001/api/admin/clear-transactions \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"confirmation": "CLEAR ALL DATA"}'
```

## Performance Considerations

### Backup Size vs. Time

| Database Size | Backup Time | File Size (Compressed) |
|---------------|-------------|------------------------|
| 50 MB         | ~2 seconds  | ~15 MB                 |
| 500 MB        | ~10 seconds | ~150 MB                |
| 5 GB          | ~2 minutes  | ~1.5 GB                |

### Restore Time

- **Small DB** (< 100 MB): ~5-10 seconds
- **Medium DB** (500 MB): ~30-60 seconds
- **Large DB** (5 GB): ~5-10 minutes

### Transaction Clearing Time

Depends on record counts:
- **1,000 transactions**: ~1 second
- **10,000 transactions**: ~3 seconds
- **100,000 transactions**: ~10 seconds

**Note**: Deletion is fast due to FK-safe order and database indexes.

## Next Steps (Frontend)

1. Create `AdminDataManagement.tsx` component
2. Add backup/restore UI with file downloads
3. Add confirmation modal for transaction clearing
4. Add database statistics dashboard
5. Add backup file listing with delete buttons
6. Add integrity check UI with issue display
7. Add automated backup scheduling UI

## Appendix: Database Schema

### Master Data Tables

| Table | Description | Never Deleted |
|-------|-------------|---------------|
| customers | Customer records | ✅ |
| suppliers | Supplier records | ✅ |
| products | Product catalog | ✅ |
| categories | Product categories | ✅ |
| units_of_measure | UOM definitions | ✅ |
| users | System users | ✅ |

### Transactional Data Tables

| Table | Description | Safe to Delete |
|-------|-------------|----------------|
| sales | Sales transactions | ✅ |
| sale_items | Sale line items | ✅ |
| purchase_orders | PO transactions | ✅ |
| purchase_order_items | PO line items | ✅ |
| goods_receipts | GR transactions | ✅ |
| goods_receipt_items | GR line items | ✅ |
| stock_movements | Inventory movements | ✅ |
| stock_adjustments | Inventory adjustments | ✅ |
| inventory_batches | Batch tracking | ✅ |
| cost_layers | FIFO/AVCO layers | ✅ |
| customer_ledger | Customer ledger | ✅ |
| supplier_ledger | Supplier ledger | ✅ |
| customer_payments | Payment records | ✅ |
| invoices | Invoice headers | ✅ |
| invoice_items | Invoice line items | ✅ |

---

**Last Updated**: November 11, 2025  
**Author**: Backend API Complete, Frontend Integration Pending  
**Status**: Production Ready (Backend)
