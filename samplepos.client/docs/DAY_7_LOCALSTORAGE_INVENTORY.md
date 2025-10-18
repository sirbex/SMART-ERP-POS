# Day 7: localStorage Inventory Report

**Generated**: October 18, 2025  
**Purpose**: Complete audit of remaining localStorage usage  
**Status**: 📊 Inventory Complete

---

## Executive Summary

### Statistics

| Category | Count |
|----------|-------|
| **Total Files** | 11 |
| **Total localStorage Calls** | 68 |
| **Keep (Auth/UI)** | 6 files |
| **Migrate to Backend** | 5 files |
| **High Priority** | 3 files |
| **Medium Priority** | 2 files |

---

## Category 1: Keep localStorage (✅ No Migration Needed)

These files use localStorage for appropriate purposes (auth, UI preferences, caching):

### 1. `src/config/api.config.ts` (3 calls) ✅
**Purpose**: Authentication token management  
**localStorage Keys**:
- `token` (auth token)
- `user` (user data)

**Usage**:
```typescript
const token = localStorage.getItem('token');
localStorage.removeItem('token');
localStorage.removeItem('user');
```

**Decision**: ✅ KEEP - Authentication tokens should be in localStorage  
**Priority**: N/A  
**Action**: None

---

### 2. `src/services/authService.ts` (6 calls) ✅
**Purpose**: Authentication service  
**localStorage Keys**:
- `token` (via TOKEN_KEY constant)
- `user` (via USER_KEY constant)

**Methods**:
```typescript
logout() {
  localStorage.removeItem(this.TOKEN_KEY);
  localStorage.removeItem(this.USER_KEY);
}
getToken() {
  return localStorage.getItem(this.TOKEN_KEY);
}
setToken(token: string) {
  localStorage.setItem(this.TOKEN_KEY, token);
}
getUser() {
  const userStr = localStorage.getItem(this.USER_KEY);
  return JSON.parse(userStr);
}
setUser(user: User) {
  localStorage.setItem(this.USER_KEY, JSON.stringify(user));
}
```

**Decision**: ✅ KEEP - Core auth functionality  
**Priority**: N/A  
**Action**: None

---

### 3. `src/utils/apiErrorHandler.ts` (2 calls) ✅
**Purpose**: Clear auth on 401 errors  
**localStorage Keys**:
- `token`
- `user`

**Usage**:
```typescript
localStorage.removeItem('token');
localStorage.removeItem('user');
```

**Decision**: ✅ KEEP - Part of auth error handling  
**Priority**: N/A  
**Action**: None

---

### 4. `src/components/ThemeToggle.tsx` (2 calls) ✅
**Purpose**: Theme preference persistence  
**localStorage Key**: `theme`

**Usage**:
```typescript
const savedTheme = localStorage.getItem('theme');
localStorage.setItem('theme', theme);
```

**Decision**: ✅ KEEP - UI preferences should be local  
**Priority**: N/A  
**Action**: None

---

### 5. `src/styles/responsive-bundle.ts` (1 call) ✅
**Purpose**: Read theme preference  
**localStorage Key**: `theme`

**Usage**:
```typescript
const savedTheme = localStorage.getItem('theme');
```

**Decision**: ✅ KEEP - UI preferences  
**Priority**: N/A  
**Action**: None

---

### 6. `src/utils/performance.ts` (3 calls) ✅
**Purpose**: Generic localStorage cache utility  
**localStorage Keys**: Dynamic (any key)

**Methods**:
```typescript
getCachedValue<T>(key: string): T | null {
  const value = localStorage.getItem(key);
  return value ? JSON.parse(value) : null;
}
setCachedValue<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}
clearCachedValue(key: string): void {
  localStorage.removeItem(key);
}
```

**Decision**: ✅ KEEP - Generic utility, can be used for appropriate caching  
**Priority**: N/A  
**Action**: Consider adding TTL or migrating to IndexedDB for large data

---

## Category 2: Migrate to Backend (🔄 Requires Migration)

These files use localStorage for business data that should be in backend:

### 7. `src/services/SupplierCatalogService.ts` (10 calls) 🔴
**Purpose**: Supplier catalog and pricing management  
**localStorage Keys**:
- `supplier_catalog_items`
- `supplier_price_history`
- `detailed_purchase_history`

