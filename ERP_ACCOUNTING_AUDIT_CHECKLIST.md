# ERP Accounting & Banking Audit Checklist

**Last Verified**: December 29, 2025  
**Status**: ✅ PASSED - All checks verified

> This checklist must be consulted before ANY changes to accounting, banking, or reporting modules.

---

## 🛡️ MANDATORY PRE-CHANGE VERIFICATION

Before modifying accounting, banking, or reporting code, verify:

### 1. Single Source of Truth

| Check | Location | What to Verify |
|-------|----------|----------------|
| GL Operations | `accountingCore.ts` | All journal entries go through `AccountingCore.createJournalEntry()` |
| Bank Balances | `v_bank_account_balances` view | Balance derived from GL, NOT stored in `current_balance` column |
| P&L Reports | `fn_get_profit_loss*` functions | All P&L uses database functions, no frontend calculations |
| Account Balances | `vw_account_balances` view | Balances computed from `ledger_entries`, not stored |

### 2. No Duplicate GL Posting

| Entity | Posting Mechanism | DO NOT Also Call |
|--------|-------------------|------------------|
| Sales | `trg_post_sale_to_ledger` trigger | `glEntryService.recordSaleToGL()` |
| Goods Receipts | `trg_post_goods_receipt_to_ledger` trigger | Any manual GL posting |
| Invoices | `trg_post_customer_invoice_to_ledger` trigger | Any manual GL posting |
| Expenses | `trg_post_expense_to_ledger` trigger | Any manual GL posting |
| Bank Transactions | `BankingService` → `AccountingCore` | No trigger (service handles) |

### 3. Double-Entry Integrity

```sql
-- Verify all transactions balance (should return 0 rows)
SELECT lt."Id", lt."TransactionNumber", 
       SUM(le."DebitAmount") as debits, 
       SUM(le."CreditAmount") as credits
FROM ledger_transactions lt
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
WHERE lt."Status" = 'POSTED'
GROUP BY lt."Id", lt."TransactionNumber"
HAVING ABS(SUM(le."DebitAmount") - SUM(le."CreditAmount")) > 0.001;
```

### 4. Entity-GL Alignment

```sql
-- Sales vs GL entries (counts should match)
SELECT 'Completed Sales' as entity, COUNT(DISTINCT id) FROM sales WHERE status = 'COMPLETED'
UNION ALL
SELECT 'Sale GL Entries', COUNT(*) FROM ledger_transactions WHERE "ReferenceType" = 'SALE';

-- Bank transactions vs GL entries (counts should match for service-created txns)
SELECT 'Bank Txns', COUNT(*) FROM bank_transactions WHERE gl_transaction_id IS NOT NULL AND is_reversed = FALSE
UNION ALL
SELECT 'Bank GL Entries', COUNT(*) FROM ledger_transactions WHERE "ReferenceType" IN ('BANK_TXN', 'BANK_TRANSFER');
```

---

## 📋 ARCHITECTURE RULES (DO NOT VIOLATE)

### GL Posting Hierarchy

```
Trigger-Based (Automatic):          Service-Based (Manual):
├── Sales                           ├── Bank Transactions
├── Goods Receipts                  ├── Bank Transfers
├── Customer Invoices               ├── Opening Balances
├── Invoice Payments                └── Manual Journal Entries
├── Customer Payments
├── Supplier Invoices
├── Supplier Payments
└── Expenses
```

### Balance Derivation (NEVER Store Computed Balances)

| Balance Type | Derived From | View/Function |
|--------------|--------------|---------------|
| Bank Account Balance | GL ledger_entries | `v_bank_account_balances` |
| Customer AR Balance | ledger_entries for account 1200 | Calculated at query time |
| Supplier AP Balance | ledger_entries for account 2100 | Calculated at query time |
| Account Balance | SUM(debits) - SUM(credits) | `vw_account_balances` |

### Date Filtering Consistency

All reports MUST filter on:
- `ledger_transactions."TransactionDate"` for GL-based reports
- `bank_transactions.transaction_date` for banking reports
- `sales.sale_date` for sales reports

**NEVER filter on `created_at` for business date ranges** (use only for audit/sorting).

---

## 🔍 VERIFICATION QUERIES

### Bank-GL Reconciliation

