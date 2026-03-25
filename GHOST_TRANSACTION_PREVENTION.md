# GHOST TRANSACTION PREVENTION - VALIDATION SUMMARY

**Date**: February 2026  
**Status**: ✅ IMPLEMENTED

---

## 🛡️ SINGLE SOURCE OF TRUTH ENFORCEMENT

### 1. **Invoice = Source of Truth for Customer Debt**
- All customer receivables tracked via `invoices.OutstandingBalance`
- `customers.balance` = SUM of all unpaid invoice balances (auto-synced via trigger)
- No direct balance manipulation allowed

---

## 🚫 GHOST TRANSACTION PREVENTION

### **Application Layer Validations**

#### A. Sales Creation (`salesService.ts`)
```typescript
✅ Line ~388: Enforces customer requirement for outstanding balance
   - Throws error if hasOutstandingBalance && !customerId
   - Message: "CUSTOMER REQUIRED: Cannot create sale with outstanding balance..."

✅ Line ~400: Validates customer exists in database
   - Queries customers table before sale creation
   - Throws error if customer not found
   - Message: "INVALID CUSTOMER: Customer ID does not exist..."

✅ Line ~411: Credit limit validation (warning)
   - Checks if new balance would exceed credit_limit
   - Logs warning (can be upgraded to error if needed)

✅ Line ~854: Invoice creation validation
   - Validates customer exists before creating invoice
   - Checks is_active status
   - Throws error if customer not found
   - Message: "GHOST INVOICE PREVENTION: Cannot create invoice for non-existent customer..."
```

#### B. Invoice Payments (`invoiceService.ts`)
```typescript
✅ Line ~444: Invoice existence validation
   - Throws error if invoice not found
   - Message: "GHOST PAYMENT PREVENTION: Invoice does not exist..."

✅ Line ~450: Customer validation
   - Validates customer linked to invoice still exists
   - Throws error if customer missing
   - Message: "GHOST CUSTOMER: Invoice is linked to non-existent customer..."

✅ Line ~461: Payment amount validation
   - Ensures amount > 0
   - Prevents overpayment (amount_paid > total_amount)
   - Message: "OVERPAYMENT PREVENTION: Payment would exceed invoice total..."
```

### **Database Layer Constraints**

#### C. Invoices Table (`pos_system.invoices`)
```sql
✅ NOT NULL constraint on "CustomerId"
   - Prevents invoices without customer linkage
   - Database-level enforcement

✅ CHECK: "OutstandingBalance" >= 0
   - Prevents negative balances

✅ CHECK: "AmountPaid" <= "TotalAmount"
   - Prevents overpayment at database level

✅ CHECK: "TotalAmount" > 0
   - Ensures valid invoice amounts
```

#### D. Invoice Payments Table (`pos_system.invoice_payments`)
```sql
✅ CHECK: amount > 0
   - Prevents zero or negative payment records
```

#### E. Trigger-Based Sync (`trg_sync_customer_balance_on_invoice`)
```sql
✅ Automatically recalculates customer.balance on invoice changes
   - Fires on INSERT, UPDATE, DELETE
   - Uses function: recalc_customer_balance_from_invoices()
   - Excludes 'Paid' and 'Cancelled' invoices
```

---

## 📊 VALIDATION FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────┐
│                    SALE WITH OUTSTANDING BALANCE             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │  Customer Selected?  │
                 └──────────────────────┘
                    │              │
                    NO             YES
                    │              │
                    ▼              ▼
            ┌──────────────┐  ┌────────────────┐
            │ THROW ERROR  │  │ Customer Exists?│
            │ "CUSTOMER    │  └────────────────┘
            │  REQUIRED"   │       │        │
            └──────────────┘       NO       YES
                                   │        │
                                   ▼        ▼
                           ┌──────────┐ ┌──────────────┐
                           │THROW     │ │ Create Sale  │
                           │ERROR     │ │ (CREDIT)     │
                           │"INVALID  │ └──────────────┘
                           │CUSTOMER" │        │
                           └──────────┘        ▼
                                      ┌────────────────┐
                                      │Create Invoice  │
                                      │(with CustomerId)│
                                      └────────────────┘
                                               │
                                               ▼
                                   ┌────────────────────────┐
                                   │Database Constraint:    │
                                   │CustomerId NOT NULL     │
                                   └────────────────────────┘
                                               │
                                               ▼
                                   ┌────────────────────────┐
                                   │Trigger Updates:        │
                                   │customers.balance       │
                                   └────────────────────────┘
