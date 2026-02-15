# POS Hold and Service Items Documentation
**Date**: February 2026  
**Version**: 1.0  
**Features**: Service Products + Hold/Resume Cart

---

## Overview

This document describes two new POS features:
1. **Service Products** - Non-inventory items (no stock tracking)
2. **Hold/Resume Cart** - Save cart for later (Odoo POS-like)

Both features are production-ready and fully integrated with the existing POS system.

---

## Feature 1: Service Products

### What Are Service Products?

Service products are non-physical items that don't require inventory tracking:
- Consulting services
- Labor/installation fees
- Digital products
- Warranty extensions
- Delivery charges

### Product Types

| Type | Stock Tracking | Stock Movements | Use Case |
|------|---------------|----------------|----------|
| **inventory** | ✅ Yes | ✅ Yes | Physical goods (default) |
| **consumable** | ✅ Yes | ✅ Yes | Expensed items (office supplies) |
| **service** | ❌ No | ❌ No | Non-physical (labor, consulting) |

### Database Schema

```sql
-- products table
product_type VARCHAR(20) CHECK (product_type IN ('inventory','consumable','service'))
income_account_id UUID NULL REFERENCES accounts(id)
is_service BOOLEAN GENERATED ALWAYS AS (product_type = 'service') STORED
```

### Backend Behavior

**When Selling Service Items**:
- ✅ Sale/invoice record created
- ✅ Revenue recorded to `income_account_id`
- ✅ Audit trail logged
- ❌ NO stock movements created
- ❌ NO inventory validation
- ❌ NO FEFO batch deduction

**Mixed Carts (Service + Inventory)**:
```typescript
// Service items skip stock logic
const { inventoryItems, serviceItems } = separateSaleItems(items);

// Only inventory items processed by FEFO
for (const item of inventoryItems) {
  await deductFromBatches(item); // FEFO logic
}

// Service items inserted directly
for (const item of serviceItems) {
  await insertSaleItem(item); // No stock movement
}
```

### Frontend Display

**Service Badge**:
```tsx
import { ServiceBadge } from '@/components/pos/ServiceBadge';

<ServiceBadge /> // Shows "SERVICE" blue badge
```

**Service Info Banner**:
```tsx
import { ServiceInfoBanner } from '@/components/pos/ServiceInfoBanner';

<ServiceInfoBanner 
  serviceCount={2} 
  totalRevenue={50000} 
/>
// Shows: "2 service items in cart (no inventory deduction) • Revenue: UGX 50,000"
```

### API Integration

**Product Creation**:
```typescript
POST /api/products
{
  "name": "Consulting Service",
  "productType": "service", // NEW
  "incomeAccountId": "uuid-here", // Required for services
  "basePrice": 100000,
  "costPrice": 0, // Services typically have 0 cost
  "taxable": true,
  "trackExpiry": false // Services never expire
}
```

**Sale Creation (Mixed Cart)**:
```typescript
POST /api/sales
{
  "lineItems": [
    {
      "productId": "prod-1",
      "productType": "inventory", // Stock deduction happens
      "quantity": 5,
      "unitPrice": 10000
    },
    {
      "productId": "prod-2",
      "productType": "service", // NO stock deduction
      "quantity": 1,
      "unitPrice": 50000
    }
  ]
}
```

### Accounting Impact

**Service Revenue Recognition**:
```
DR: Customer/Cash (totalAmount)
CR: Service Revenue (incomeAccountId) - No COGS entry
```

**Inventory Sales** (for comparison):
```
DR: Customer/Cash (totalAmount)
CR: Sales Revenue (totalAmount)
DR: COGS (costPrice * quantity)
CR: Inventory Asset (costPrice * quantity)
```

### Configuration Requirements

1. **Create Income Account** (one-time setup):
```sql
INSERT INTO accounts (name, code, account_type, parent_id)
VALUES ('Service Revenue', '4100', 'REVENUE', NULL);
```

2. **Assign to Service Products**:
- In product form, select income account
- Required for all service products
- Validation error if missing

