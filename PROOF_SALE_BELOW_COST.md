# Proof: sale below-cost hard block

## Run (acceptance)

```bash
# 1. Apply migration 419 on tenant DB
# 2. Start API (localhost:3001)
npm run proof:sale-below-cost:local
```

## PASS criteria

1. `sale_line_price_events` table exists (migration 419).
2. Sale at **exact** AT_COST layer price → HTTP 201.
3. Sale **above** layer cost → HTTP 201.
4. Sale **below** FEFO-allocated cost → HTTP 400, `error_code: BELOW_ALLOCATED_COST`.
5. Walk-in below cost → same block (no manager override).
6. `BELOW_COST_BLOCKED` row in `sale_line_price_events`.
7. Optional `PRICE_EDIT` row when submitted unit price differs from engine reference.

## Server rule

`assertSaleLineNotBelowAllocatedCost` in `saleBelowCostGuard.ts` uses `previewFefoIssueCostForBaseQty` (same path as COGS / AT_COST).
