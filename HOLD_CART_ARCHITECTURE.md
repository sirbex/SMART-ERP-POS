# Hold Cart System - Architecture & Rules

## Overview
The Hold Cart feature allows cashiers to temporarily save a cart and resume it later - exactly like QuickBooks POS. This is **NOT** an invoice or sale - it's a pure cart state snapshot.

## Database Schema

### Table: `pos_held_orders`
```sql
CREATE TABLE pos_held_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hold_number VARCHAR(50) UNIQUE NOT NULL,     -- HOLD-YYYY-####
  user_id UUID NOT NULL REFERENCES users(id),
  customer_id UUID NULL REFERENCES customers(id),
  customer_name VARCHAR(255) NULL,
  
  -- Financial summary (for display only)
  subtotal NUMERIC(15, 4) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
  total_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
  
  -- Metadata
  hold_reason VARCHAR(255) NULL,
  notes TEXT NULL,
  metadata JSONB NULL,
  terminal_id VARCHAR(100) NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NULL                   -- Default: 24 hours
);
```

### Table: `pos_held_order_items`
```sql
CREATE TABLE pos_held_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hold_id UUID NOT NULL REFERENCES pos_held_orders(id) ON DELETE CASCADE,
  
  -- Product info
  product_id UUID NOT NULL REFERENCES products(id),
  product_name VARCHAR(255) NOT NULL,
  product_sku VARCHAR(100) NULL,
  product_type VARCHAR(20) NOT NULL DEFAULT 'inventory',
  
  -- Pricing
  quantity NUMERIC(15, 4) NOT NULL,
  unit_price NUMERIC(15, 4) NOT NULL,
  cost_price NUMERIC(15, 4) NOT NULL DEFAULT 0,
  subtotal NUMERIC(15, 4) NOT NULL,
  
  -- Tax
  is_taxable BOOLEAN NOT NULL DEFAULT true,
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
  
  -- Discount
  discount_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
  
  -- UoM
  uom_id UUID NULL,
  uom_name VARCHAR(100) NULL,
  
  -- Ordering
  line_order INTEGER NOT NULL DEFAULT 0
);
```

## Critical Business Rules

### ✅ WHAT HOLDS DO:
1. **Save cart state** - Exact snapshot of cart items
2. **Persist in database** - Survives refreshes, logouts, server restarts
3. **Auto-expire** - Default 24 hours (configurable)
4. **User-scoped** - Each user sees only their holds
5. **Clear cart immediately** - Ready for next transaction (QuickBooks pattern)

### ❌ WHAT HOLDS DON'T DO:
1. **NO stock movements** - Inventory NOT affected
2. **NO payment processing** - Not a sale or invoice
3. **NO accounting entries** - Not recorded in books
4. **NO customer balance changes** - Not a credit transaction
5. **NO reservation** - Products available for other sales

## System Flow

### 1. Hold Cart (Save)
```typescript
// Frontend: POSPage.tsx
const handleHoldCart = async () => {
  if (items.length === 0) {
    toast.error('Cannot hold empty cart');
    return;
  }

  const response = await api.hold.create({
    userId: activeUser.id,           // From auth context
    terminalId: 'TERMINAL-001',
    customerName: selectedCustomer?.name,
    subtotal,
    discountAmount: cartDiscountAmount,
    taxAmount: tax,
    totalAmount: grandTotal,
    items: items.map((item, index) => ({
      productId: item.id,
      productName: item.name,
      productSku: item.sku,
      uomId: item.selectedUomId,
      uomName: item.uom,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      costPrice: item.costPrice,
      subtotal: item.subtotal,
      productType: item.productType || 'inventory',
      discountAmount: item.discount || 0,
      taxAmount: 0,
      isTaxable: false,
      lineOrder: index,
    })),
  });

  if (response.data.success) {
    // CRITICAL: Clear cart immediately (QuickBooks pattern)
    setItems([]);
    setSelectedCustomer(null);
    setCartDiscount(null);
    setPaymentLines([]);
    
    // Update count
    setHeldOrdersCount(prev => prev + 1);
    
    // Focus search for next transaction
    productSearchRef.current?.focusSearch();
    
    toast.success(`Cart held: ${response.data.data.holdNumber}`);
  }
};
```

