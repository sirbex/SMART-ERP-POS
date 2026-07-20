# Henber AR permanent remediation — live evidence

**Date:** 2026-07-10  
**Tenant:** Henber (`HENBER_DATABASE_URL`)  
**Operator:** metadata backfill only (no amount / document mutation)

---

## Integrity contract (verified)

| Check | Before | After |
|-------|--------|-------|
| GL 1200 net-active | 24,440,114.00 | 24,440,114.00 |
| Open-item subledger | 24,440,114.00 | 24,440,114.00 |
| integrityGlDrift | 0.00 | 0.00 |
| customers.balance cache | 24,440,114.00 | 24,440,114.00 |
| cacheDrift | 0.00 | 0.00 |
| 1200 entry count | 98 | 98 |
| 1200 sum Debit | 25,969,393.00 | 25,969,393.00 |
| 1200 sum Credit | 6,063,479.00 | 6,063,479.00 |
| customerScopeDrift | **−2,505,119.00** | **0.00** |
| NON_CUSTOMER_AR (net) | 2,505,119.00 | 0.00 |
| Per-customer exceptions | 9 open | **0** |

**Data loss:** none. Only `ledger_entries.EntityType` / `EntityId` updated for 18 lines.

---

## Applied (18 journals)

Sales, refunds, refund correction, and legacy `invoice_payments` receipts retagged to `CUSTOMER` + customer UUID.  
Script: `SamplePOS.Server/scripts/henber-ar-metadata-backfill.mjs`  
Proofs: `PROOF_AR_METADATA_BACKFILL_LIVE.md`, `PROOF_AR_DRIFT_DECOMPOSE.md`

---

## Intentionally untouched

| Txn | Why |
|-----|-----|
| TXN-003510 SALE (+24,000) | Deposit sale with **no customer_id** |
| TXN-004253 MANUAL_ADJUSTMENT (−24,000) | Offsetting adjustment for same sale |

Net impact on control account attribution: **0**. No safe customer to attach.

---

## Recurrence prevention (remaining)

| Control | Status |
|---------|--------|
| Phase 2 posting path fixes | Deployed |
| Untagged 1200 created last 14 days | **0** |
| `AR_GOVERNANCE_MODE` | Compose default `warn` — **enforce not yet live** |
| Heal scripts | Blocked by governance for `AR-DRIFT-HEAL-*` |

**Next permanent step:** set production `AR_GOVERNANCE_MODE=enforce` (rollback: `warn`) after a controlled deploy so new untagged AR journals are rejected at post time.