```sql
-- Bank account balances should match GL
SELECT 
    ba.name,
    ba.current_balance as stored_balance,
    COALESCE((
        SELECT SUM(le."DebitAmount") - SUM(le."CreditAmount")
        FROM ledger_entries le
        JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
        WHERE le."AccountId" = ba.gl_account_id AND lt."Status" = 'POSTED'
    ), 0) as gl_balance,
    CASE WHEN ba.current_balance = COALESCE((
        SELECT SUM(le."DebitAmount") - SUM(le."CreditAmount")
        FROM ledger_entries le
        JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
        WHERE le."AccountId" = ba.gl_account_id AND lt."Status" = 'POSTED'
    ), 0) THEN '✅ MATCH' ELSE '❌ MISMATCH' END as status
FROM bank_accounts ba;
```

### P&L Reconciliation

```sql
-- P&L totals should match Trial Balance movements
SELECT 
    'Revenue' as category,
    SUM(CASE WHEN "AccountCode" LIKE '4%' THEN "CreditAmount" - "DebitAmount" ELSE 0 END) as amount
FROM ledger_entries le
JOIN accounts a ON a."Id" = le."AccountId"
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
WHERE lt."TransactionDate" BETWEEN '2025-01-01' AND '2025-12-31'
  AND lt."Status" = 'POSTED'
UNION ALL
SELECT 'COGS', SUM(CASE WHEN "AccountCode" LIKE '5%' THEN "DebitAmount" - "CreditAmount" ELSE 0 END)
FROM ledger_entries le
JOIN accounts a ON a."Id" = le."AccountId"
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
WHERE lt."TransactionDate" BETWEEN '2025-01-01' AND '2025-12-31'
  AND lt."Status" = 'POSTED';
```

---

## 📁 KEY FILES REFERENCE

| Component | File | Purpose |
|-----------|------|---------|
| **AccountingCore** | `src/services/accountingCore.ts` | Single source of truth for GL operations |
| **GL Entry Service** | `src/services/glEntryService.ts` | Business transaction → GL entry translation |
| **Banking Service** | `src/services/bankingService.ts` | Bank operations with GL integration |
| **P&L Service** | `src/services/profitLossReportService.ts` | P&L report generation |
| **Reports Repository** | `src/modules/reports/reportsRepository.ts` | All report queries |
| **Banking Types** | `shared/types/banking.ts` | Type definitions + normalization |

---

## ⚠️ COMMON MISTAKES TO AVOID

1. **DON'T** call `glEntryService.recordSaleToGL()` after creating a sale - trigger handles it
2. **DON'T** store computed balances - always derive from GL
3. **DON'T** create new P&L calculation logic - use existing `fn_get_profit_loss*` functions
4. **DON'T** filter reports by `created_at` when user expects business date
5. **DON'T** use `new Date(dateField).toISOString()` on DATE columns - causes timezone shift
6. **DON'T** create duplicate bank transaction entries - check `idempotencyKey`
7. **DON'T** bypass `AccountingCore` for any GL operations
8. **DON'T** modify POSTED transactions - use reversals only
9. **DON'T** swallow errors in catch blocks for GL operations - always rethrow
10. **DON'T** use `pool.query` for operations that should be transactional - use `client.query`

---

## 🚨 SILENT FAILURE PREVENTION (Patched 2025-12-29)

### Fixed Issues

| Issue | Fix | Migration |
|-------|-----|-----------|
| `glEntryService` swallowed GL errors | Now throws on failure | Code change |
| `salesRepository.updateCostLayerQuantity` outside transaction | Accepts `PoolClient` | Code change |
| NULL `IdempotencyKey` on POSTED txns | CHECK constraint + backfill | [2025-12-29_add_integrity_constraints.sql](shared/sql/2025-12-29_add_integrity_constraints.sql) |
| NULL `LedgerTransactionId` in entries | NOT NULL constraint | Migration |
| NULL amounts in ledger_entries | NOT NULL + DEFAULT 0 | Migration |

### Required Constraints (Run Migration)

```sql
-- Run this migration to add constraints:
-- shared/sql/2025-12-29_add_integrity_constraints.sql
```

### Anti-Patterns to Avoid

```typescript
// ❌ WRONG: Swallowing errors
} catch (error) {
  logger.error('Failed', { error });
  // Don't throw - silent failure!
}

// ✅ CORRECT: Log and rethrow
} catch (error) {
  logger.error('Failed', { error });
  throw error; // Bubble up for rollback
}

// ❌ WRONG: Using pool outside transaction
await pool.query('UPDATE cost_layers SET ...');

// ✅ CORRECT: Use client within transaction
await client.query('UPDATE cost_layers SET ...');
```