### 2. Retrieve Holds (List)
```typescript
// Frontend: ResumeHoldDialog.tsx
const loadHolds = async () => {
  const response = await apiClient.get('/pos/hold');
  if (response.data?.success) {
    setHolds(response.data?.data || []);
  }
};
```

### 3. Resume Hold (Load)
```typescript
// Frontend: POSPage.tsx
const handleResumeHold = async (holdId: string) => {
  // Fetch full details
  const response = await api.hold.getById(holdId);
  const hold = response.data.data;
  
  // Restore cart
  setItems(hold.items.map((item: any) => ({
    id: item.productId,
    name: item.productName,
    sku: item.productSku,
    uom: item.uomName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    costPrice: item.costPrice,
    subtotal: item.subtotal,
    selectedUomId: item.uomId,
    discount: item.discountAmount,
    productType: item.productType || 'inventory',
  })));
  
  // CRITICAL: Delete hold after loading
  await api.hold.delete(hold.id);
  
  // Update count
  setHeldOrdersCount(prev => Math.max(0, prev - 1));
  
  toast.success(`Resumed hold: ${hold.holdNumber}`);
};
```

## API Endpoints

### POST `/api/pos/hold`
**Create hold**
- **Auth**: Required (JWT)
- **Input**: Validated with `CreateHoldOrderSchema`
- **Output**: Hold order with auto-generated `HOLD-YYYY-####`
- **Side Effects**: None (no stock movement)

### GET `/api/pos/hold`
**List holds**
- **Auth**: Required (JWT)
- **Filters**: `userId` (automatic), `terminalId` (optional)
- **Output**: Array of holds with item counts
- **Excludes**: Expired holds (where `expires_at < NOW()`)

### GET `/api/pos/hold/:id`
**Get hold by ID**
- **Auth**: Required (JWT)
- **Validation**: Must own the hold (`hold.userId === req.user.id`)
- **Output**: Full hold with items array
- **Error**: 410 if expired, 403 if not owner

### DELETE `/api/pos/hold/:id`
**Delete hold**
- **Auth**: Required (JWT)
- **Validation**: Must own the hold
- **Output**: Success message
- **Use Case**: Called automatically after resume

## Frontend State Management

### State Variables
```typescript
const [heldOrdersCount, setHeldOrdersCount] = useState(0);
const [showResumeDialog, setShowResumeDialog] = useState(false);
const [activeUser, setActiveUser] = useState(/* computed from localStorage */);
```

### Count Synchronization
```typescript
// Auto-refresh every 30 seconds
useEffect(() => {
  const fetchCount = async () => {
    if (activeUser?.token) {
      const response = await api.hold.list();
      if (response.data.success) {
        setHeldOrdersCount(response.data.data?.length || 0);
      }
    } else {
      setHeldOrdersCount(0); // Reset if logged out
    }
  };

  if (activeUser?.token) {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  } else {
    setHeldOrdersCount(0);
  }
}, [activeUser?.id, activeUser?.token, storageVersion]);
```

### Manual Refresh
```typescript
// After sale completion
const refreshHeldOrdersCount = useCallback(async () => {
  if (activeUser?.id && activeUser?.token) {
    const response = await api.hold.list();
    if (response.data.success) {
      setHeldOrdersCount(response.data.data?.length || 0);
    }
  }
}, [activeUser?.id, activeUser?.token]);
```

## Authentication Integration

### Token Management
```typescript
// activeUser computed from localStorage
const activeUser = useMemo(() => {
  try {
    const userStr = localStorage.getItem('user');
    const token = localStorage.getItem('auth_token');
    const user = userStr ? JSON.parse(userStr) : null;
    return user && token ? { ...user, token } : null;
  } catch {
    return null;
  }
}, [storageVersion]);
```

