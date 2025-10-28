# Backend Code Duplication Analysis

## Patterns Found

### 1. **Pagination Logic** ✅ PARTIALLY ADDRESSED
**Current State**: Mixed usage
- ✅ `helpers.ts` has `parsePagination()` and `buildPaginationResponse()`
- ❌ Some modules use it (customers.ts, customerGroups.ts, pricingTiers.ts)
- ❌ Some modules manually calculate (suppliers.ts lines 51, 373)

**Files with manual pagination:**
- `suppliers.ts` - lines 51, 373
- Need to audit others

**Fix**: Ensure ALL modules use the shared helpers

---

### 2. **Try-Catch Error Handling** 🔴 MAJOR DUPLICATION
**Pattern**: Every route has:
```typescript
try {
  // ... logic
} catch (error) {
  next(error);
}
```

**Occurrences**: 100+ across all modules
**Impact**: High - repeated 3-5 lines per endpoint

**Current Approach**: Already using Express error middleware via `next(error)`
**Status**: ✅ **CORRECT PATTERN** - This is the Express.js best practice
- Routes should catch errors and pass to `next(error)`
- Central error handler in middleware catches all

**Recommendation**: KEEP AS IS - this is not true duplication, it's proper error handling

---

### 3. **Search/Filter Logic** 🟡 MODERATE DUPLICATION
**Pattern**: Building `where.OR` clauses for search
```typescript
where.OR = [
  { name: { contains: search, mode: 'insensitive' } },
  { phone: { contains: search, mode: 'insensitive' } },
  ...
];
```

**Files**:
- customers.ts - line 25
- suppliers.ts - line 56

**Fix**: Create `buildSearchFilter` utility

---

### 4. **Validation Schemas** ✅ WELL ORGANIZED
**Current State**: Most validation in `/validation` directory
- ✅ customer.js
- ✅ payment.js
- ❌ Some inline (suppliers.ts has Zod schemas at top)

**Recommendation**: Move all inline schemas to `/validation`

---

### 5. **Authentication Middleware** ✅ PROPERLY SHARED
Every route uses:
```typescript
router.get('/', authenticate, authorize([...]), async (req, res, next) => {
```
**Status**: ✅ **CORRECT** - middleware properly reused

---

### 6. **Logger Calls** 🟢 GOOD PATTERN
**Pattern**:
```typescript
logger.info(`Listed ${items.length} items`, { userId });
logger.error('Failed to...', { error, context });
```
**Status**: ✅ **CORRECT** - consistent logging, not duplication

---

### 7. **Response Formatting** 🟡 INCONSISTENT
**Current State**:
- Some use `buildPaginationResponse()` ✅
- Others manually construct:
  ```typescript
  res.json({
    data: items,
    pagination: { page, limit, total, pages: Math.ceil(total/limit) }
  });
  ```

**Fix**: Standardize on helper function

---

## Summary

### Critical Issues (Must Fix)
1. ❌ **Inconsistent pagination usage** - suppliers.ts not using helpers
2. ❌ **Validation schemas scattered** - some inline, some in /validation

### Non-Issues (Correct Patterns)
1. ✅ Try-catch blocks - proper Express error handling
2. ✅ Authentication middleware - proper reuse
3. ✅ Logger usage - consistent pattern

### Low Priority
1. 🟡 Search filter logic - could extract to utility
2. 🟡 Response formatting - mostly consistent

---

## Recommended Fixes

### 1. Standardize Pagination (HIGH PRIORITY)
**File**: `src/utils/helpers.ts` (already exists)

**Action**: Ensure all modules use:
- `parsePagination(req.query)` instead of manual calculation
- `buildPaginationResponse(data, total, { page, limit, skip })` for responses

### 2. Extract Search Utilities (MEDIUM PRIORITY)
**New File**: `src/utils/queryBuilders.ts`

Create:
```typescript
export function buildSearchFilter(
  search: string,
  fields: string[],
  mode: 'insensitive' | 'default' = 'insensitive'
) {
  return fields.map(field => ({
    [field]: { contains: search, mode }
  }));
}
```

Usage:
```typescript
if (search) {
  where.OR = buildSearchFilter(search, ['name', 'phone', 'email']);
}
```

### 3. Centralize Validation (LOW PRIORITY)
Move inline Zod schemas from:
- `suppliers.ts` → `validation/supplier.js`
- Any others found

---

## Files to Audit

### High Priority
- [ ] suppliers.ts - Fix pagination on lines 51, 373
- [ ] Check all modules for manual pagination

### Medium Priority
- [ ] Extract search filters to utility
- [ ] Standardize response formatting

### Low Priority
- [ ] Move validation schemas to /validation directory

---

## Non-Duplications (Educational)

### Why Try-Catch is NOT duplication:
Express.js best practice requires each async route to catch errors:
```typescript
router.get('/', async (req, res, next) => {
  try {
    // ... await operations
  } catch (error) {
    next(error); // Pass to error middleware
  }
});
```

**Alternative** (not recommended):
Could use express-async-errors package to auto-catch, but explicit try-catch is:
- More visible
- Better for debugging
- Recommended by Express team

### Why Middleware Usage is NOT duplication:
```typescript
router.get('/', authenticate, authorize(['ADMIN']), handler);
```
This is **function composition** - the correct pattern.

---

## Metrics

**Total API Endpoints**: ~100+
**Try-Catch Blocks**: 100+ (CORRECT)
**Pagination Issues**: 2 files found
**Validation Issues**: 1 file found
**Search Filter Duplication**: 2 instances

**Overall Code Quality**: ✅ **GOOD**
- Proper middleware usage
- Consistent error handling
- Some minor inconsistencies to fix
