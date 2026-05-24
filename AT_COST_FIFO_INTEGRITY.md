# AT_COST + FIFO integrity contract (DO NOT BREAK)

This document is the **FIFO/layer detail** for AT_COST pricing.
See **[POS_PRICING_REGRESSION.md](./POS_PRICING_REGRESSION.md)** for the full regression contract (below-cost block, editable unit price, etc.).

Any change to files listed below must pass `npm run test:pos-pricing-regression` before merge.

## Business rules (invariants)

1. **FIFO walk** — AT_COST uses the same FEFO/FIFO batch order as sale COGS (`inventory_batches`, expiry then received date).
2. **baseQuantity** — Bulk pricing must receive `baseQuantity = sellingQty × UoM conversionFactor`, not selling qty alone.
3. **Layer breakdown** — API returns `atCostLayers[]` with one segment per batch cost consumed (e.g. `1@20000 + 1@18000`).
4. **Cart split** — When `atCostLayers` has **distinct** unit costs and UoM allows it, POS shows **separate cart lines** (not a hidden blend).
5. **costPrice sync** — On AT_COST reprice, `costPrice` must equal FEFO `unitPrice` (never stale catalog `uom.cost`).
6. **No false below-cost** — Client validation must not compare AT_COST unit price to catalog cost when FEFO is lower.
7. **Below-cost block** — Selling below allocated batch cost remains hard-blocked on server (`BELOW_ALLOCATED_COST`).

## Example (must always hold)

| Batch | Cost | Qty |
|-------|------|-----|
| 1 | 20,000 | 1 |
| 2 | 18,000 | 1 |

**Cart (AT_COST customer, qty 2):**

- Line 1: qty 1, unit **20,000**
- Line 2: qty 1, unit **18,000**
- Subtotal **38,000** (not one line @ 19,000 without breakdown)

## Protected files

| Area | Files |
|------|--------|
| Engine | `SamplePOS.Server/src/modules/pricing/atCostIssuePrice.ts` |
| Bulk API | `SamplePOS.Server/src/modules/pricing/pricingEngineService.ts` |
| POS reprice | `samplepos.client/src/pages/pos/POSPage.tsx` (repriceCart effect) |
| Cart split | `samplepos.client/src/utils/posCartAtCost.ts` |
| Validation | `samplepos.client/src/utils/posCartLine.ts`, `posCartUom.ts` |
| UI | `samplepos.client/src/components/pos/PosUnitPriceInput.tsx` |

## Regression commands (required before merge)

```bash
# Fast — no server needed (~15s)
npm run test:pos-pricing-regression

# Full local acceptance — API on :3001 + DB
npm run proof:pos-pricing:local
```

## Proof scripts (local acceptance)

| Script | What it proves |
|--------|----------------|
| `proof:pos-at-cost-reprice:local` | baseQuantity, FEFO vs catalog |
| `proof:at-cost-fifo-layers:local` | `atCostLayers` from API |
| `proof:sale-below-cost:local` | hard block + audit |
