# AP Drift Decomposition — Verified Proof (Henber)

**Generated:** 2026-06-27T16:49:34.308Z

## Headline (matches UI reconciliation report)

| Metric | UGX |
|--------|-----|
| GL 2100 total | 27,908,431.00 |
| GL supplier scope (SUPPLIER_AP_GL) | 27,508,431.00 |
| Open-item subledger | 27,508,431.00 |
| **integrityGlDrift** | **0.00** |
| Expense on 2100 | 400,000.00 |
| Unposted pipeline | 0.00 |
| STORED_BALANCE (stale) | 20,633,402.00 |

## Decomposition (must sum to integrityGlDrift)

| Component | UGX | Evidence |
|-----------|-----|----------|
| Untagged CORRECTION (heal-ap-drift) | 0.00 | must be 0 pre-deploy |
| Orphan RETURN_GRN on 2100 | 0.00 | must be 0 pre-deploy |
| Per-supplier residual | 0.00 | ACCULIFE, KAMCARE, SALUD, Zedeck |
| **integrityGlDrift** | **0.00** | ✗ FAILED |

## Algebraic identity (verified)

```
integrityGlDrift = Σ(per-supplier entity drift) + untagged_CORRECTION_net_2100
0.00 = 0.00 + (0.00)
```

## Simulated drift after fixes (no DB writes)

| Step | Drift UGX |
|------|-----------|
| Current | 0.00 |
| After reverse TXN-013389 + TXN-011802 | 0.00 |
| After reverse SALUD 6 orphan RGRN GL | 0.00 |
| RGRN repost pending (post-deploy) | 0 docs |
| STORED_BALANCE drift | 7,275,029.00 | heal-ap-reconciliation-caches |

## Untagged CORRECTION transactions (reverse these first)

| Txn | Id | net_2100 |
|-----|-----|----------|

## SALUD orphan RETURN_GRN (no linked SCN)

| RGRN | Txn | AP debit |
|------|-----|----------|

## Reproduce

```bash
HENBER_DATABASE_URL=... node SamplePOS.Server/scripts/proof-ap-drift-decompose.mjs
```

## Pre-deploy checklist

1. `npm run build` + `apJournalGovernance.test.ts` pass
2. This proof: layers 1–6 + orphan RGRN = 0 + cache match
3. Deploy server
4. `henber-ap-phase-b-remediate.mjs` if RGRN repost pending
5. `heal-ap-reconciliation-caches` + per-supplier document fixes for residual drift
