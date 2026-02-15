# Data Loss Prevention Strategy

**Last Updated**: January 2025  
**Status**: IMPLEMENTED

## Overview

This document describes the data protection mechanisms implemented across the SamplePOS system to ensure **zero data loss** for all financial, transactional, and business-critical data.

## Core Principle

**NO HARD DELETES** for business-critical data. All "delete" operations use one of these soft-delete patterns:

1. **Status-based soft delete**: Set status to `CANCELLED`, `DELETED`, or `EXPIRED`
2. **Timestamp-based soft delete**: Set `deleted_at` to current timestamp
3. **Active flag soft delete**: Set `is_active = false`

---

## Protected Entities

### 1. Supplier Payments Module

**Tables**: `supplier_payments`, `supplier_invoices`, `supplier_payment_allocations`

| Operation | Protection Method | Implementation |
|-----------|-------------------|----------------|
| Delete Payment | `deleted_at` + Status='DELETED' | Validates no active allocations exist first |
| Delete Invoice | `deleted_at` + Status='DELETED' | Validates no active allocations exist first |
| Delete Allocation | `deleted_at` | Preserves allocation record, updates amounts |

**Key Queries**: All SELECT queries filter by `deleted_at IS NULL`

**File**: `src/modules/supplier-payments/supplierPaymentRepository.ts`

### 2. Users Module

**Table**: `users`

| Operation | Protection Method | Implementation |
|-----------|-------------------|----------------|
| Delete User | `is_active = false` | Soft delete preserves user record |
| Hard Delete | Only if no associated data | Explicit function, use with caution |

**File**: `src/modules/users/userRepository.ts`

### 3. Purchase Orders Module

**Tables**: `purchase_orders`, `purchase_order_items`

| Operation | Protection Method | Implementation |
|-----------|-------------------|----------------|
| Delete PO | Status = 'CANCELLED' | Only DRAFT status POs can be "deleted" |

**Business Rules**:
- POs with goods receipts cannot be deleted
- PO items are preserved when PO is cancelled
- Uses `CANCELLED` status from `purchase_order_status` enum

**File**: `src/modules/purchase-orders/purchaseOrderRepository.ts`

### 4. Quotations Module

**Tables**: `quotations`, `quotation_items`

| Operation | Protection Method | Implementation |
|-----------|-------------------|----------------|
| Delete Quotation | Status = 'CANCELLED' | Only DRAFT status can be "deleted" |

**Business Rules**:
- Items preserved with quotation
- Uses `CANCELLED` status from `quotation_status` enum
- Status history tracked automatically via trigger

**Files**: 
- `src/modules/quotations/quotationRepository.ts`
- `src/modules/quotations/quotationService.ts`

### 5. POS Held Orders Module

**Tables**: `pos_held_orders`, `pos_held_order_items`

| Operation | Protection Method | Implementation |
|-----------|-------------------|----------------|
| Resume Hold | Status = 'RESUMED', `resumed_at` timestamp | Preserves what was held |
| Expire Hold | Status = 'EXPIRED' | Cleanup job marks as expired |
| Cancel Hold | Status = 'CANCELLED' | Manual cancellation |

**Status Values**:
- `ACTIVE` - Available for resume
- `RESUMED` - Loaded into cart/converted to sale
- `EXPIRED` - Automatically cleaned up by job
- `CANCELLED` - Manually cancelled

**Key Queries**: All list/get queries filter by `status = 'ACTIVE'`

**File**: `src/modules/pos/holdRepository.ts`

### 6. Sales Module (Already Protected)

**Tables**: `sales`, `sale_items`, `sale_payments`

Sales cannot be deleted through the API - they can only be:
- Voided (creates a reversal)
- Cancelled (with reason)

**Note**: `deleteSalePayments()` exists only for transaction rollback during failed sale creation.

### 7. Customers Module (Already Protected)

**Table**: `customers`

Customers use `is_active = false` for deactivation, never hard delete.

### 8. Products Module (Already Protected)

**Tables**: `products`, `inventory_batches`

Products use `is_active = false` for deactivation, never hard delete.

---

## Database Schema Changes

### Added Columns

