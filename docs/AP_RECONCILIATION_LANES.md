# AP Reconciliation Lanes

Accounts Payable reconciliation exposes **three independent concerns**. Only Lane 1 gates period close.

## Lane 1 — Accounting Integrity (period close)

| Field | Meaning |
|-------|---------|
| GL (Net Active) | Supplier-scope 2100, `LEDGER_NET_ACTIVE_SQL`, excludes EXPENSE |
| Open-item Subledger | Posted invoices (`is_posted_to_gl`) − unallocated payments |
| Integrity Difference | Lane 1 drift — must be zero (within materiality) to close |

**API:** `GET /api/erp-accounting/reconciliation/ap/integrity`

**Period close:** Uses `integrityGlDrift` only (`isApSupplierGlIntegrityMatched`).

## Lane 2 — Supplier Cache Health (maintenance)

| Field | Meaning |
|-------|---------|
| Open-item Balance | Same SSOT as Lane 1 subledger |
| Supplier Cache | `SUM(suppliers.OutstandingBalance)` |
| Cache Difference | Denormalization drift — does **not** block period close |

**API:** `GET /api/erp-accounting/reconciliation/ap/cache`

**Remediation:** `POST /api/system/gl/recalc-supplier-balances`

## Lane 3 — Posted Journal Audit (informational)

| Field | Meaning |
|-------|---------|
| Gross Posted | All `POSTED` supplier-scope 2100 legs (includes reversals) |
| Net Active | Lane 1 GL basis |
| Reversal Impact | Gross − Net — audit only, not an error |

**API:** `GET /api/erp-accounting/reconciliation/ap/history`

## UI

`ReconciliationPage` renders three cards via `ApReconciliationLanesPanel`. The summary AP row uses Lane 1 metrics and labels.

## Read-only diagnostics (product)

| Script | Purpose |
|--------|---------|
| `scripts/proof-ap-drift-decompose.mjs` | Decompose global `integrityGlDrift` |
| `scripts/proof-scn-applied-gl-pattern.mjs` | Compare APPLIED SCN GL journal templates |

## Regression tests

`apReconciliationLanes.test.ts` — lane separation invariants and integrity materiality rules.

Operational / tenant-specific repair scripts live outside application deployment (see repo `scripts/henber-*`).
