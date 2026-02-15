# Admin API - Quick Reference Card

Base URL: `http://localhost:3001/api/admin`  
Auth: Required (ADMIN role)  
Header: `Authorization: Bearer <token>`

---

## 🔐 Authentication
```bash
# Login first to get token
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@samplepos.com","password":"admin123"}'
```

---

## 📊 Statistics & Health

### Get Database Statistics
```bash
GET /api/admin/stats

curl http://localhost:3001/api/admin/stats \
  -H "Authorization: Bearer <token>"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "masterData": {
      "customers": 15,
      "suppliers": 3,
      "products": 13,
      "uoms": 6,
      "users": 15
    },
    "transactionalData": {
      "sales": 94,
      "sale_items": 147,
      "purchase_orders": 21
    },
    "databaseSize": "11 MB",
    "integrity": {
      "valid": true,
      "issues": []
    }
  }
}
```

### Validate Database Integrity
```bash
GET /api/admin/validate-integrity

curl http://localhost:3001/api/admin/validate-integrity \
  -H "Authorization: Bearer <token>"
```

---

## 💾 Backup Operations

### Create Backup
```bash
POST /api/admin/backup

curl -X POST http://localhost:3001/api/admin/backup \
  -H "Authorization: Bearer <token>" \
  --output backup_$(date +%Y%m%d).dump
```

### List Backups
```bash
GET /api/admin/backups

curl http://localhost:3001/api/admin/backups \
  -H "Authorization: Bearer <token>"
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "fileName": "company_backup_2025_11_11.dump",
      "size": 167936,
      "created": "2025-11-11T00:19:31.000Z"
    }
  ]
}
```

### Delete Backup
```bash
DELETE /api/admin/backups/:fileName

curl -X DELETE http://localhost:3001/api/admin/backups/old_backup.dump \
  -H "Authorization: Bearer <token>"
```

### Cleanup Old Backups
```bash
POST /api/admin/cleanup-backups

curl -X POST http://localhost:3001/api/admin/cleanup-backups \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"keepCount": 5}'
```

---

## 🔄 Restore Operations

### Restore from Backup
```bash
POST /api/admin/restore

curl -X POST http://localhost:3001/api/admin/restore \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"filePath": "company_backup_2025_11_11.dump"}'
```

⚠️ **WARNING**: This replaces entire database!

---

## 🗑️ Transaction Management

### Clear All Transactions
```bash
POST /api/admin/clear-transactions

curl -X POST http://localhost:3001/api/admin/clear-transactions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"confirmation": "CLEAR ALL DATA"}'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "totalRecordsDeleted": 530,
    "resetInventory": 13,
    "deletedRecords": {
      "sales": 94,
      "sale_items": 147,
      "purchase_orders": 21
    }
  }
}
```

⚠️ **CRITICAL**:
- Must type `"CLEAR ALL DATA"` exactly (case-sensitive)
- Deletes ALL transactional data
- Preserves master data (customers, suppliers, products)
- Only test on TEST database!

---

## 📤 Export Operations

### Export Master Data (JSON)
```bash
POST /api/admin/export-master-data

curl -X POST http://localhost:3001/api/admin/export-master-data \
  -H "Authorization: Bearer <token>"
```

**Response**: JSON object with customers, suppliers, products, etc.

---

## 🧪 Testing

### PowerShell Test Suite
```powershell
cd SamplePOS.Server
.\test-admin-api.ps1
```

### Manual Health Check
```bash
# Test server is running
curl http://localhost:3001/health

# Test admin stats (requires token)
curl http://localhost:3001/api/admin/stats \
  -H "Authorization: Bearer <token>"
```

---

## ⚠️ Safety Guidelines

### DO NOT on Production
- ❌ POST /api/admin/clear-transactions
- ❌ POST /api/admin/restore
- ⚠️ DELETE /api/admin/backups/* (unless intentional)

### Safe on Production
- ✅ GET /api/admin/stats
- ✅ GET /api/admin/validate-integrity
- ✅ POST /api/admin/backup
- ✅ GET /api/admin/backups
- ✅ POST /api/admin/export-master-data
- ✅ POST /api/admin/cleanup-backups (with keepCount > 5)

---

## 🚨 Error Responses

### 401 Unauthorized
```json
{
  "success": false,
  "error": "No token provided"
}
```
**Solution**: Include Authorization header

### 403 Forbidden
```json
{
  "success": false,
  "error": "Access denied. Required roles: ADMIN"
}
```
**Solution**: Login with ADMIN account

### 400 Bad Request
```json
{
  "success": false,
  "error": "Invalid confirmation phrase. Must type \"CLEAR ALL DATA\" exactly."
}
```
**Solution**: Use correct confirmation phrase

---

## 📋 Checklist Before Running

### Backup
- [ ] Server is running (port 3001)
- [ ] Valid ADMIN token obtained
- [ ] pg_dump installed and in PATH

### Restore
- [ ] Backup file exists in backups/ directory
- [ ] Database is NOT in use (close connections)
- [ ] Full backup created BEFORE restore
- [ ] Confirmed this is a TEST database

### Clear Transactions
- [ ] Full backup created FIRST
- [ ] Confirmed this is a TEST database
- [ ] Confirmed phrase is "CLEAR ALL DATA"
- [ ] Ready for ALL transactional data to be deleted

---

## 📞 Quick Troubleshooting

| Error | Solution |
|-------|----------|
| Command not found: pg_dump | Install PostgreSQL client tools |
| Permission denied | Check directory permissions |
| Database in use | Close all connections |
| Token expired | Login again to get new token |
| Wrong role | Login with ADMIN account |

---

**Server Status**: ✅ Running on port 3001  
**Admin Module**: ✅ Mounted at /api/admin  
**Test Suite**: ✅ All core endpoints passing  
**Documentation**: ✅ Complete