---

## ✅ POST-CHANGE VERIFICATION

After ANY accounting/banking/reporting change:

1. Run double-entry check (should return 0 rows)
2. Verify entity-GL alignment counts match
3. Check bank-GL reconciliation (all should show MATCH)
4. Test P&L report for a known period
5. Verify date filtering works correctly in UI

---

## �️ ADVERSARIAL SCENARIO PROTECTION (Level 4 Verified)

### Partial Payments
| Protection | Location | How It Works |
|------------|----------|--------------|
| Split Payment Lines | `salesService.ts` | Allows mixed payment methods (Cash + Credit) |
| AR for Unpaid Portion | `glEntryService.ts` | Debits AR only for unpaid amount |
| Invoice Tracking | `invoiceRepository.ts` | `invoice_payments` table tracks each payment |
| Auto Status Update | `recalcInvoice()` | Sets Paid/PartiallyPaid/Unpaid based on payments |

### Reversals (Never Delete, Always Reverse)
| Protection | Location | How It Works |
|------------|----------|--------------|
| Contra Entries | `accountingCore.ts:reverseTransaction()` | Swaps debits/credits for mirror entry |
| Status Marking | `ledger_transactions.Status` | Original marked `REVERSED`, links to reversal |
| Reversal Idempotency | `idempotencyKey: REV-${transactionId}` | Prevents duplicate reversals |
| Bank Reversal | `bankingService.ts:reverseTransaction()` | Creates offsetting bank transaction |

### Re-Posting Prevention
| Protection | Location | How It Works |
|------------|----------|--------------|
| Status Guard (Sales) | `fn_post_sale_to_ledger()` | `IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED'` |
| Status Guard (GR) | `fn_post_goods_receipt_to_ledger()` | `IF NEW.status = 'COMPLETED' AND OLD.status = 'DRAFT'` |
| Status Guard (Invoices) | All posting triggers | Only fires on first COMPLETED transition |

### Duplicate Submission (Idempotency)
| Protection | Location | How It Works |
|------------|----------|--------------|
| Idempotency Check | `accountingCore.ts:checkIdempotencyKey()` | Returns existing transaction if key exists |
| Key Uniqueness | `ledger_transactions.IdempotencyKey` | UNIQUE constraint in database |
| Deterministic Keys | All callers | Format: `SALE-${saleId}`, `BANK-${txnId}`, `REV-${id}` |
| Error Handling | `IdempotencyConflictError` | Clear error if conflict detected |

### Concurrent Write Protection
| Protection | Location | How It Works |
|------------|----------|--------------|
| Transaction Wrapping | All services | `BEGIN/COMMIT/ROLLBACK` around critical ops |
| Row-Level Locks | `stockCountsService.ts` | `SELECT FOR UPDATE` for inventory changes |
| Sequence Generation | PostgreSQL sequences | `nextval('customer_number_seq')` for IDs |
| Status Checks | Service layer | Validates status before allowing updates |

### Verification Queries for Adversarial Scenarios

```sql
-- Check for duplicate idempotency keys (should return 0)
SELECT "IdempotencyKey", COUNT(*) 
FROM ledger_transactions 
WHERE "IdempotencyKey" IS NOT NULL
GROUP BY "IdempotencyKey" 
HAVING COUNT(*) > 1;

-- Verify reversals are balanced
SELECT lt."TransactionNumber", 
       SUM(le."DebitAmount") as dr, 
       SUM(le."CreditAmount") as cr
FROM ledger_transactions lt
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
WHERE lt."Description" LIKE 'REVERSAL:%'
GROUP BY lt."TransactionNumber"
HAVING ABS(SUM(le."DebitAmount") - SUM(le."CreditAmount")) > 0.001;

-- Check reversed transactions have valid references
SELECT lt."Id", lt."TransactionNumber", lt."Status"
FROM ledger_transactions lt
WHERE lt."Status" = 'REVERSED'
  AND lt."ReversedByTransactionId" IS NULL;
```

---

## �🔗 Related Documentation

- `COPILOT_IMPLEMENTATION_RULES.md` - General implementation rules
- `TIMEZONE_STRATEGY.md` - Date/time handling rules
- `ACCOUNTING_SINGLE_SOURCE_OF_TRUTH.md` - Accounting architecture
- `copilot-instructions.md` - Project-wide coding standards