```

---

## 🔒 GUARANTEES

| Protection | Method | Status |
|------------|--------|--------|
| No sale without customer (if outstanding balance) | Application Error | ✅ |
| No invoice without customer | DB NOT NULL + Application | ✅ |
| No payment to non-existent invoice | Application Error | ✅ |
| No payment for non-existent customer | Application Error | ✅ |
| No negative outstanding balance | DB CHECK Constraint | ✅ |
| No overpayment | Application + DB CHECK | ✅ |
| Customer balance = Invoice sum | DB Trigger (auto-sync) | ✅ |
| No orphaned receivables | Multi-layer validation | ✅ |

---

## 🧪 TEST SCENARIOS

### Should SUCCEED:
- ✅ Full cash payment (no customer needed)
- ✅ Credit sale with valid customer
- ✅ Partial payment with valid customer & invoice
- ✅ Payment up to invoice total

### Should FAIL:
- ❌ Credit sale without customer → "CUSTOMER REQUIRED"
- ❌ Sale with invalid customer ID → "INVALID CUSTOMER"
- ❌ Invoice creation with non-existent customer → "GHOST INVOICE PREVENTION"
- ❌ Payment to non-existent invoice → "GHOST PAYMENT PREVENTION"
- ❌ Payment exceeding invoice total → "OVERPAYMENT PREVENTION"
- ❌ Negative payment amount → DB constraint violation
- ❌ Invoice without CustomerId → DB NOT NULL violation

---

## 🔧 MAINTENANCE FUNCTIONS

### Recalculate All Customer Balances
```sql
SELECT * FROM recalc_all_customer_balances();
```
Use when data drift is suspected.

### Verify Data Integrity
```sql
-- Check for any inconsistencies
SELECT 
  c.name,
  c.balance as customer_balance,
  COALESCE(SUM(i."OutstandingBalance"), 0) as invoice_balance,
  c.balance - COALESCE(SUM(i."OutstandingBalance"), 0) as difference