### Auth Change Events
```typescript
// In useAuth.ts - dispatch custom event
const login = (userData: User, token: string) => {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('user', JSON.stringify(userData));
  window.dispatchEvent(new Event('auth-changed'));
};

const logout = () => {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user');
  window.dispatchEvent(new Event('auth-changed'));
};

// In POSPage.tsx - listen for auth changes
useEffect(() => {
  const handleAuthChange = () => setStorageVersion(prev => prev + 1);
  window.addEventListener('auth-changed', handleAuthChange);
  return () => window.removeEventListener('auth-changed', handleAuthChange);
}, []);
```

## Response Structure (CRITICAL)

### Backend Response Format
```typescript
// All API endpoints return this structure
{
  success: boolean,
  data?: any,
  message?: string,
  error?: string
}
```

### Frontend Axios Response
```typescript
// Axios wraps the response in .data
const response = await apiClient.get('/pos/hold');
// response.data = { success: true, data: [...] }

// CORRECT:
if (response.data.success) {
  const holds = response.data.data;
}

// WRONG:
if (response.success) {  // ❌ response.success doesn't exist
  const holds = response.data;
}
```

## Rules to Never Break

### ✅ DO:

1. **Always use `apiClient`** from `utils/api.ts`
   ```typescript
   import apiClient from '../../utils/api';
   const response = await apiClient.get('/pos/hold');
   ```

2. **Always check `response.data.success`**
   ```typescript
   if (response.data.success) {
     const holds = response.data.data;
   }
   ```

3. **Always clear cart after hold**
   ```typescript
   setItems([]);
   setSelectedCustomer(null);
   setCartDiscount(null);
   setPaymentLines([]);
   ```

4. **Always delete hold after resume**
   ```typescript
   await api.hold.delete(hold.id);
   ```

5. **Always update count after operations**
   ```typescript
   setHeldOrdersCount(prev => prev + 1);  // After hold
   setHeldOrdersCount(prev => prev - 1);  // After resume
   ```

6. **Always check authentication**
   ```typescript
   if (activeUser?.token) {
     // Proceed with API call
   }
   ```

### ❌ DON'T:

1. **Never use raw `fetch()`** - Use `apiClient`
2. **Never check `response.success`** - Check `response.data.success`
3. **Never keep cart items after hold** - Clear immediately
4. **Never keep holds after resume** - Delete them
5. **Never create stock movements** - Holds don't affect inventory
6. **Never call API without token** - Check `activeUser?.token` first
7. **Never use `currentUser`** - Use `activeUser` (updated on auth changes)

## Common Pitfalls & Fixes

### Issue 1: Count shows wrong number
**Cause**: Checking `response.success` instead of `response.data.success`
**Fix**:
```typescript
// ❌ WRONG
if (response.success) {
  setHeldOrdersCount(response.data?.length || 0);
}

// ✅ CORRECT
if (response.data.success) {
  setHeldOrdersCount(response.data.data?.length || 0);
}
```

### Issue 2: Holds disappear after new sale
**Cause**: Not refreshing count after sale completion
**Fix**:
```typescript
// In handleFinalizeSale, after sale success:
toast.success('Sale completed successfully!');
refreshHeldOrdersCount(); // ← Add this
```

### Issue 3: Holds disappear after logout
**Cause**: Normal behavior! Holds are user-scoped
**Expected**: Count resets to 0 when logged out
**Fix**: None needed - this is correct

### Issue 4: Count doesn't update after login
**Cause**: `currentUser` not updating on auth change
**Fix**: Use `activeUser` with `storageVersion` dependency

### Issue 5: 401 errors on hold API
**Cause**: Token not in request
**Fix**: Use `apiClient` which auto-adds token via interceptor

## Testing Checklist

### Scenario 1: Basic Hold/Resume
- [ ] Add items to cart
- [ ] Click Hold button
- [ ] Verify cart clears immediately
- [ ] Verify count badge shows [1]
- [ ] Add different items
- [ ] Complete a sale
- [ ] Verify count still shows [1]
- [ ] Click Retrieve button
- [ ] Verify dialog shows held order
- [ ] Click on held order
- [ ] Verify cart restores items
- [ ] Verify count badge shows [0]
- [ ] Verify hold deleted from database

