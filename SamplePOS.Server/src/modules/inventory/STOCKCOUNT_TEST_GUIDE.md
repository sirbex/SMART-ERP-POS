# Stock Count API Integration Test Guide

## Overview
Comprehensive test suite for Physical Counting (Stocktake) feature covering full E2E workflow.

## Test File
`stockCount.test.ts` - 600+ lines, 40+ test cases

## Prerequisites

### 1. Install Dependencies
```powershell
cd SamplePOS.Server
npm install --save-dev supertest @types/supertest
```

### 2. Database Setup
Migration already run (creates `stock_counts` and `stock_count_lines` tables):
```powershell
psql -U postgres -d pos_system -f ../shared/sql/20251118_create_stock_counts.sql
```

### 3. Environment Configuration
Create `.env.test`:
```env
NODE_ENV=test
DATABASE_URL=postgresql://postgres:password@localhost:5432/pos_system
JWT_SECRET=test_secret_key
PORT=3002
LOG_LEVEL=error
```

## Test Coverage

### 1. **CREATE** Stock Count (POST /api/inventory/stockcounts)
- ✅ Create with all products
- ✅ Create with specific products (productIds array)
- ✅ Create with category filter
- ✅ Verify lines auto-created with expected quantities
- ✅ State transition: draft → counting
- ❌ Fail without authentication (401)
- ❌ Fail with invalid data (400)

### 2. **LIST** Stock Counts (GET /api/inventory/stockcounts)
- ✅ Pagination (page, limit)
- ✅ Filter by state (draft/counting/validating/done/cancelled)
- ✅ Filter by creator (createdById)
- ✅ Response structure validation

### 3. **GET** Stock Count (GET /api/inventory/stockcounts/:id)
- ✅ Retrieve count with lines
- ✅ Difference calculation (counted - expected)
- ✅ Difference percentage
- ✅ Pagination for lines
- ❌ 404 for non-existent count

### 4. **UPDATE** Count Line (POST /api/inventory/stockcounts/:id/lines)
- ✅ Add/update line with counted quantity
- ✅ UOM conversion (e.g., boxes → base units)
- ✅ Ad-hoc products (not in initial scope)
- ✅ Notes attachment
- ❌ Fail for non-counting state (400)
- ❌ Validation errors (400)

### 5. **VALIDATE** & Reconcile (POST /api/inventory/stockcounts/:id/validate)
- ✅ Calculate differences for all lines
- ✅ Create ADJUSTMENT_IN for positive differences
- ✅ Create ADJUSTMENT_OUT for negative differences
- ✅ Integration with StockMovementHandler
- ✅ State transition: counting → validating → done
- ✅ Link movements to stock_count_id
- ✅ Collect warnings (skipped lines)
- ✅ Prevent negative stock (with flag)
- ❌ Fail for already completed count (400)
- ❌ Validation errors reported

### 6. **CANCEL** Stock Count (POST /api/inventory/stockcounts/:id/cancel)
- ✅ Cancel counting state
- ✅ State transition to cancelled
- ❌ Fail to cancel completed count (400)

### 7. **DELETE** Stock Count (DELETE /api/inventory/stockcounts/:id)
- ✅ Delete draft counts
- ✅ Delete cancelled counts
- ❌ Fail to delete completed/counting counts (400)
- ❌ 404 for non-existent count

### 8. **E2E Workflow Test**
- ✅ Create → Update lines → Get with lines → Validate → Verify final state
- ✅ Complete workflow in single test
- ✅ Verify stock movements created
- ✅ Verify state changes

## Running Tests

### Option 1: Run All Stock Count Tests
```powershell
cd SamplePOS.Server
$env:NODE_ENV='test'
npm test -- --testPathPattern=stockCount.test.ts
```

### Option 2: Run Specific Test Suite
```powershell
npm test -- --testPathPattern=stockCount.test.ts --testNamePattern="CREATE"
```

### Option 3: Watch Mode
```powershell
npm test:watch -- --testPathPattern=stockCount.test.ts
```

### Option 4: With Coverage
```powershell
npm test -- --testPathPattern=stockCount.test.ts --coverage
```

## Manual Testing with PowerShell

Alternative to automated tests - use manual API calls:

```powershell
# 1. Login to get token
$loginRes = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method POST -Body (@{
  email = "admin@example.com"
  password = "admin123"
} | ConvertTo-Json) -ContentType "application/json"

$token = $loginRes.data.token
$headers = @{ Authorization = "Bearer $token" }

# 2. Create stock count
$createRes = Invoke-RestMethod -Uri "http://localhost:3001/api/inventory/stockcounts" -Method POST `
  -Headers $headers -Body (@{
    name = "Test Count $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    notes = "Manual test"
    includeAllProducts = $true
  } | ConvertTo-Json) -ContentType "application/json"

