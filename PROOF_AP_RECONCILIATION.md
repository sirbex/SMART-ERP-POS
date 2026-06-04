# AP (2100) Reconciliation — Solutions & Verified Proof

## Permanent fix (service layer, all tenants)

**`apBalanceGovernance.ts`** enforces AP cache integrity without DB triggers:

| Hook | When | Action |
|------|------|--------|
| `afterJournalEntryGovernance` | Every `AccountingCore.createJournalEntry` / `reverseTransaction` (same txn) | Rebase touched `accounts.CurrentBalance` from POSTED ledger; sync supplier cache if 2100 + `entityType=supplier` |
| `syncSupplierApCache` | `postInvoiceToGL` and manual heals | Repair invoice OB from ledger + update `suppliers.OutstandingBalance` |
| `ensureTenantApCachesAligned` | First request per tenant per process (`tenantMigrationService`) | Auto-heal cache drift (2100 rebase + all suppliers) — no GL correction JE |

Going forward, **STORED_BALANCE** and **SUPPLIER_BALANCE** cache rows stay aligned with ledger/open-item SSOT. True GL vs open-item gaps (expenses on 2100, legacy GR) still use integrity + optional `heal-ap-drift`.

---

# AP (2100) Reconciliation — Solutions & Verified Proof

Enterprise-grade Accounts Payable reconciliation for Henber and all tenants. Three independent drift layers; each has a dedicated heal and a measurable proof.

## The three layers (Henber example)

| Layer | Symptom | Root cause | Heal | Proof invariant |
|-------|---------|------------|------|-----------------|
| **STORED_BALANCE** | `accounts.CurrentBalance` −20.3M vs GL +17.0M | Cache not updated from ledger (bulk SQL, restore, old triggers) | `POST /api/system/gl/rebase-account-balances` `{ "accountCodes": ["2100"] }` | `\|storedBalanceDrift\| < 0.01` |
| **SUPPLIER_BALANCE** | suppliers sum 26.7M vs open-item 26.1M (−573k in old UI) | Stale `suppliers.OutstandingBalance` | `POST /api/system/gl/recalc-supplier-balances` | `\|supplierCacheDrift\| < 0.01` |
| **SUPPLIER_AP_GL** | EntityType SUPPLIER GL ≠ open-item subledger | Missing entity tags, legacy GR in AP, true GL drift | `POST /api/system/gl/heal-ap-drift` (correction JE) | Integrity `computeApReconciliationSnapshot` within materiality |

**Phase-1 bundle (cache only, no GL JE):**

```http
POST /api/system/gl/heal-ap-reconciliation-caches
```

Runs recalc + rebase 2100 and returns `before` / `after` metrics + `verification.ok`.

## SSOT definitions

- **Open-item subledger** = Σ open `supplier_invoices` (SCN negated) − Σ unallocated `supplier_payments` (floored per supplier at 0).
- **Posted GL 2100** = Σ credits − debits on account 2100, `ledger_transactions.Status = 'POSTED'`.
- **Integrity GL** = net-active 2100 excluding `EXPENSE` / `EXPENSE_PAYMENT` reference types (`apReconciliationEngine`).

UI report (`GET /api/erp-accounting/reconciliation/accounts-payable`) now includes **OPEN_ITEM_SUBLEDGER** and compares:

- `SUPPLIER_BALANCE` → cache vs open-item  
- `SUPPLIER_AP_GL` → entity GL vs open-item  
- `STORED_BALANCE` → cache vs full posted GL  

## Proof commands

### 1) Automated proof bundle (CI / local)

```bash
cd SamplePOS.Server
npm run proof:ap-reconciliation
```

Runs:

- `apReconciliationMetrics.test.ts` (Henber-style drift scenarios)
- `accounting-integrity.test.ts` AP group (when DB available)
- Live API read-only against `BASE_URL`

### 2) Live read-only snapshot

```bash
BASE_URL=https://your-tenant.example \
TEST_EMAIL=admin@... TEST_PASSWORD=... \
node scripts/proof-ap-reconciliation.mjs
```

Calls:

- `GET /api/system/gl/ap-reconciliation-metrics`
- `GET /api/erp-accounting/reconciliation/accounts-payable`

### 3) Live heal + verified AFTER proof (Henber)

```bash
BASE_URL=https://henber.example \
TEST_EMAIL=... TEST_PASSWORD=... \
HEAL_AP=1 node scripts/proof-ap-reconciliation.mjs
```

**Pass criteria after heal:**

```json
{
  "verification": { "ok": true, "failures": [] },
  "metrics": {
    "supplierCacheDrift": 0,
    "storedBalanceDrift": 0
  }
}
```

### 4) SQL manual proof (tenant DB)

```sql
-- Before/after STORED_BALANCE
SELECT "CurrentBalance" FROM accounts WHERE "AccountCode" = '2100';

SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS gl_posted
FROM ledger_entries le
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '2100' AND lt."Status" = 'POSTED';

-- Cache vs open-item (SUPPLIER_BALANCE)
SELECT SUM("OutstandingBalance") FROM suppliers;
-- Compare to open-item formula in apReconciliationEngine SUPPLIER_OPEN_ITEM_BALANCE_SQL
```

### 5) Integrity dashboard

```http
GET /api/system/gl/integrity
```

Confirms AP open-item vs net-active GL (may still show drift if expenses explain gap — use `heal-ap-drift` only when unexplained).

## API reference

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/system/gl/ap-reconciliation-metrics` | Read-only all layers + verification |
| POST | `/api/system/gl/recalc-supplier-balances` | Fix supplier cache |
| POST | `/api/system/gl/rebase-account-balances` | Fix `CurrentBalance` from ledger |
| POST | `/api/system/gl/heal-ap-reconciliation-caches` | Phase-1 bundle + proof payload |
| POST | `/api/system/gl/heal-ap-drift` | Phase-2 GL correction JE (true GL drift) |

Requires `accounting.update` permission.

## Henber runbook (ordered)

1. Deploy build with this module (`apReconciliationMetrics`, heal routes, UI report fix).
2. `HEAL_AP=1` proof script against Henber URL **or** POST `heal-ap-reconciliation-caches` in admin UI/API.
3. Re-open AP reconciliation — expect **SUPPLIER_BALANCE** and **STORED_BALANCE** = MATCHED.
4. If **SUPPLIER_AP_GL** still DISCREPANCY → review `NON_SUPPLIER_AP` and integrity; then `heal-ap-drift` if material unexplained drift.
5. Archive proof output (`before` / `after` JSON) for audit.

## What this does *not* do

- Does not rewrite historical ledger lines (except optional `heal-ap-drift` correction JE).
- Does not change open invoice amounts — only refreshes caches from SSOT.
- Does not replace tenant-specific investigative SQL in `scripts/henber-ap-*.sql` (still useful for root-cause forensics).