### Scenario 2: Logout/Login Persistence
- [ ] Hold a cart (count shows [1])
- [ ] Logout
- [ ] Verify count shows [0] (no auth)
- [ ] Login again
- [ ] Verify count shows [1] (restored from database)
- [ ] Resume hold
- [ ] Verify items restored correctly

### Scenario 3: Multiple Holds
- [ ] Hold cart #1 (2 items)
- [ ] Hold cart #2 (3 items)
- [ ] Hold cart #3 (1 item)
- [ ] Verify count shows [3]
- [ ] Retrieve dialog shows all 3 holds
- [ ] Resume hold #2
- [ ] Verify count shows [2]
- [ ] Verify other 2 holds still exist

### Scenario 4: Service Items in Hold
- [ ] Add service item to cart
- [ ] Add inventory item to cart
- [ ] Hold cart
- [ ] Retrieve hold
- [ ] Verify both items restore correctly
- [ ] Verify service badge shows
- [ ] Complete sale with service items

### Scenario 5: Customer in Hold
- [ ] Select customer
- [ ] Add items to cart
- [ ] Hold cart
- [ ] Verify customer name saved in hold
- [ ] Clear customer selection
- [ ] Retrieve hold
- [ ] Verify customer name shown in dialog
- [ ] Verify customer NOT auto-selected in cart

## Database Queries (Debugging)

### Check all active holds
```sql
SELECT 
  h.id, 
  h.hold_number, 
  h.user_id, 
  h.customer_name, 
  h.total_amount, 
  h.created_at,
  COUNT(i.id) as item_count
FROM pos_held_orders h
LEFT JOIN pos_held_order_items i ON i.hold_id = h.id
WHERE h.expires_at IS NULL OR h.expires_at > NOW()
GROUP BY h.id
ORDER BY h.created_at DESC;
```

### Check specific user's holds
```sql
SELECT * FROM pos_held_orders 
WHERE user_id = 'USER_UUID_HERE'
  AND (expires_at IS NULL OR expires_at > NOW());
```

### Check hold items
```sql
SELECT * FROM pos_held_order_items 
WHERE hold_id = 'HOLD_UUID_HERE'
ORDER BY line_order;
```

### Delete expired holds manually
```sql
DELETE FROM pos_held_orders 
WHERE expires_at IS NOT NULL 
  AND expires_at < NOW();
```

## File Structure

```
Backend:
├── SamplePOS.Server/
│   ├── db/migrations/002_create_pos_held_orders.sql
│   ├── src/modules/pos/
│   │   ├── holdRepository.ts      (Database operations)
│   │   ├── holdService.ts         (Business logic)
│   │   └── holdRoutes.ts          (API endpoints)
│   └── shared/zod/
│       └── hold-order.schema.ts   (Validation)

Frontend:
├── samplepos.client/
│   ├── src/
│   │   ├── pages/pos/
│   │   │   └── POSPage.tsx        (Hold/Resume logic)
│   │   ├── components/pos/
│   │   │   └── ResumeHoldDialog.tsx (Dialog UI)
│   │   ├── utils/
│   │   │   └── api.ts             (API client with auth)
│   │   └── hooks/
│   │       └── useAuth.ts         (Auth state)
```

## Related Documentation
- **API Communication**: `API_COMMUNICATION_GUIDE.md`
- **Barcode Service**: `BARCODE_SERVICE_ARCHITECTURE.md`
- **Timezone Strategy**: `TIMEZONE_STRATEGY.md`
- **Copilot Rules**: `COPILOT_IMPLEMENTATION_RULES.md`

## Migration Guide (If Changing Auth)

If you change authentication strategy (e.g., switch to session cookies):

1. **Update `utils/api.ts` interceptor** - Token injection logic
2. **Update `useAuth.ts`** - Token storage/retrieval
3. **Hold system still works** - Uses centralized `apiClient`
4. **No changes needed** in hold routes/service/repository

This is the power of centralization!

## Last Updated
November 23, 2025 - Initial documentation after Service Items + Hold Cart implementation
