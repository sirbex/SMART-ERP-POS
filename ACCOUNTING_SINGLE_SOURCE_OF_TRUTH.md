# Accounting Module - Single Source of Truth

**Status**: ENFORCED  
**Last Updated**: February 2026

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                    BUSINESS TRANSACTIONS                             │
│   (Sales, Goods Receipts, Payments, Expenses, Invoices)             │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      SERVICE LAYER                                    │
│   posService, goodsReceiptService, paymentService, expenseService    │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│              glEntryService (Convenience Wrappers)                   │
│   recordSaleToGL(), recordGoodsReceiptToGL(), recordExpenseToGL()    │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│        AccountingCore.createJournalEntry()  ← SINGLE SOT             │
│   - Double-entry validation                                          │
│   - Transaction integrity                                            │
│   - Decimal.js precision                                             │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│              DATABASE TABLES                                          │
│   ledger_transactions  ←  Primary GL transactions                    │
│   ledger_entries       ←  Individual debit/credit entries            │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│   trg_sync_account_balance_on_ledger (PostgreSQL Trigger)           │
│   - Automatically updates accounts.CurrentBalance                    │
└──────────────────────────────────────────────────────────────────────┘
```

## Rules

### ✅ ALLOWED - Use These Methods

| Method | When to Use |
|--------|-------------|
| `accountingCore.createJournalEntry()` | Direct GL posting with full control |
| `glEntryService.recordSaleToGL()` | After completing a sale |
| `glEntryService.recordGoodsReceiptToGL()` | After finalizing goods receipt |
| `glEntryService.recordExpenseToGL()` | After recording an expense |
| `glEntryService.recordPaymentToGL()` | After recording customer payment |
| `glEntryService.recordSupplierPaymentToGL()` | After recording supplier payment |

### ❌ FORBIDDEN - Do NOT Use These

| Method | Why Forbidden |
|--------|---------------|
| `accountingRepository.createJournalEntry()` | Uses deprecated `journal_entries` table |
| `accountingRepository.createLedgerTransaction()` | Bypasses validation |
| `journalEntryService.createJournalEntry()` | Uses separate `manual_journal_entries` table |
| Direct INSERT to `ledger_*` tables | Bypasses all validation |
| PostgreSQL GL posting triggers | All disabled - use service layer |

### Disabled Triggers (Do NOT Re-enable)

```sql
-- These triggers are DISABLED because glEntryService handles GL posting:
trg_post_sale_to_ledger           -- sales table
trg_post_sale_void_to_ledger      -- sales table  
trg_post_goods_receipt_to_ledger  -- goods_receipts table
trg_post_expense_to_ledger        -- expenses table
trg_post_customer_payment_to_ledger -- customer_payments table
trg_post_invoice_payment_to_ledger  -- invoice_payments table
```

### Active Triggers (Keep Enabled)

```sql
-- These triggers MUST stay enabled:
trg_sync_account_balance_on_ledger     -- Auto-updates account balances
trg_enforce_period_ledger_entries      -- Period control
trg_enforce_period_ledger_transactions -- Period control
tr_prevent_posted_modification         -- Immutability
```

## Database Tables

### Primary GL Tables (USE THESE)

| Table | Purpose |
|-------|---------|
| `ledger_transactions` | GL transaction headers |
| `ledger_entries` | Individual debit/credit lines |
| `accounts` | Chart of accounts with balances |

### Deprecated Tables (DO NOT USE)

| Table | Status |
|-------|--------|
| `journal_entries` | DEPRECATED - migrate to ledger_transactions |
| `journal_entry_lines` | DEPRECATED - migrate to ledger_entries |
| `manual_journal_entries` | DEPRECATED - use accountingCore |
| `manual_journal_entry_lines` | DEPRECATED |

## Column Reference

The `ledger_entries` table has TWO foreign key columns for historical reasons:

| Column | Status | Notes |
|--------|--------|-------|
| `TransactionId` | PRIMARY | Use this for new code |
| `LedgerTransactionId` | LEGACY | Kept for backwards compatibility |

Both columns reference `ledger_transactions.Id`. New code should use `TransactionId`.

## Example: Recording a Sale to GL

```typescript
// ✅ CORRECT: Use glEntryService
import { glEntryService } from '../services/glEntryService';

await glEntryService.recordSaleToGL(pool, {
  saleId: sale.id,
  saleNumber: sale.saleNumber,
  saleDate: sale.saleDate,
  totalAmount: sale.totalAmount,
  totalCost: sale.totalCost,
  paymentMethod: sale.paymentMethod,
  customerId: sale.customerId
});

// ❌ WRONG: Direct repository call
// await accountingRepository.createLedgerTransaction(...);

// ❌ WRONG: Direct SQL
// await pool.query('INSERT INTO ledger_transactions...');
```

## Maintenance

### Re-running Consolidation

If triggers need to be re-disabled after a migration:

```powershell
psql -U postgres -d pos_system -f "shared/sql/consolidate_accounting_sot.sql"
```

### Verifying Trigger Status

```sql
SELECT tgname, 
       CASE tgenabled WHEN 'D' THEN 'DISABLED' ELSE 'ENABLED' END as status
FROM pg_trigger 
WHERE tgname LIKE '%ledger%' OR tgname LIKE '%post%';
```

## Compliance Checklist

Before merging any accounting-related code:

- [ ] Uses `accountingCore` or `glEntryService` for GL posting
- [ ] Does NOT directly insert into ledger tables
- [ ] Does NOT use deprecated journal_entries tables
- [ ] Does NOT re-enable disabled triggers
- [ ] All amounts use Decimal.js for precision
- [ ] Double-entry is balanced (debits = credits)
