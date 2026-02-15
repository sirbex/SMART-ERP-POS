# System Protection Measures

## Overview
This document outlines all protection measures implemented to prevent system failures and data integrity issues.

## 1. Pre-Start Database Verification ✅ IMPLEMENTED

**Script**: `SamplePOS.Server/verify-schema.ps1`

**What it checks:**
- All required tables exist
- All critical columns exist (uom_id, po_item_id, sale_number, etc.)
- Data integrity warnings (old batch formats, orphaned data, etc.)

**Usage:**
```powershell
cd SamplePOS.Server
.\verify-schema.ps1
```

**Integrated into**: `start-dev.ps1` - runs automatically before starting servers

## 2. Health Check API Endpoint ✅ IMPLEMENTED

**Endpoint**: `GET /api/health`

**Returns:**
- Database connection status
- Table existence checks
- Column existence checks
- Data integrity warnings
- System health status (healthy/unhealthy)

**Usage from frontend:**
```typescript
const health = await fetch('/api/health');
const result = await health.json();
if (!result.success) {
  // Show warning to user
}
```

## 3. Automated Backup System ✅ IMPLEMENTED

**Scripts**: 
- `SamplePOS.Server/backup-database.ps1` - Create backups
- `SamplePOS.Server/restore-database.ps1` - Restore from backup

**Features:**
- Timestamped backup files
- Keeps last 30 backups automatically
- Interactive restore with safety backup
- Schema verification after restore

**Usage:**
```powershell
# Create backup
.\backup-database.ps1

# Restore from backup (interactive)
.\restore-database.ps1

# Restore specific file
.\restore-database.ps1 -BackupFile "backups\pos_system_20251114_220000.sql"
```

**Recommended Schedule:**
- Daily automatic backups (use Windows Task Scheduler)
- Before major changes (manual)
- Before running migrations (manual)

## 4. Database Transaction Safety

**Status**: ⚠️ PARTIALLY IMPLEMENTED

**Current status:**
- Goods receipt finalization uses transactions ✅
- Purchase order creation uses transactions ✅
- Sale creation needs transaction wrapping ❌

**Best practices:**
```typescript
// Always use client from pool.connect() for transactions
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // ... multiple operations
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

## 5. Schema-Code Synchronization

**Protection measures:**
- TypeScript interfaces must match database columns
- Remove fields from interfaces if columns don't exist
- Always check schema before adding fields to queries

**Verification checklist:**
```powershell
# 1. Check if column exists
psql -U postgres -d pos_system -c "\d table_name"

# 2. Verify TypeScript compiles
npm run build

# 3. Test the endpoint
```

## 6. Human-Readable References

**Implemented for:**
- ✅ Batch numbers: `BATCH-YYYYMMDD-NNN`
- ✅ Sale numbers: `SALE-YYYY-NNNN`
- ✅ GR numbers: `GR-YYYY-NNNN`
- ✅ PO numbers: `PO-YYYY-NNNN`
- ✅ Movement numbers: `MOV-YYYY-NNNN`

**Pattern:**
- Use `{PREFIX}-{YEAR}-{SEQUENCE}` format
- Daily sequences reset each day for batches
- Annual sequences for transactions

## 7. Frontend Error Handling

**Status**: ❌ NOT YET IMPLEMENTED

**Needed:**
- React Error Boundaries on major pages
- Graceful degradation when API fails
- Clear error messages for users
- Automatic retry for transient failures

**Example:**
```typescript
class ErrorBoundary extends React.Component {
  componentDidCatch(error, info) {
    // Log error and show friendly message
  }
}
```

## 8. API Response Validation

**Status**: ❌ NOT YET IMPLEMENTED

**Needed:**
- Zod schemas for all API responses
- Validate data before displaying to user
- Catch `undefined`/`null` issues early

**Example:**
```typescript
const ResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    saleNumber: z.string(),
    // ... all required fields
  })
});

const result = ResponseSchema.parse(apiResponse);
```

## 9. Migration Safety Checklist

**Before running any migration:**
- [ ] Create backup: `.\backup-database.ps1`
- [ ] Test migration on dev database
- [ ] Verify TypeScript interfaces match
- [ ] Check for dependent code
- [ ] Run schema verification after
- [ ] Test affected features

**After migration:**
```powershell
# Verify schema
.\verify-schema.ps1

# Check for errors
npm run build
```

## 10. Development Workflow

**Safe development process:**
1. **Before coding**: Check current schema
2. **During coding**: Follow architecture rules (no ORM, parameterized SQL)
3. **Before commit**: Run verification script
4. **Before testing**: Create backup
5. **After testing**: Verify no breaking changes

## 11. Production Deployment Checklist

**Before deploying:**
- [ ] Run full schema verification
- [ ] Create production backup
- [ ] Test all critical paths
- [ ] Verify human-readable references working
- [ ] Check health endpoint
- [ ] Review recent error logs

**After deploying:**
- [ ] Verify health endpoint
- [ ] Test critical workflows (create sale, receive PO)
- [ ] Monitor error logs
- [ ] Keep backup for 30 days

## 12. Emergency Recovery

**If system breaks:**
1. **Stop servers immediately**
2. **Check health endpoint** for issues
3. **Review recent changes** (git log)
4. **Run schema verification** to identify problem
5. **Restore from backup** if needed
6. **Fix root cause** before restarting

**Quick restore:**
```powershell
cd SamplePOS.Server
.\restore-database.ps1  # Select most recent backup
.\verify-schema.ps1      # Verify restore
```

## 13. Monitoring & Alerts

**Recommended (not yet implemented):**
- Daily automated schema checks
- Email alerts on schema drift
- Disk space monitoring for backups
- Query performance monitoring
- Error rate tracking

## 14. Data Integrity Rules

**Enforced by database:**
- Foreign key constraints
- NOT NULL constraints
- UNIQUE constraints
- CHECK constraints

**Enforced by application:**
- Zod validation schemas
- Business rules middleware
- Transaction isolation

## 15. Common Pitfalls to Avoid

❌ **DON'T:**
- Add columns without migration
- Reference non-existent columns in queries
- Assume schema without checking
- Skip backup before major changes
- Use string interpolation in SQL
- Put business logic in repositories

✅ **DO:**
- Always use parameterized queries
- Verify schema before coding
- Create backups regularly
- Follow layered architecture
- Test after every change
- Read instructions carefully

## Summary

**Current Protection Level: GOOD** 
- ✅ Pre-start verification
- ✅ Health check API
- ✅ Backup/restore system
- ✅ Human-readable references
- ⚠️ Partial transaction safety
- ❌ Missing error boundaries
- ❌ Missing response validation

**Next Priority:**
1. Add React Error Boundaries
2. Implement API response validation
3. Complete transaction wrapping
4. Set up automated daily backups

**Maintenance:**
- Run backup daily: `.\backup-database.ps1`
- Check health monthly: `http://localhost:3001/api/health`
- Review schema quarterly: `.\verify-schema.ps1`
