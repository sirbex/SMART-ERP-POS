# Legacy Reconciliation Consumer Audit (Phase F0)

Inventory of surfaces scheduled for retirement in **Phase F**. During **Phase F0**, all remain callable; access is logged as `[LEGACY RECON] Deprecated consumer access`.

**Authoritative replacement:** Financial Lane Framework — see [FINANCIAL_RECONCILIATION_FRAMEWORK.md](./FINANCIAL_RECONCILIATION_FRAMEWORK.md).

Machine-readable catalog: `GET /api/erp-accounting/reconciliation/stabilization/consumer-audit`

## API endpoints (deprecated)

| Surface ID | Path | Successor | Implementation note |
|------------|------|-----------|---------------------|
| `erp.reconciliation.summary` | `GET /reconciliation/summary` | `/financial-health` | F0: framework-authoritative; SQL parity logged |
| `erp.reconciliation.accounts-payable` | `GET /reconciliation/accounts-payable` | `/ap/{integrity,cache,history}` | Legacy shape; metrics SSOT |
| `erp.reconciliation.accounts-receivable` | `GET /reconciliation/accounts-receivable` | `/ar/{integrity,cache,history}` | Legacy shape; metrics SSOT |
| `erp.reconciliation.inventory` | `GET /reconciliation/inventory` | `/inventory/{integrity,cache,history}` | Legacy shape; metrics SSOT |
| `erp.reconciliation.cash` | `GET /reconciliation/cash` | Cash lane (planned) | Still uses `fn_reconcile_cash_account` |
| `erp.reconciliation.discrepancies` | `GET /reconciliation/:code/discrepancies` | Lane exception tables | Pre-lane SQL semantics |
| `accounting.integrity.full` | `GET /api/accounting/integrity` | `/financial-health` | Gross GL vs legacy subledgers |
| `accounting.integrity.ar` | `GET /api/accounting/integrity/ar` | `/ar/integrity` | Wrong AR semantics |
| `accounting.integrity.ap` | `GET /api/accounting/integrity/ap` | `/ap/integrity` | Legacy validation |
| `accounting.integrity.inventory` | `GET /api/accounting/integrity/inventory` | `/inventory/integrity` | cost_layers subledger |

## SQL functions (deprecated)

| Function | Used by (current) | Successor |
|----------|-------------------|-----------|
| `fn_full_reconciliation_report` | Parity check only (removed from summary path in F0) | `getAllDomainSummaries` |
| `fn_reconcile_cash_account` | `reconcileCash()` | Cash lane provider (planned) |
| `fn_reconcile_accounts_receivable` | **Removed** from service (Phase C) | `captureArReconciliationMetrics` |
| `fn_reconcile_accounts_payable` | Ad-hoc SQL / scripts | `captureApReconciliationMetrics` |
| `fn_reconcile_inventory` | Proof scripts, ad-hoc SQL | `captureInventoryReconciliationMetrics` |

## Services (deprecated semantics)

| Service | Successor |
|---------|-----------|
| `glValidationService.checkARReconciliation` | `getArIntegrityLane` |
| `glValidationService.checkAPReconciliation` | `getApIntegrityLane` |
| `glValidationService.checkInventoryReconciliation` | `getInventoryIntegrityLane` |
| `glIntegrityChecker` private check* methods | Framework lanes |

## Reports

| Report | Path | Issue | Successor |
|--------|------|-------|-----------|
| Inventory reconciliation report | `GET /api/reports/inventory/reconciliation` | Uses `cost_layers` not batches | `/inventory/integrity` |

## UI consumers

| Component | Legacy call | Migration |
|-----------|-------------|-----------|
| `ReconciliationPage` | `/reconciliation/summary` | Keep for detail table; health dashboard is gate |
| `ReconciliationPage` | `/reconciliation/{account}` detail modal | Lane panels + exceptions |
| `ReconciliationPage` | `/reconciliation/:code/discrepancies` | Lane exception tables |
| `GLIntegrityPanel` | `/api/system/gl/integrity` | `/financial-health` |
| `InventoryReconciliationReportPage` | `/reports/inventory/reconciliation` | Lane API |

## Scripts / CI

| Script | Legacy touch | Notes |
|--------|--------------|-------|
| `proof-ap-reconciliation.mjs` | `/accounts-payable` | Update to lane endpoints in Phase F |
| `proof-inventory-gl-local.mjs` | `/reconciliation/inventory` | Compare to `/inventory/integrity` |
| `post-deploy-financial-smoke.mjs` | Both legacy + lane routes | Intentional during F0 |
| `proof-financial-framework-baseline.mjs` | SQL parity only | F0 evidence collector |

## Scheduled jobs / exports

No cron jobs currently call legacy reconcile SQL directly. `inventoryGLIntegrityCheckService` uses correct batch SSOT but separate from lane API — consolidate in Phase F.

## Phase F exit criteria (governance gate)

Phase F retirement is a **governance decision supported by evidence**, not a calendar milestone. All criteria must be met before removing legacy SQL, endpoints, or compatibility shims.

| Criterion | Exit requirement | How to verify |
|-----------|------------------|---------------|
| **Legacy endpoint usage** | No production consumers for one full release cycle (or agreed threshold, e.g. &lt;5 non-smoke calls/month) | Search logs: `[LEGACY RECON] Deprecated consumer access`; review `surfaceId` counts |
| **Framework parity** | No unexplained parity failures; known intentional differences documented | `GET /reconciliation/stabilization/parity`; `npm run proof:framework-baseline`; `PARITY_STRICT=1` in CI |
| **Dashboard adoption** | Finance signs off that dashboard supports period-close operations | Checklist: period close, blocking domain, accounting vs maintenance, recommended action |
| **Regression suite** | All financial workflow tests pass consistently | `post-deploy-financial-smoke.mjs`; lane unit tests; deploy CI green |
| **Documentation** | Operations and support documentation finalized | `FINANCIAL_RECONCILIATION_FRAMEWORK.md`; this audit doc; AP lane doc |
| **Rollback** | Legacy implementation restorable until Phase F cutover is approved | Legacy code paths remain in repo through F0; tag release before Phase F delete |

### Known intentional parity differences (F0)

Document these in parity reports — **do not fail normal deployments**:

| Difference | Cause | Framework authoritative value |
|------------|-------|--------------------------------|
| AP SQL summary ~−913K vs integrity 0 | `fn_full_reconciliation_report` conflates gross reversal history with integrity | Lane 1 `integrityGlDrift` (net-active vs open-item) |
| Legacy `/accounting/integrity/ar` | Gross GL vs `customers.balance` | Lane 1 net-active vs open-item |
| Inventory report (`cost_layers`) | FIFO subledger vs FEFO batches | Lane 1 batch subledger |

Use `PARITY_STRICT=1` only in CI or deliberate migration validation — not post-deploy smoke.

## Evidence checklist (before Phase F)

- [ ] Zero unexpected `[LEGACY RECON]` log entries from production UI paths for 1 release cycle
- [ ] `npm run proof:framework-baseline` passes on production tenant (parity section may warn; framework lanes must pass)
- [ ] SQL parity mismatches documented in parity report (see table above)
- [ ] No external integrations on deprecated endpoints (grep logs + consumer-audit)
- [ ] Finance stakeholder sign-off on Financial Health dashboard
- [ ] Regression suite green for one full release cycle
- [ ] Rollback procedure documented and tested (revert deploy tag)

## Logging

Search production logs:

```
[LEGACY RECON] Deprecated consumer access
[LEGACY RECON] SQL summary parity mismatch
```

Fields: `surfaceId`, `successor`, `userId`, `path`, `userAgent`