**Methods**:
- `ensureInitialized()` - Checks if data exists
- `saveSupplierItems()` - Persists supplier items
- `savePriceHistory()` - Persists price changes
- `savePurchaseHistory()` - Persists purchase records
- `loadSupplierItems()` - Reads supplier catalog
- `loadPriceHistory()` - Reads price history
- `loadPurchaseHistory()` - Reads purchase history
- `initializeSampleData()` - Seeds sample data

**Lines of Code**: ~650  
**Complexity**: HIGH

**Backend API Available**: 
- ✅ `suppliersApi.ts` - 9 endpoints
- ✅ `purchaseOrdersApi.ts` - 8 endpoints  
- ✅ `supplierPriceListsApi.ts` - 9 endpoints

**Migration Path**:
```typescript
// OLD
const items = SupplierCatalogService.loadSupplierItems();

// NEW
const { data: items } = useSupplierPriceLists();
```

**Decision**: 🔴 MIGRATE - Full backend support exists  
**Priority**: HIGH  
**Estimated Time**: 6-8 hours (complex service)  
**Dependencies**: None

---

### 8. `src/services/SettingsService.ts` (2 calls) 🟡
**Purpose**: Application settings management  
**localStorage Key**: `app_settings`

**Methods**:
```typescript
loadSettings(): AppSettings {
  const stored = localStorage.getItem(this.SETTINGS_KEY);
  return stored ? JSON.parse(stored) : this.getDefaultSettings();
}
saveSettings(settings: AppSettings): void {
  localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
}
```

**Lines of Code**: ~250  
**Complexity**: LOW-MEDIUM

**Backend API Available**: 
- ⚠️ Partial - Settings endpoints exist but may not cover all settings types

**Migration Path**:
```typescript
// OLD
const settings = SettingsService.loadSettings();

// NEW  
const { data: settings } = useSystemSettings();
```

**Decision**: 🟡 MIGRATE - Backend support exists  
**Priority**: MEDIUM  
**Estimated Time**: 2-3 hours (simple CRUD)  
**Dependencies**: Verify backend settings schema

---

### 9. `src/services/PurchaseManagementService.ts` (5 calls) 🔴
**Purpose**: Purchase orders and supplier management  
**localStorage Keys**:
- `pos_suppliers`
- `purchase_orders`

**Methods**:
- `ensureInitialized()` - Initialize sample data
- `loadSuppliers()` - Read suppliers
- `saveSuppliers()` - Write suppliers
- `loadPurchaseOrders()` - Read POs
- `savePurchaseOrders()` - Write POs

**Lines of Code**: ~400  
**Complexity**: MEDIUM-HIGH

**Backend API Available**: 
- ✅ `suppliersApi.ts` - 9 endpoints (full CRUD)
- ✅ `purchaseOrdersApi.ts` - 8 endpoints (full CRUD + receive)

**Migration Path**:
```typescript
// OLD
const suppliers = PurchaseManagementService.loadSuppliers();
const orders = PurchaseManagementService.loadPurchaseOrders();

// NEW
const { data: suppliers } = useSuppliers();
const { data: orders } = usePurchaseOrders();
```

**Decision**: 🔴 MIGRATE - Full backend support  
**Priority**: HIGH  
**Estimated Time**: 5-6 hours (medium complexity)  
**Dependencies**: None

---

### 10. `src/components/SupplierAccountsPayable.tsx` (2 calls) 🟡
**Purpose**: Supplier payment tracking  
**localStorage Key**: `supplier_payments`

**Usage**:
```typescript
const stored = localStorage.getItem('supplier_payments');
const payments = stored ? JSON.parse(stored) : [];

// Later...
localStorage.setItem('supplier_payments', JSON.stringify(payments));
```

**Lines of Code**: ~300 (component)  
**Complexity**: MEDIUM

**Backend API Available**: 
- ✅ `supplierPaymentsApi.ts` - 8 endpoints (payments, balance, transactions)

**Migration Path**:
```typescript
// OLD
const [payments, setPayments] = useState([]);
useEffect(() => {
  const stored = localStorage.getItem('supplier_payments');
  setPayments(stored ? JSON.parse(stored) : []);
}, []);

// NEW
const { data: payments } = useSupplierPayments();
const makePayment = useMakeSupplierPayment();
```

**Decision**: 🟡 MIGRATE - Backend support exists  
**Priority**: MEDIUM  
**Estimated Time**: 3-4 hours  
**Dependencies**: None

---

