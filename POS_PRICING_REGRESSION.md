# POS pricing regression contract (DO NOT BREAK)

Master acceptance contract for **all POS pricing fixes** shipped in this branch.
Any change to protected files must pass the regression gate before merge.

## Fixed features (must stay working)

| # | Feature | What broke before | Invariant |
|---|---------|-------------------|-----------|
| 1 | **AT_COST FIFO repricing** | Wrong qty to engine; stale catalog `uom.cost` | `baseQuantity = sellingQty × factor`; `costPrice = unitPrice` after reprice |
| 2 | **FIFO layer visibility** | Hidden blended average (19k) | Distinct batch costs → separate cart lines or explicit layer hint |
| 3 | **No false below-cost (POS)** | Abchlor/OZEMPIC flagged at valid AT_COST | Client floor uses synced FEFO cost, not catalog |
| 4 | **Editable unit price** | Cashiers could not override line price | Manual edit recalcs subtotal; `unitPriceManuallySet` survives reprice until UoM change |
| 5 | **Below-cost hard block (server)** | Sales below batch cost could complete | HTTP 400 `BELOW_ALLOCATED_COST`; no manager override |
| 6 | **Below-cost audit** | Block events lost on rollback | `BELOW_COST_BLOCKED` written via `pool`, not sale transaction |

See also: [AT_COST_FIFO_INTEGRITY.md](./AT_COST_FIFO_INTEGRITY.md) (FIFO/layer detail).

## Regression commands

```bash
# Fast — no API/DB (~15s). Run before every commit touching protected files.
npm run test:pos-pricing-regression
# alias (same runner):
npm run test:at-cost-regression

# Full local acceptance — API on :3001 + tenant DB
npm run proof:pos-pricing:local
# alias:
npm run proof:at-cost:local
```

## Unit test coverage matrix

| Feature | Server tests | Client tests |
|---------|--------------|--------------|
| FIFO layers / blended cost | `atCostIssuePrice.test.ts`, `pricingEngine.atCost.test.ts` | `posCartAtCost.spec.ts` |
| baseQuantity on bulk price | `saleItemBaseQuantity.test.ts` | (via reprice — proof script) |
| AT_COST customer scope guard | `atCostSalePricingGuard.test.ts` | — |
| Below-cost hard block | `saleBelowCostGuard.test.ts` | — |
| Client cost floor / validation | — | `posCartLine.spec.ts`, `posCartUom-at-cost.spec.ts` |
| Unit price normalize/recalc | — | `posCartLine.spec.ts` |

## Live proof scripts (acceptance — not Jest alone)

| Script | Proves |
|--------|--------|
| `proof:pos-at-cost-reprice:local` | FEFO vs catalog, `baseQuantity`, cost sync |
| `proof:at-cost-fifo-layers:local` | API `atCostLayers[]` |
| `proof:sale-below-cost:local` | Block + audit + walk-in + exact-cost allow |

## Protected files

| Area | Files |
|------|--------|
| FIFO engine | `SamplePOS.Server/src/modules/pricing/atCostIssuePrice.ts` |
| Bulk pricing API | `SamplePOS.Server/src/modules/pricing/pricingEngineService.ts` |
| Below-cost guard | `SamplePOS.Server/src/modules/sales/saleBelowCostGuard.ts` |
| Price audit | `SamplePOS.Server/src/modules/sales/salePriceAuditService.ts` |
| Sale create path | `SamplePOS.Server/src/modules/sales/salesService.ts` (cost check + audit) |
| Migration | `shared/sql/419_sale_line_price_events.sql` |
| POS reprice | `samplepos.client/src/pages/pos/POSPage.tsx` (repriceCart effect, checkout error UX) |
| Cart split | `samplepos.client/src/utils/posCartAtCost.ts` |
| Line validation | `samplepos.client/src/utils/posCartLine.ts`, `posCartUom.ts` |
| Unit price UI | `samplepos.client/src/components/pos/PosUnitPriceInput.tsx` |

## Pre-commit

Husky runs `test:pos-pricing-regression` when any protected file above is staged.

## Golden scenario (FIFO / blended)

Qty 2 from batches @ 20,000 and @ 18,000 → **one line** @ 19,000, subtotal **38,000** (blended FIFO).

Split only when blended unit cannot match total (e.g. 20,000 + 18,001 = 38,001).

**Proof (required before merge):**

```bash
npm run proof:at-cost-fifo-split-policy   # golden scenarios (no server)
npm run test:pos-pricing-regression       # unit tests + proof gate
npm run proof:pos-pricing:local             # + live API on :3001
```
