# AP Drift Decomposition — Verified Proof (Henber)

**Generated:** 2026-06-26T21:37:22.041Z

## Headline (matches UI reconciliation report)

| Metric | UGX |
|--------|-----|
| GL 2100 total | 29,382,251.00 |
| GL supplier scope (SUPPLIER_AP_GL) | 28,982,251.00 |
| Open-item subledger | 29,063,446.00 |
| **integrityGlDrift** | **-81,195.00** |
| Expense on 2100 | 400,000.00 |
| Unposted pipeline | -63,695.00 |
| STORED_BALANCE (stale) | 22,107,222.00 |

## Decomposition (must sum to integrityGlDrift)

| Component | UGX | Evidence |
|-----------|-----|----------|
| Untagged CORRECTION (heal-ap-drift) | 0.00 | must be 0 pre-deploy |
| Orphan RETURN_GRN on 2100 | 0.00 | must be 0 pre-deploy |
| Per-supplier residual | -81,195.00 | ACCULIFE, KAMCARE, SALUD, Zedeck |
| **integrityGlDrift** | **-81,195.00** | ✓ decomposed |

## Algebraic identity (verified)

```
integrityGlDrift = Σ(per-supplier entity drift) + untagged_CORRECTION_net_2100
-81,195.00 = -81,195.00 + (0.00)
```

## Simulated drift after fixes (no DB writes)

| Step | Drift UGX |
|------|-----------|
| Current | -81,195.00 |
| After reverse TXN-013389 + TXN-011802 | -81,195.00 |
| After reverse SALUD 6 orphan RGRN GL | -81,195.00 |
| RGRN repost pending (post-deploy) | 9 docs |
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