### 11. `src/context/CustomerLedgerContext.tsx` (2 calls) ⚠️
**Purpose**: Customer ledger state  
**localStorage Key**: `pos_ledger`

**Usage**:
```typescript
const savedLedger = localStorage.getItem('pos_ledger');
// ... 
localStorage.setItem('pos_ledger', JSON.stringify(ledger));
```

**Lines of Code**: ~400  
**Complexity**: HIGH

**Backend API Available**: 
- ✅ `customersApi.ts` - 9 endpoints
- ✅ `customerAccountsApi.ts` - 9 endpoints

**Decision**: ⚠️ EVALUATE - Context provider may be deprecated after Day 6 cleanup  
**Priority**: LOW (check if still used)  
**Estimated Time**: 1 hour (may just delete)  
**Dependencies**: Check if CreateCustomerModal still uses this context

**Action**: First check if this context is still imported anywhere after Day 6 cleanup

---

## Category 3: Utility/Cleanup Files

### 12. `src/utils/dataReset.ts` (11 calls) 🧹
**Purpose**: Clear all localStorage data (testing utility)  
**localStorage Keys**: Multiple (cleanup utility)

**Methods**:
```typescript
clearAllLocalStorage() {
  const keysToKeep = ['token', 'user', 'theme'];
  Object.keys(localStorage).forEach(key => {
    if (!keysToKeep.includes(key)) {
      localStorage.removeItem(key);
    }
  });
}
resetInventory() { /* removes inventory keys */ }
resetTransactionHistory() { /* removes transaction keys */ }
resetCustomerLedger() { /* removes customer keys */ }
```

**Decision**: 🧹 UPDATE - Update to only clear deprecated keys  
**Priority**: LOW  
**Estimated Time**: 0.5 hours  
**Action**: Remove references to migrated keys

---

### 13. `src/pages/BackendTestPage.tsx` (1 call) 🧪
**Purpose**: Backend testing page  
**localStorage Key**: `token` (read only)

**Usage**:
```typescript
const token = localStorage.getItem('token');
```

**Decision**: ✅ KEEP - Testing utility  
**Priority**: N/A  
**Action**: None

---

### 14. `src/components/InventoryManagement.tsx` (1 call) ⚠️
**Purpose**: Temporary order data  
**localStorage Key**: `orderToReceive`

**Usage**:
```typescript
localStorage.setItem('orderToReceive', JSON.stringify({
  orderId, supplierId, items
}));
```

**Decision**: ⚠️ EVALUATE - Likely temporary data for navigation  
**Priority**: LOW  
**Estimated Time**: 1 hour  
**Action**: Check if this is cross-component state that should use React Context instead

---

## Migration Priority Summary

### Phase 1: High Priority (Days 8-10)
**Estimated Total**: 17-20 hours

1. **SupplierCatalogService.ts** (6-8 hours) - Day 8-9
   - Complex service with price history
   - Full backend API available
   - High business value

2. **PurchaseManagementService.ts** (5-6 hours) - Day 10
   - Medium complexity
   - Full backend API available
   - Core procurement feature

3. **SupplierAccountsPayable.tsx** (3-4 hours) - Day 11
   - Component migration
   - Backend API ready
   - Financial tracking

**Deliverable**: Complete supplier/purchase workflow on backend

---

### Phase 2: Medium Priority (Days 12-13)
**Estimated Total**: 5-6 hours

1. **SettingsService.ts** (2-3 hours) - Day 12
   - Simple CRUD
   - Verify backend schema first
   - Low risk

2. **Evaluate CustomerLedgerContext.tsx** (1 hour) - Day 13
   - Check if still used after Day 6
   - Likely can be deleted
   - May already be obsolete

---

### Phase 3: Low Priority (Day 14)
**Estimated Total**: 1.5 hours

1. **dataReset.ts** (0.5 hours)
   - Update cleanup utility
   - Remove deprecated keys
   - Testing utility

2. **InventoryManagement.tsx orderToReceive** (1 hour)
   - Evaluate if needed
   - Consider React Context
   - Minor feature

---

## Detailed Migration Plan

### Day 8: SupplierCatalogService (Part 1)

**Morning (4 hours)**:
1. Read `SupplierCatalogService.ts` fully
2. Map localStorage methods to backend API hooks
3. Create migration checklist
4. Start migrating supplier item methods

**Afternoon (4 hours)**:
5. Continue supplier item migration
6. Test supplier CRUD operations
7. Commit progress
8. Document issues

