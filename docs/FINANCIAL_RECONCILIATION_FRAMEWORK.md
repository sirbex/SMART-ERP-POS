# Financial Reconciliation Framework

Operational reference for accountants and developers. **Phase F0 (stabilization):** the lane framework is **authoritative**; legacy endpoints remain available but are deprecated.

## Philosophy

Three **independent lanes** per control account (AP, AR, Inventory). They answer different questions:

| Question | Lane |
|----------|------|
| Can we close the period? | **Integrity** (Lane 1) |
| Are denormalized caches stale? | **Cache** (Lane 2) |
| How much reversal history exists? | **Audit** (Lane 3) |

Do not mix these metrics. A large audit reversal impact does **not** imply an integrity failure if net-active GL matches the subledger.

## Lane definitions

### Lane 1 — Accounting Integrity (period-close gate)

Compares **net-active GL** (`LEDGER_NET_ACTIVE_SQL`) to the **canonical subledger**.

| Domain | GL account | Subledger SSOT |
|--------|------------|----------------|
| AP | 2100 (supplier scope, excl. expense accruals) | Open-item AP (posted invoices − unallocated payments) |
| AR | 1200 (net-active total) | Open-item AR (invoice `amount_due` − unallocated receipts) |
| Inventory | 1300 (net-active) | `SUM(inventory_batches.remaining_qty × cost_price)` |

**Status:** `RECONCILED` or `DISCREPANCY`  
**Severity:** `critical` when discrepant  
**periodCloseBlocking:** `true` (this lane defines the gate; blocked when status ≠ RECONCILED within materiality)

### Lane 2 — Cache Health (maintenance)

Compares subledger SSOT to **denormalized caches**. Does **not** gate period close.

| Domain | Left | Right | Maintenance action |
|--------|------|-------|-------------------|
| AP | Open-item | `suppliers.OutstandingBalance` | `POST /api/system/gl/recalc-supplier-balances` |
| AR | Open-item | `customers.balance` | `POST /api/system/gl/recalc-customer-balances` |
| Inventory | Batch subledger | Product header (qty × cost) | `POST /api/system/gl/rebuild-inventory-balances` |

**Status:** `HEALTHY` or `DRIFT`  
**Severity:** `maintenance`

### Lane 3 — Posted Journal Audit (informational)

Compares **gross posted** GL to **net-active** GL (reversal pairs included vs excluded).

**Status:** `INFORMATIONAL`  
**Severity:** `informational`  
**periodCloseBlocking:** `false`

## Period-close rules

1. Only **Lane 1 integrity** can block period close for a domain.
2. A domain is blocked when `integrity.status !== 'RECONCILED'` (difference exceeds materiality).
3. Cache drift and audit reversal impact are **informational/maintenance** — fix before close if possible, but they do not by themselves block close.
4. Use **`GET /api/erp-accounting/reconciliation/financial-health`** for the aggregated gate.

## Materiality rules

| Domain | Rule |
|--------|------|
| AP | Exact match within 0.01 UGX (expense-on-2100 may explain entity-scope drift separately) |
| AR | Exact match within 0.01 UGX, or within `max(500, 0.01% × |GL|)` capped at 5000 |
| Inventory | `max(5000, 0.01% × |GL 1300|)` |

Inventory uses a higher floor because batch/FEFO rounding accumulates at scale.

## Authoritative API (Phase F0+)

| Purpose | Endpoint |
|---------|----------|
| Aggregated health / period-close | `GET /api/erp-accounting/reconciliation/financial-health` |
| Generic lane | `GET /api/erp-accounting/reconciliation/lanes/:domain/:lane` |
| Domain shortcuts | `GET /api/erp-accounting/reconciliation/{ap,ar,inventory}/{integrity,cache,history}` |

Response contract: `FinancialLaneResult` — see `SamplePOS.Server/src/modules/financial-reconciliation/types.ts`.

## Deprecated surfaces (Phase F0 — still available)

Legacy routes return:

- HTTP headers: `Deprecation: true`, `Sunset`, `Link: successor`
- JSON `_meta`: `{ deprecated, successor, stabilizationPhase: "F0" }`
- Server log: `[LEGACY RECON] Deprecated consumer access`

Full catalog: `GET /api/erp-accounting/reconciliation/stabilization/consumer-audit`

Parity check (framework vs `fn_full_reconciliation_report`):  
`GET /api/erp-accounting/reconciliation/stabilization/parity?asOfDate=YYYY-MM-DD`

## Proof scripts

| Script | Purpose |
|--------|---------|
| `scripts/proof-financial-framework-baseline.mjs` | Cross-domain lane baseline + SQL parity |
| `scripts/proof-ap-drift-decompose.mjs` | AP integrity decomposition |
| `scripts/proof-ar-drift-decompose.mjs` | AR integrity decomposition |
| `scripts/post-deploy-financial-smoke.mjs` | Post-deploy route + DB smoke |

## UI

**Reconciliation page** (`FinancialHealthDashboard` + per-domain lane panels):

| Operational question | Where answered |
|---------------------|----------------|
| Can I close the period? | Health dashboard banner (clear / blocked) |
| Which domain blocks me? | Blocked domain list on dashboard |
| Accounting or maintenance? | Integrity = accounting (critical); cache = maintenance |
| Recommended action? | `recommendedAction` on lane cards and dashboard |

## Phase roadmap

| Phase | Status |
|-------|--------|
| A+B | Framework + AP |
| C | AR lanes |
| D | Inventory lanes |
| E | Financial health dashboard |
| **F0** | **Stabilization — dual path, framework authoritative, legacy deprecated** |
| F | Retire legacy SQL, endpoints, shims (**governance gate — see LEGACY_RECONCILIATION_CONSUMER_AUDIT.md**) |
| Next | **Financial Governance** — configurable materiality, period-close sign-off, trends, alerts, audit exports ([FINANCIAL_GOVERNANCE.md](./FINANCIAL_GOVERNANCE.md)) |

## Related docs

- [AP_RECONCILIATION_LANES.md](./AP_RECONCILIATION_LANES.md) — AP-specific detail
- [LEGACY_RECONCILIATION_CONSUMER_AUDIT.md](./LEGACY_RECONCILIATION_CONSUMER_AUDIT.md) — consumer inventory for Phase F