FROM customers c
LEFT JOIN invoices i ON i."CustomerId" = c.id AND i."Status" NOT IN ('Paid', 'Cancelled')
GROUP BY c.id, c.name, c.balance
HAVING c.balance - COALESCE(SUM(i."OutstandingBalance"), 0) != 0;
```

---

## 📝 ERROR MESSAGES REFERENCE

| Error Message Prefix | Meaning | Action Required |
|---------------------|---------|-----------------|
| `CUSTOMER REQUIRED:` | Outstanding balance but no customer | Select customer before proceeding |
| `INVALID CUSTOMER:` | Customer ID not in database | Verify customer exists or select valid customer |
| `GHOST INVOICE PREVENTION:` | Attempting to create invoice for missing customer | Check customer data integrity |
| `GHOST PAYMENT PREVENTION:` | Payment to non-existent invoice | Verify invoice ID |
| `GHOST CUSTOMER:` | Invoice linked to deleted customer | Data corruption - needs investigation |
| `OVERPAYMENT PREVENTION:` | Payment exceeds invoice total | Reduce payment amount |

---

## ✅ DEPLOYMENT CHECKLIST

- [x] Application validations added to salesService.ts
- [x] Application validations added to invoiceService.ts
- [x] Database NOT NULL constraint on invoices.CustomerId
- [x] Database CHECK constraints for amounts
- [x] Database trigger for customer balance sync
- [x] Recalculation function for maintenance
- [x] All existing data validated and fixed

---

**Result**: System now has **multi-layer validation** to prevent ghost transactions at application, business logic, and database levels. Customer receivables are guaranteed to be tracked via invoices with proper linkage.

---

## 🔄 GL POSTING INTEGRITY (Updated March 2026)

### GL Posting: Application Layer (Single Source of Truth)

All GL posting is now handled by the application layer via `glEntryService.ts` → `AccountingCore.createJournalEntry()`. Database GL triggers have been **DISABLED** to prevent dual-posting discrepancies.

**Migration**: `shared/sql/250_disable_gl_posting_triggers.sql`

| Transaction Type | Application Service | GL Function | Status |
|-----------------|---------------------|-------------|--------|
| Sales | `salesService.ts` | `recordSaleToGL()` | ✅ App-layer |
| Invoice Payments | `invoiceService.ts` | `recordInvoicePaymentToGL()` | ✅ App-layer |
| Supplier Payments | `supplierPaymentService.ts` | `recordSupplierPaymentToGL()` | ✅ App-layer |
| Goods Receipts | `goodsReceiptService.ts` | `recordGoodsReceiptToGL()` | ✅ App-layer |
| Stock Movements | `stockMovementService.ts` | `recordStockMovementToGL()` | ✅ App-layer |
| Customer Payments | `paymentsService.ts` | `recordCustomerPaymentToGL()` | ✅ App-layer |
| Customer Deposits | `depositsService.ts` | `recordCustomerDepositToGL()` | ✅ App-layer |
| Expenses | `expenseService.ts` | `recordExpenseToGL()` | ✅ App-layer |

### Legacy GL Triggers (DISABLED — Do NOT Re-enable)

| Transaction Type | Trigger Name | Function | Status |
|-----------------|--------------|----------|--------|
| Sales | `trg_post_sale_to_ledger` | `fn_post_sale_to_ledger()` | ❌ Disabled |
| Invoice Payments | `trg_post_invoice_payment_to_ledger` | `fn_post_invoice_payment_to_ledger()` | ❌ Disabled |
| Supplier Payments | `trg_post_supplier_payment_to_ledger` | `fn_post_supplier_payment_to_ledger()` | ❌ Disabled |
| Stock Movements | `trg_post_stock_movement_to_ledger` | `fn_post_stock_movement_to_ledger()` | ❌ Disabled |

### Idempotency Protection

**Database Constraints:**
- `uq_ledger_transactions_reference` - UNIQUE on `(ReferenceType, ReferenceId)`
- `ledger_transactions_IdempotencyKey_key` - UNIQUE on `IdempotencyKey`

**Trigger-Level Checks:**
```sql
-- All GL triggers check before inserting:
IF EXISTS (SELECT 1 FROM ledger_transactions 
           WHERE "ReferenceType" = 'SALE' AND "ReferenceId" = NEW.id) THEN
    RAISE NOTICE 'Already posted - skipping duplicate';
    RETURN NEW;
END IF;
```

### Invoice Payment Handling

| Scenario | GL Action | Reason |
|----------|-----------|--------|
| CASH sale → invoice payment | Skip GL | Sale trigger already posted DR Cash, CR Revenue |
| CREDIT sale → invoice payment | Post GL | DR Cash, CR AR (reducing receivable) |
| Standalone invoice payment | Post GL | Normal AR collection flow |

### Recovery Functions

**`fn_recover_missing_gl_postings()`** - Finds and fixes missed postings:
```sql
SELECT * FROM fn_recover_missing_gl_postings();
```

### Integrity Monitoring View

```sql
SELECT * FROM v_transaction_integrity_status;

-- Expected Output (all OK):
--           check_name          | issue_count | status
-- ------------------------------+-------------+--------
--  Ghost Sales (no GL)          |           0 | OK
--  Ghost Invoice Payments       |           0 | OK
--  Unbalanced Transactions      |           0 | OK
--  Orphaned Ledger Entries      |           0 | OK
--  Sales Missing Stock Movement |           0 | OK
--  Customer Balance Mismatch    |           0 | OK
--  Supplier Balance Mismatch    |           0 | OK
```

### Related Migration
- `shared/sql/032_ghost_transaction_prevention.sql`