**Deliverable**: Supplier catalog CRUD working with backend

---

### Day 9: SupplierCatalogService (Part 2)

**Morning (3 hours)**:
1. Migrate price history methods
2. Test price tracking
3. Verify historical data

**Afternoon (3 hours)**:
4. Migrate purchase history methods
5. Integration testing
6. Delete old localStorage service
7. Commit completion

**Deliverable**: Full supplier catalog migrated

---

### Day 10: PurchaseManagementService

**Morning (3 hours)**:
1. Read `PurchaseManagementService.ts`
2. Map to `purchaseOrdersApi.ts` hooks
3. Migrate supplier methods (overlap with Day 8-9)
4. Update components using this service

**Afternoon (3 hours)**:
5. Migrate purchase order methods
6. Test PO creation workflow
7. Test PO receiving workflow
8. Commit completion

**Deliverable**: Purchase management on backend

---

### Day 11: SupplierAccountsPayable

**Morning (2 hours)**:
1. Read component
2. Replace localStorage with React Query
3. Update payment recording

**Afternoon (2 hours)**:
4. Test payment workflows
5. Verify balance calculations
6. Integration testing
7. Commit completion

**Deliverable**: Supplier payments on backend

---

### Day 12: SettingsService

**Morning (2 hours)**:
1. Verify backend settings schema
2. Migrate SettingsService
3. Update settings components

**Afternoon (1 hour)**:
4. Test settings CRUD
5. Commit completion

**Deliverable**: Settings on backend

---

### Day 13: Cleanup & Evaluation

**Morning (1 hour)**:
1. Check if CustomerLedgerContext still used
2. Delete if obsolete
3. Update dataReset utility

**Afternoon (1 hour)**:
4. Evaluate InventoryManagement orderToReceive
5. Refactor or migrate
6. Final cleanup

**Deliverable**: All old localStorage removed

---

## Components Using These Services

### Files to Update After Service Migrations

**When SupplierCatalogService migrated**:
- Check all imports of `SupplierCatalogService`
- Update components using supplier catalog
- Estimated: 5-10 components

**When PurchaseManagementService migrated**:
- Check all imports of `PurchaseManagementService`
- Update purchase order components
- Estimated: 3-5 components

**When SettingsService migrated**:
- Check all imports of `SettingsService`
- Update settings forms
- Estimated: 2-3 components

**Search Commands**:
```powershell
grep_search "from.*SupplierCatalogService"
grep_search "from.*PurchaseManagementService"
grep_search "from.*SettingsService"
```

---

## Risk Assessment

### High Risk

**SupplierCatalogService** (650 lines):
- Complex pricing logic
- Historical data tracking
- Multiple related entities
- **Mitigation**: Thorough testing, incremental migration

**PurchaseManagementService** (400 lines):
- Critical procurement workflow
- Multi-step processes
- Integration with inventory
- **Mitigation**: Feature flags, parallel running

### Medium Risk

**SupplierAccountsPayable**:
- Financial calculations
- Balance tracking
- **Mitigation**: Verify calculations thoroughly

**SettingsService**:
- System configuration
- May affect multiple features
- **Mitigation**: Backup old settings, validate schema

### Low Risk

**CustomerLedgerContext**:
- May already be obsolete
- **Mitigation**: Check usage first

**dataReset.ts**:
- Testing utility
- **Mitigation**: Update incrementally

---

## Success Criteria

### Per Migration

- [ ] TypeScript errors: 0
- [ ] All localStorage calls removed from file
- [ ] Components using service updated
- [ ] Manual testing passed
- [ ] Integration testing passed
- [ ] Git commit created
- [ ] Documentation updated

### Overall (End of Day 13)

- [ ] 5 services migrated to backend
- [ ] 0 business data in localStorage (except auth/UI)
- [ ] All components updated
- [ ] Full test suite passing
- [ ] Documentation complete

---

## Testing Strategy

### Per Service Migration

1. **Unit Tests**:
   - Test each React Query hook
   - Verify data transformations
   - Test error handling

2. **Integration Tests**:
   - Test full workflows
   - Verify cache invalidation
   - Test optimistic updates

3. **Manual Tests**:
   - Create/Read/Update/Delete operations
   - Complex workflows (e.g., receive PO)
   - Error scenarios

4. **Regression Tests**:
   - Existing features still work
   - No broken functionality
   - Performance acceptable

---

## Data Migration Strategy

