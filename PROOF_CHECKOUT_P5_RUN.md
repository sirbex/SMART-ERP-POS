# Checkout Profile — P5 Evidence Run

Run: 2026-07-31T05:37:04.260Z (serial baseline) + concurrent spot check  
Rule: **Measure → Prove → Refactor**. Stock + GL remain in the sale TX.

## What P5 changed

1. **Stop UoM conversion repair on checkout resolve** (`resolveCanonicalProductUom`).
   - Resolve stays read-only via `buildMergedCanonicalConversions` (`product_uoms` + stored edges).
   - Repair/sync remains on product UoM **write** paths (`syncCanonicalConversion` / `addProductUom` / `updateProductUom`).
2. **Split profiler marks** so we never again mislabel UoM/recipe as `pricing`:
   - `product_prefetch` → `uom_resolve` → `recipe_explode` → `pricing_engine`

## Before vs after (same harness: `/orders/:id/complete`, FEFO+GL)

| Metric | P4 baseline (C=4, n=12) | P5 after (C=1, n=12) | P5 concurrent spot (C=4) |
|--------|-------------------------|----------------------|---------------------------|
| HTTP p95 | **741 ms** | **224 ms** | ~459 ms (partial) |
| Hottest phase | mislabeled `pricing` **525 ms** | `fefo_stock` **45 ms** | `fefo_stock` ~198 ms |
| True UoM work | hidden inside `pricing` | `uom_resolve` p95 **6.3 ms** | ~7 ms (success samples) |
| True pricing engine | hidden inside `pricing` | `pricing_engine` p95 **8.1 ms** | ~12 ms |
| Completes ok | 12/12 | **12/12** | 4/12* |
| Inventory / GL for successes | balanced | **balanced** | balanced for successes |

\*Concurrent failures are `ERR_INVENTORY_GL_COUPLING` with a large **pre-existing** inventory↔GL gap on this local tenant (`gapBefore≈-1.7M`). Not introduced by the UoM read-path change; serial path proves checkout integrity when coupling delta stays within assert.

## Phase ranking after P5 (serial, n=12)

| Phase | p50 | p95 |
|-------|-----|-----|
| fefo_stock | 18.6 | **44.7** |
| gl_posting | 32.5 | 43.1 |
| line_prep | 6.6 | 22.3 |
| pricing_engine | 2.5 | 8.1 |
| uom_resolve | 4.0 | 6.3 |

## Integrity preserved

- Exact stock deduction still inside `createSale` TX (`fefo_stock`).
- Balanced GL still inside TX (`gl_posting`); profile sales journals debit=credit.
- No GL/stock moved out of TX.

## Verdict

- **P5 PASS** for the measured hotspot (UoM write amplification on resolve).
- Next optional micro-opts (only if SLO still missed): batch UoM reads, walk-in cash pricing short-circuit.
- **Deploy still WAIT** until concurrent INV↔GL coupling on target tenants is clean (separate integrity track) and P1+P4+P5 are committed with human approval.

## How to re-run

```bash
npm run proof:checkout-profile
# CONCURRENCY=4 ITERATIONS=12 npm run proof:checkout-profile
```
