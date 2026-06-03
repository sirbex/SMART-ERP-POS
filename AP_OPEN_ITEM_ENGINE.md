# AP Open-Item Engine (SAP / Odoo parity)

**Single source of truth:** `SamplePOS.Server/src/modules/supplier-payments/apReconciliationEngine.ts`

All AP subledger math, supplier outstanding display, integrity checks, and cache sync **must** import from this module. Do not duplicate formulas in controllers, SQL, or UI.

---

## The one formula (tenant-wide)

```
AP open-item subledger =
  SUM(open supplier invoice obligations, SCN sign-flip)
  − SUM(unallocated COMPLETED supplier payments)

Per supplier (same math):
  suppliers.OutstandingBalance (cache) = GREATEST(0, open invoices − unallocated)
```

### Open invoices

- Table: `supplier_invoices`
- Include: `OutstandingBalance` where `deleted_at IS NULL`
- Exclude status: `PAID`, `CANCELLED`, `DELETED`, `DRAFT`
- **Supplier credit notes:** subtract (`document_type = 'SUPPLIER_CREDIT_NOTE'` → negative)

### Unallocated payments

- Table: `supplier_payments`
- `Status = 'COMPLETED'`, `deleted_at IS NULL`
- Unallocated = `UnallocatedAmount` or `Amount − AllocatedAmount` when > 0.009

### GL (separate check — not the supplier cache)

```
AP GL (supplier scope) =
  net-active account 2100
  excluding ReferenceType EXPENSE / EXPENSE_PAYMENT
```

Integrity: `drift = GL_supplier_scope − AP_open_item_subledger` (materiality threshold applies).

Standalone expenses on 2100 are **valid GL** but excluded from supplier subledger; if `drift + expenseOnAp ≈ 0`, treat as PASS.

---

## Architecture

```
┌────────────────────────┐     ┌─────────────────────────────┐
│ supplier_invoices      │     │ supplier_payments           │
│ (open items)           │     │ + supplier_payment_allocs   │
└───────────┬────────────┘     └──────────────┬──────────────┘
            │                                  │
            └────────────┬─────────────────────┘
                         ▼
              apReconciliationEngine.ts
         computeSupplierOpenItemBalance()
         syncSupplierBalanceFromOpenItems()
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
  suppliers.      Report Integrity   financialIntegrity
  OutstandingBalance   AP check      Service.checkAP
  (cache)              glRepair      accounting-integrity.test
                       healAPDrift
```

---

## Who must use the SSOT

| Consumer | Function | Notes |
|----------|----------|--------|
| Supplier list/detail/search | `SUPPLIER_OPEN_ITEM_BALANCE_SQL` | Live read — **never** raw `OutstandingBalance` column |
| Supplier performance API | `computeSupplierOpenItemBalance()` | Was wrong before Wave 5+fix (raw SUM) |
| Total outstanding card | `getTotalOutstanding()` | Same formula |
| After payment / invoice / SCN / GRN | `recalculateOutstandingBalance()` → `syncSupplierBalanceFromOpenItems()` | Within same transaction |
| Report Integrity | `computeApReconciliationSnapshot()` | Balance sheet AP check |
| GL integrity API | `runGLIntegrityCheck()` | Same snapshot |
| `heal-ap-drift` | `healAPDrift()` | Posts CORRECTION JE only when subledger is truth |
| Heal script | `heal-supplier-open-item-balances.ts` | One-shot cache sync |

---

## What is NOT AP subledger

| Item | Why excluded |
|------|----------------|
| `EXPENSE` / `EXPENSE_PAYMENT` on 2100 | Standalone expenses — GL only |
| Legacy `GOODS_RECEIPT` credits in 2100 | Belong in GRIR 2150 (advisory) |
| Paid / cancelled / draft invoices | Not open items |
| `SUM(OutstandingBalance)` without SCN flip | **Bug** — double-counts credit notes |

---

## Henber incidents (resolved)

| Issue | Cause | Fix |
|-------|--------|-----|
| AP integrity FAIL 1,557,560 | GL > open-item subledger | `heal-ap-drift` (TXN-013389); `healAPDrift` referenceId collision fixed |
| SALUD 15,589,543 vs 14,702,423 | Performance API used raw invoice SUM | `computeSupplierOpenItemBalance()` + read-repair cache |
| Unallocated = 0 on henber | Not the 1.56M drift | Formula visibility ruled out |

---

## Operations

```bash
# Investigate tenant AP
node scripts/ap-drift-investigation.mjs   # in smarterp-backend on prod

# Sync all supplier caches
npx tsx SamplePOS.Server/scripts/heal-supplier-open-item-balances.ts

# API (requires accounting.update)
POST /api/system/gl/recalc-supplier-balances
POST /api/system/gl/heal-ap-drift   # only if GL drift remains after data fix
```

```bash
# Tests
cd SamplePOS.Server && npm run test -- apReconciliationEngine
cd SamplePOS.Server && npm run test:accounting
```

---

## Rules for new code (enterprise)

1. **Import** from `apReconciliationEngine.ts` — no inline SUM on `supplier_invoices`.
2. **Credit notes** always reduce open AP (sign-flip in SUM).
3. **Subtract** unallocated completed payments for net amount owed.
4. **Recalc** supplier cache after any change to invoices, payments, or allocations.
5. **GL heal** adjusts GL to subledger — never edit invoice rows to “fix” drift.
6. **Do not** use `supplierModule.ts` (legacy duplicate) — use `supplierRepository` + routes in `supplierRoutes.ts`.