### Testing Service Products

```powershell
# Test service product creation
POST /api/products
{
  "name": "IT Support - 1 Hour",
  "productType": "service",
  "basePrice": 50000,
  "costPrice": 0,
  "incomeAccountId": "acc-uuid"
}

# Test mixed sale (service + inventory)
POST /api/sales
{
  "lineItems": [
    { "productId": "inventory-product-id", "quantity": 3 },
    { "productId": "service-product-id", "quantity": 1 }
  ]
}

# Verify: Stock movement only for inventory item
SELECT * FROM stock_movements WHERE sale_id = 'sale-uuid';
-- Should show movement ONLY for inventory product

# Verify: Sale items include both types
SELECT * FROM sale_items WHERE sale_id = 'sale-uuid';
-- Should show both items
```

---

## Feature 2: Hold/Resume Cart

### What Is Hold Cart?

Save current POS cart for later without creating a sale or invoice:
- Customer needs to get more money
- Manager approval pending
- Multi-tasking (serve another customer first)
- End of shift (resume tomorrow)

**Similar to**:
- Odoo POS "Orders" button
- QuickBooks POS "Park Sale"
- Square POS "Save for Later"

### Business Rules

| Action | Effect |
|--------|--------|
| **Put on Hold** | Save cart state (NO sale, NO stock movement) |
| **Resume** | Load cart exactly as it was + delete hold |
| **Expiration** | Auto-delete after 24 hours (default) |
| **Ownership** | User can only see their own holds (or terminal's) |
| **Multi-Till** | Holds tied to terminal ID (optional) |

### Database Schema

**Tables**:
```sql
pos_held_orders
├── id (UUID)
├── hold_number (HOLD-YYYY-####) -- Auto-generated
├── terminal_id (VARCHAR) -- Optional
├── user_id (UUID) -- Required
├── customer_id (UUID) -- Optional
├── subtotal, tax_amount, discount_amount, total_amount
├── hold_reason (VARCHAR) -- Optional
├── notes (TEXT) -- Optional
├── metadata (JSONB) -- Draft payment lines, discounts, etc.
├── created_at (TIMESTAMPTZ)
├── expires_at (TIMESTAMPTZ) -- Default: 24 hours

pos_held_order_items
├── id (UUID)
├── hold_id (UUID FK)
├── product_id, product_name, product_sku
├── product_type (inventory/consumable/service)
├── quantity, unit_price, cost_price
├── tax info, discount info
├── uom info (uom_id, conversion_factor)
├── metadata (JSONB)
├── line_order (INTEGER)
```

**Hold Number Generation**:
```sql
-- Auto-generated sequence
HOLD-2025-0001
HOLD-2025-0002
...
```

### Backend API

#### **1. Create Hold (Put on Hold)**
```http
POST /api/pos/hold
Authorization: Bearer <token>

{
  "terminalId": "POS-01", // Optional
  "customerId": "cust-uuid", // Optional
  "customerName": "John Doe", // Optional
  "subtotal": 95000,
  "taxAmount": 17100,
  "discountAmount": 0,
  "totalAmount": 112100,
  "holdReason": "Customer needs to get more money", // Optional
  "notes": "Call when ready", // Optional
  "metadata": { // Optional - draft state
    "draftPaymentLines": [
      { "method": "CASH", "amount": 50000 }
    ],
    "cartDiscount": { "type": "PERCENTAGE", "value": 10 }
  },
  "items": [
    {
      "productId": "prod-uuid",
      "productName": "Product A",
      "productType": "inventory",
      "quantity": 2,
      "unitPrice": 50000,
      "costPrice": 30000,
      "subtotal": 100000,
      "isTaxable": true,
      "taxRate": 18,
      "taxAmount": 18000,
      "lineOrder": 0
    }
  ],
  "expiresAt": "2025-11-24T14:30:00Z" // Optional (default: 24h)
}

Response:
{
  "success": true,
  "data": {
    "id": "hold-uuid",
    "holdNumber": "HOLD-2025-0001",
    "createdAt": "2025-11-23T14:30:00Z",
    "expiresAt": "2025-11-24T14:30:00Z",
    "items": [...]
  },
  "message": "Cart held as HOLD-2025-0001"
}
```

#### **2. List Holds**
```http
GET /api/pos/hold?terminalId=POS-01
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": [
    {
      "id": "hold-uuid",
      "holdNumber": "HOLD-2025-0001",
      "customerName": "John Doe",
      "totalAmount": 112100,
      "itemCount": 3,
      "createdAt": "2025-11-23T14:30:00Z",
      "expiresAt": "2025-11-24T14:30:00Z",
      "holdReason": "Customer needs to get more money"
    }
  ]
}
```

#### **3. Get Hold Details (Resume)**
```http
GET /api/pos/hold/:id
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "id": "hold-uuid",
    "holdNumber": "HOLD-2025-0001",
    "customerId": "cust-uuid",
    "customerName": "John Doe",
    "subtotal": 95000,
    "taxAmount": 17100,
    "totalAmount": 112100,
    "metadata": { "draftPaymentLines": [...] },
    "items": [
      {
        "productId": "prod-uuid",
        "productName": "Product A",
        "quantity": 2,
        "unitPrice": 50000,
        ...
      }
    ]
  }
}
```

#### **4. Delete Hold (After Resume)**
```http
DELETE /api/pos/hold/:id
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Hold order deleted"
}
```

### Frontend Integration

#### **HoldCartDialog Component**
```tsx
import { HoldCartDialog } from '@/components/pos/HoldCartDialog';

const [showHoldDialog, setShowHoldDialog] = useState(false);

<HoldCartDialog
  isOpen={showHoldDialog}
  onClose={() => setShowHoldDialog(false)}
  onConfirm={async (reason, notes) => {
    // Build hold data from current cart
    const holdData = {
      items: cart.items,
      subtotal: cart.subtotal,
      totalAmount: cart.totalAmount,
      holdReason: reason,
      notes: notes,
    };
    
    // API call
    await api.post('/api/pos/hold', holdData);
    
    // Clear cart
    clearCart();
    toast.success('Cart held successfully');
  }}
  itemCount={cart.items.length}
  totalAmount={cart.totalAmount}
/>
```

#### **ResumeHoldDialog Component**
```tsx
import { ResumeHoldDialog } from '@/components/pos/ResumeHoldDialog';

const [showResumeDialog, setShowResumeDialog] = useState(false);

<ResumeHoldDialog
  isOpen={showResumeDialog}
  onClose={() => setShowResumeDialog(false)}
  onResume={async (holdId) => {
    // Load hold data
    const response = await api.get(`/api/pos/hold/${holdId}`);
    const hold = response.data.data;
    
    // Restore cart state
    setCart({
      items: hold.items,
      customer: hold.customerId ? { id: hold.customerId, name: hold.customerName } : null,
      subtotal: hold.subtotal,
      totalAmount: hold.totalAmount,
    });
    
    // Delete hold
    await api.delete(`/api/pos/hold/${holdId}`);
    
    toast.success(`Resumed ${hold.holdNumber}`);
  }}
/>
```

#### **POS Page Buttons**
```tsx
// In POSPage.tsx
<div className="flex gap-2">
  <Button 
    variant="outline" 
    onClick={() => setShowHoldDialog(true)}
    disabled={cart.items.length === 0}
  >
    <Clock className="h-4 w-4 mr-2" />
    Put on Hold
  </Button>
  
  <Button 
    variant="outline" 
    onClick={() => setShowResumeDialog(true)}
  >
    <Package className="h-4 w-4 mr-2" />
    Resume Hold
  </Button>
</div>
```

### Offline Behavior

**When Offline**:
1. **Put on Hold**: Save to `localStorage` with `pending_sync` flag
2. **Resume**: Load from `localStorage`
3. **When Online**: Sync pending holds to backend

**LocalStorage Keys**:
```typescript
'pos_pending_holds' // Array of holds waiting to sync
'pos_hold_queue'   // Sync queue
```

### Multi-Till Support

**Terminal ID Usage**:
- Set `terminalId` when creating hold
- Filter holds by terminal: `GET /api/pos/hold?terminalId=POS-01`
- Each terminal sees only its holds (unless admin)

**Admin Override**:
- Admins can see all holds (all terminals)
- Managers can see holds for their assigned terminals

### Hold Expiration

**Default**: 24 hours from creation

**Custom Expiration**:
```typescript
// 48 hours
expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)

// No expiration
expiresAt: null
```

**Cleanup Job** (run daily):
```typescript
// Delete expired holds
await holdService.cleanupExpiredHolds(pool);
```

### Testing Hold/Resume

```powershell
# 1. Put cart on hold
POST /api/pos/hold
{
  "items": [...],
  "totalAmount": 100000,
  "holdReason": "Test hold"
}
# Response: HOLD-2025-0001

# 2. List holds
GET /api/pos/hold
# Should show HOLD-2025-0001

# 3. Resume hold
GET /api/pos/hold/{id}
# Returns full cart data

# 4. Delete hold (after loading into cart)
DELETE /api/pos/hold/{id}
# Hold removed

# 5. Verify no stock movements
SELECT * FROM stock_movements WHERE reference LIKE '%HOLD%';
-- Should be EMPTY (holds don't affect stock)
```

---

## Integration Points

### With Existing Features

| Feature | Integration |
|---------|-------------|
| **MUoM** | Hold preserves UoM selection (uomId, conversion_factor) |
| **Customer Credit** | Hold preserves customer linkage |
| **Discounts** | Hold stores item + cart discounts in metadata |
| **Split Payment** | Hold stores draft payment lines in metadata |
| **Barcode Scanner** | Works normally - items added to cart before hold |
| **Offline Mode** | Holds sync when connection restored |
| **Multi-Till** | Holds filtered by terminalId |

### With Service Products

**Hold Can Contain**:
- ✅ Inventory items
- ✅ Service items
- ✅ Mixed cart (both types)

**Resume Behavior**:
- Service items load normally
- NO stock validation happens (service = no stock)
- Inventory items check stock availability on sale (not on hold)

---

## Security & Permissions

### Hold Cart
- **Who Can Hold**: Any authenticated POS user (CASHIER, MANAGER, ADMIN)
- **Validation**: User ID from JWT token (not from request body)

### Resume/Delete Hold
- **Ownership**: Users can only resume/delete their own holds
- **Exception**: Admins can resume/delete any hold
- **Terminal Filter**: Optional - restrict to terminal ID

### Service Products
- **Create Service**: ADMIN, MANAGER (product management permission)
- **Sell Service**: Any POS user (same as inventory products)
- **Account Configuration**: ADMIN only (accounting setup)

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "At least one item required" | Empty cart | Add items before holding |
| "Hold order not found" | Invalid ID or expired | Check hold list |
| "Hold order has expired" | Past 24 hours | Create new sale manually |
| "Forbidden - not your hold order" | Different user | Admin override needed |
| "Service products missing income account" | Account not configured | Set income_account_id |

### Validation

**Backend (Zod)**:
```typescript
CreateHoldOrderSchema.parse(input);
// Throws ZodError if invalid
```

**Frontend**:
```typescript
if (cart.items.length === 0) {
  toast.error('Cannot hold empty cart');
  return;
}
```

---

## Performance Considerations

### Database Indexes

**Holds**:
```sql
idx_pos_held_orders_user_id
idx_pos_held_orders_terminal_id
idx_pos_held_orders_created_at
idx_pos_held_orders_expires_at
idx_pos_held_order_items_hold_id
```

**Service Products**:
```sql
idx_products_product_type
idx_products_is_service
```

### Query Optimization

**List Holds**:
```sql
-- Optimized: Single query with JOIN
SELECT h.*, COUNT(i.id) as item_count
FROM pos_held_orders h
LEFT JOIN pos_held_order_items i ON i.hold_id = h.id
WHERE h.user_id = $1 AND (h.expires_at IS NULL OR h.expires_at > NOW())
GROUP BY h.id
ORDER BY h.created_at DESC;
```

**Get Hold with Items**:
```sql
-- Two queries: Hold + Items
-- Better than JOIN for large item lists
```

---

## Maintenance

### Daily Cleanup Job

```typescript
// server/src/jobs/cleanupExpiredHolds.ts
import { pool } from '../database';
import { holdService } from '../modules/pos/holdService';

export async function cleanupExpiredHolds() {
  const count = await holdService.cleanupExpiredHolds(pool);
  console.log(`Deleted ${count} expired holds`);
}

// Run daily at 3 AM
cron.schedule('0 3 * * *', cleanupExpiredHolds);
```

### Monitoring

**Metrics to Track**:
- Hold creation rate
- Average hold duration
- Resume vs. expiration ratio
- Service product sales revenue
- Mixed cart frequency (service + inventory)

---

## Troubleshooting

### Hold Not Showing in List

**Check**:
1. User ID matches (not another user's hold)
2. Not expired (< 24 hours)
3. Terminal ID filter (if using multi-till)

**Debug**:
```sql
SELECT * FROM pos_held_orders WHERE user_id = 'user-uuid';
```

### Service Product Stock Movement Created

**Check**:
1. Product type is 'service' (not 'inventory')
2. Backend logic uses `isService()` check
3. No manual stock movements inserted

**Debug**:
```sql
SELECT sm.*, p.product_type
FROM stock_movements sm
JOIN products p ON sm.product_id = p.id
WHERE p.product_type = 'service';
-- Should be EMPTY
```

### Hold Resume Fails

**Check**:
1. Hold still exists (not deleted)
2. Not expired
3. User has permission
4. Products still active

**Debug**:
```sql
SELECT * FROM pos_held_orders WHERE id = 'hold-uuid';
SELECT * FROM pos_held_order_items WHERE hold_id = 'hold-uuid';
```

---

## Future Enhancements

### Planned Features

1. **Hold Transfer**: Transfer hold to another user/terminal
2. **Hold Notifications**: Alert when hold about to expire
3. **Hold History**: View deleted/expired holds
4. **Partial Resume**: Load only some items from hold
5. **Hold Templates**: Save common carts as templates
6. **Service Scheduling**: Book service appointments from POS
7. **Recurring Services**: Subscription-based service products

---

## Appendices

### A. Migration Scripts

Run in order:
1. `001_add_product_type_and_service_flags.sql`
2. `002_create_pos_held_orders.sql`

### B. API Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/pos/hold` | Put cart on hold |
| GET | `/api/pos/hold` | List user's holds |
| GET | `/api/pos/hold/:id` | Get hold details |
| DELETE | `/api/pos/hold/:id` | Delete hold |

### C. File Structure

```
SamplePOS/
├── SamplePOS.Server/
│   ├── db/migrations/
│   │   ├── 001_add_product_type_and_service_flags.sql
│   │   └── 002_create_pos_held_orders.sql
│   └── src/modules/
│       ├── products/
│       │   ├── product.utils.ts
│       │   └── product.utils.test.ts
│       ├── sales/
│       │   ├── serviceItemHandler.ts
│       │   └── serviceItemHandler.test.ts
│       └── pos/
│           ├── holdRepository.ts
│           ├── holdService.ts
│           └── holdRoutes.ts
├── samplepos.client/src/components/pos/
│   ├── ServiceBadge.tsx
│   ├── ServiceInfoBanner.tsx
│   ├── HoldCartDialog.tsx
│   └── ResumeHoldDialog.tsx
└── shared/
    ├── zod/
    │   ├── product.schema.ts
    │   └── hold-order.schema.ts
    └── types/
        └── product.type.ts
```

---

**End of Documentation**

For questions or issues, refer to:
- Root README.md
- COPILOT_INSTRUCTIONS.md
- POS_SYSTEM_ASSESSMENT.md