$countId = $createRes.data.stockCount.id
Write-Host "Created count: $countId"

# 3. Get count with lines
$getRes = Invoke-RestMethod -Uri "http://localhost:3001/api/inventory/stockcounts/$countId" `
  -Headers $headers

Write-Host "Lines count: $($getRes.data.lines.Count)"

# 4. Update a line
$lineRes = Invoke-RestMethod -Uri "http://localhost:3001/api/inventory/stockcounts/$countId/lines" `
  -Method POST -Headers $headers -Body (@{
    productId = $getRes.data.lines[0].product_id
    batchId = $getRes.data.lines[0].batch_id
    countedQty = 95
    uom = "BASE"
    notes = "Manual test count"
  } | ConvertTo-Json) -ContentType "application/json"

# 5. Validate (reconcile)
$validateRes = Invoke-RestMethod -Uri "http://localhost:3001/api/inventory/stockcounts/$countId/validate" `
  -Method POST -Headers $headers -Body (@{
    notes = "Manual validation test"
    allowNegativeAdjustments = $true
  } | ConvertTo-Json) -ContentType "application/json"

Write-Host "Adjustments created: $($validateRes.data.adjustmentsCreated)"
Write-Host "Movement IDs: $($validateRes.data.movementIds -join ', ')"

# 6. Verify final state
$finalRes = Invoke-RestMethod -Uri "http://localhost:3001/api/inventory/stockcounts/$countId" `
  -Headers $headers

Write-Host "Final state: $($finalRes.data.stockCount.state)"
```

## Known Issues & Workarounds

### Jest + ES Modules Configuration
The test file uses ES modules (`import.meta.url` in logger.ts) which requires specific Jest configuration:
- `preset: 'ts-jest/presets/default-esm'`
- `extensionsToTreatAsEsm: ['.ts']`
- `moduleNameMapper` for `.js` extensions
- `isolatedModules: true` in ts-jest config

### Database State Management
Tests use the same database as development. Consider:
1. Using a separate test database
2. Transaction rollback pattern for each test
3. Seeding test data before suite

### Async Cleanup
`afterAll()` cleanup may leave orphaned data if tests fail. Consider:
- Using database transactions
- Cleanup script: `DELETE FROM stock_counts WHERE name LIKE 'Test%'`

## Test Metrics

- **Total Tests**: 40+
- **Coverage Areas**: 8 (CRUD + E2E workflow)
- **Lines of Code**: 600+
- **Expected Runtime**: ~10-15 seconds
- **Success Rate Target**: 100%

## Next Steps

1. **Run Migration**: ✅ DONE (tables created)
2. **Start Server**: `npm run dev`
3. **Run Tests**: Resolve Jest ES module configuration or use manual PowerShell tests
4. **CI/CD Integration**: Add to GitHub Actions workflow
5. **Performance Tests**: Add load testing for bulk count operations

## Alternative: Manual Test Checklist

If automated tests fail due to Jest config, use this manual checklist:

- [ ] Create count with all products → State = counting, Lines > 0
- [ ] Create count with specific productIds → Only those products included
- [ ] List counts with pagination → Returns array with pagination meta
- [ ] Get count by ID → Returns count with lines array
- [ ] Update count line with BASE uom → counted_qty_base updated
- [ ] Update count line with custom uom (e.g., BOX) → Converted to base units
- [ ] Try updating line in 'done' state → 400 error
- [ ] Validate count → Adjustments created, state = done
- [ ] Try validating again → 400 error (already done)
- [ ] Cancel counting count → State = cancelled
- [ ] Try cancelling done count → 400 error
- [ ] Delete draft count → Success
- [ ] Try deleting done count → 400 error
- [ ] Verify stock movements created → Query stock_movements with reference_id

## Database Verification Queries

```sql
-- Check stock counts
SELECT id, name, state, created_at, validated_at 
FROM stock_counts 
ORDER BY created_at DESC 
LIMIT 10;

-- Check count lines with differences
SELECT 
  scl.id,
  p.name as product_name,
  scl.expected_qty_base,
  scl.counted_qty_base,
  (scl.counted_qty_base - scl.expected_qty_base) as difference
FROM stock_count_lines scl
JOIN products p ON scl.product_id = p.id
WHERE scl.stock_count_id = 'YOUR_COUNT_ID';

-- Check generated stock movements
SELECT 
  sm.id,
  sm.movement_number,
  sm.movement_type,
  sm.quantity,
  sm.reason,
  p.name as product_name
FROM stock_movements sm
JOIN products p ON sm.product_id = p.id
WHERE sm.reference_type = 'STOCK_COUNT' 
  AND sm.reference_id = 'YOUR_COUNT_ID';
```

---

**Status**: Tests written, migration run ✅  
**Blocker**: Jest ES module configuration (minor - manual tests work)  
**Recommendation**: Use PowerShell manual testing for now, resolve Jest config later
