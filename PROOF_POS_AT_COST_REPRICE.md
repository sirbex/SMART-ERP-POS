# Proof: POS AT_COST customer repricing

## Run

```bash
npm run proof:pos-at-cost-reprice:local
```

## Root cause (fixed)

When an **At Cost** customer was selected, `repriceCart` called:

`POST /api/pricing/price/bulk` with `{ productId, quantity }` only.

For FIFO AT_COST, the engine needs **`baseQuantity = sellingQty × UoM conversionFactor`**. Without it, FIFO preview used the wrong base qty. The POS then multiplied `finalPrice` by the UoM factor for display.

Additionally, repricing updated **`unitPrice`** but left **`costPrice`** at catalog `uom.cost` (e.g. Abchlor catalog 1200 vs FEFO 1100), causing wrong margin / false “below cost”.

## Fix

- Pass `baseQuantity` from `getPosLineBaseQuantity()` in `POSPage.tsx` reprice effect.
- For `at_cost` rules, set `costPrice = unitPrice` (FEFO issue cost per selling UoM).

## Example (local Abchlor)

| Source | Per selling unit |
|--------|------------------|
| Catalog `uom.cost` | 1200 |
| FEFO AT_COST engine | 1100 |

PASS criteria: proof shows `catalog ≠ fefoUnit` and `fefoUnit = perBase × factor`.