```sql
-- Supplier payments module
ALTER TABLE supplier_payments 
  ADD COLUMN deleted_at TIMESTAMPTZ;

ALTER TABLE supplier_invoices 
  ADD COLUMN deleted_at TIMESTAMPTZ;

ALTER TABLE supplier_payment_allocations 
  ADD COLUMN deleted_at TIMESTAMPTZ;

-- POS held orders
ALTER TABLE pos_held_orders 
  ADD COLUMN status VARCHAR(20) DEFAULT 'ACTIVE' NOT NULL,
  ADD COLUMN resumed_at TIMESTAMPTZ;
```

### Status Enums Already Existing

- `purchase_order_status`: DRAFT, PENDING, COMPLETED, **CANCELLED**
- `quotation_status`: DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED, CONVERTED, **CANCELLED**

---

## Query Patterns

### Correct Pattern for Soft-Deleted Records

```typescript
// For deleted_at pattern
const result = await pool.query(
  `SELECT * FROM supplier_payments 
   WHERE supplier_id = $1 AND deleted_at IS NULL`,
  [supplierId]
);

// For status pattern
const result = await pool.query(
  `SELECT * FROM quotations 
   WHERE customer_id = $1 AND status != 'CANCELLED'`,
  [customerId]
);

// For is_active pattern
const result = await pool.query(
  `SELECT * FROM customers 
   WHERE id = $1 AND is_active = true`,
  [customerId]
);
```

### Correct Pattern for Delete Operations

```typescript
// Soft delete with deleted_at
await client.query(
  `UPDATE supplier_payments 
   SET deleted_at = NOW(), "Status" = 'DELETED' 
   WHERE "Id" = $1`,
  [id]
);

// Soft delete with status
await client.query(
  `UPDATE quotations 
   SET status = 'CANCELLED', updated_at = NOW() 
   WHERE id = $1`,
  [id]
);
```

---

## Audit Trail Integration

All soft-deleted records can be:
1. **Queried for historical reporting** - Use queries without the soft-delete filter
2. **Restored if needed** - Set `deleted_at = NULL` or status back to previous value
3. **Audited** - Combined with `audit_log` table for full history

---

## Session Data (Exception)

The following can be hard-deleted as they are transient:
- `user_sessions` - Expired/inactive sessions (cleanup job)

---

## Validation Before Delete

Critical records must validate relationships before deletion:

```typescript
// Example: Check allocations before deleting payment
const allocationCheck = await client.query(
  `SELECT COUNT(*) FROM supplier_payment_allocations 
   WHERE "PaymentId" = $1 AND deleted_at IS NULL`,
  [id]
);
if (parseInt(allocationCheck.rows[0].count) > 0) {
  throw new Error('Cannot delete payment with active allocations');
}
```

---

## Pre-Commit Checklist

When adding DELETE functionality to any new module:

- [ ] Use soft delete pattern (deleted_at, status, or is_active)
- [ ] Update all SELECT queries to filter soft-deleted records
- [ ] Validate relationships before allowing delete
- [ ] Log the deletion for audit trail
- [ ] Document the pattern in this file
- [ ] Test that records are preserved in database after "delete"

---

## Recovery Procedures

### Restore a Soft-Deleted Record

```sql
-- For deleted_at pattern
UPDATE supplier_payments 
SET deleted_at = NULL, "Status" = 'COMPLETED' 
WHERE "Id" = 'uuid-here';

-- For status pattern
UPDATE quotations 
SET status = 'DRAFT', updated_at = NOW() 
WHERE id = 'uuid-here';

-- For is_active pattern
UPDATE customers 
SET is_active = true, updated_at = NOW() 
WHERE id = 'uuid-here';
```

---

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall system design
- [COPILOT_IMPLEMENTATION_RULES.md](./COPILOT_IMPLEMENTATION_RULES.md) - Development standards
- [AUDIT_TRAIL_IMPLEMENTATION_COMPLETE.md](./AUDIT_TRAIL_IMPLEMENTATION_COMPLETE.md) - Audit logging

---

**Maintainer**: System Architecture Team  
**Review Cycle**: Quarterly or when new modules are added