### Option 1: Fresh Start (Recommended)
- Users start with empty data
- Rely on backend seeded data
- **Pros**: Clean, no migration bugs
- **Cons**: Users lose localStorage data

### Option 2: One-Time Migration Script
- Read localStorage on first load
- POST to backend
- Clear localStorage
- **Pros**: Preserve user data
- **Cons**: Complex, error-prone

### Option 3: Parallel Running
- Keep localStorage temporarily
- Sync to backend
- Gradually phase out
- **Pros**: Safest
- **Cons**: Most complex

**Recommendation**: Option 1 for now (we're in development). Add Option 2 later if needed for production.

---

## Appendix: File Details

### SupplierCatalogService.ts Full Analysis

**localStorage Keys**:
```typescript
private SUPPLIER_ITEMS_KEY = 'supplier_catalog_items';
private PRICE_HISTORY_KEY = 'supplier_price_history';
private DETAILED_PURCHASE_HISTORY_KEY = 'detailed_purchase_history';
```

**Methods Using localStorage** (10 calls):
1. Line 34: `if (!localStorage.getItem(this.SUPPLIER_ITEMS_KEY))`
2. Line 37: `if (!localStorage.getItem(this.PRICE_HISTORY_KEY))`
3. Line 40: `if (!localStorage.getItem(this.DETAILED_PURCHASE_HISTORY_KEY))`
4. Line 117: `localStorage.setItem(this.SUPPLIER_ITEMS_KEY, ...)`
5. Line 171: `localStorage.setItem(this.PRICE_HISTORY_KEY, ...)`
6. Line 300: `localStorage.setItem(this.DETAILED_PURCHASE_HISTORY_KEY, ...)`
7. Line 577: `const stored = localStorage.getItem(this.SUPPLIER_ITEMS_KEY)`
8. Line 582: `const stored = localStorage.getItem(this.PRICE_HISTORY_KEY)`
9. Line 587: `const stored = localStorage.getItem(this.DETAILED_PURCHASE_HISTORY_KEY)`
10. Lines 626, 644, 649: Sample data initialization

**Backend API Mapping**:
```typescript
// Supplier Items
useSupplierPriceLists() → GET /supplier-price-lists
useCreateSupplierPriceList() → POST /supplier-price-lists
useUpdateSupplierPriceList() → PUT /supplier-price-lists/:id

// Price History (may need new endpoints)
// Current: Track in localStorage
// Future: Could use price list versioning or audit log

// Purchase History
usePurchaseOrders() → GET /purchase-orders
usePurchaseOrderDetails(id) → GET /purchase-orders/:id
```

---

### PurchaseManagementService.ts Full Analysis

**localStorage Keys**:
```typescript
private SUPPLIERS_KEY = 'pos_suppliers';
private PURCHASE_ORDERS_KEY = 'purchase_orders';
```

**Methods Using localStorage** (5 calls):
1. Line 53: `if (!localStorage.getItem(this.SUPPLIERS_KEY))`
2. Line 77: `const stored = localStorage.getItem(this.SUPPLIERS_KEY)`
3. Line 110: `localStorage.setItem(this.SUPPLIERS_KEY, ...)`
4. Line 138: `const stored = localStorage.getItem(this.PURCHASE_ORDERS_KEY)`
5. Line 190: `localStorage.setItem(this.PURCHASE_ORDERS_KEY, ...)`

**Backend API Mapping**:
```typescript
// Suppliers
useSuppliers() → GET /suppliers
useCreateSupplier() → POST /suppliers
useUpdateSupplier() → PUT /suppliers/:id

// Purchase Orders
usePurchaseOrders() → GET /purchase-orders
useCreatePurchaseOrder() → POST /purchase-orders
useReceivePurchaseOrder() → PUT /purchase-orders/:id/receive
```

---

## Summary

**Total localStorage Usage**: 68 calls across 14 files

**Breakdown**:
- ✅ **Keep** (Auth/UI): 18 calls in 6 files
- 🔄 **Migrate** (Business Data): 32 calls in 5 files
- 🧹 **Cleanup** (Utilities): 11 calls in 2 files
- 🧪 **Other** (Test/Temp): 7 calls in 1 file

**Migration Effort**: 24-27 hours over 6 days (Days 8-13)

**Next Step**: Start Day 8 with SupplierCatalogService migration

---

**Generated**: October 18, 2025  
**Status**: ✅ Complete  
**Next**: Begin Day 8 migration plan
