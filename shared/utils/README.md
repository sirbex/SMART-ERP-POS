# Shared Utilities

## MUoM Pricing (uom-pricing.ts)

Simple, systematic computation of unit costs and selling prices for multiple units of measure based on the cost of a whole carton (or any chosen base UoM).

Conventions:
- Each unit's `factor` is a fraction of the base UoM.
  - CARTON: 1
  - HALF_CARTON: 0.5
  - BOX: 1 / boxesPerCarton (e.g., 0.1 for 10 boxes/carton)
  - PIECE: 1 / piecesPerCarton (e.g., 1/120 if 120 pcs/carton)
- unitCost = baseCost * factor
- sellingPrice = unitCost * (priceMultiplierOverride ?? defaultMultiplier)
- priceOverride (if provided) takes precedence over calculated selling price
- Currency rounding defaults to 0 decimals (UGX) using HALF_UP

### Usage

```ts
import { computeUomPrices, makeCartonUoms } from './uom-pricing';

const baseCartonCost = 480_000; // UGX cost of a whole carton

const units = [
  { name: 'CARTON', factor: 1 },
  { name: 'HALF_CARTON', factor: 0.5 },
  { name: 'BOX', factor: 1 / 10 }, // 10 boxes per carton
  { name: 'PIECE', factor: 1 / 120, priceMultiplierOverride: 1.25 }, // 120 pcs per carton, higher per-piece markup
];

const result = computeUomPrices({
  baseCost: baseCartonCost,
  baseUomName: 'CARTON',
  units,
  defaultMultiplier: 1.20, // +20% markup if no override
  currencyDecimals: 0, // UGX
});

console.table(result.rows);
```

### Helper

```ts
makeCartonUoms({ includeHalfCarton: true, boxesPerCarton: 10, piecesPerCarton: 120 })
// => [ { name: 'CARTON', factor: 1 }, { name: 'HALF_CARTON', factor: 0.5 }, { name: 'BOX', factor: 0.1 }, { name: 'PIECE', factor: 1/120 } ]
```

### Notes
- Always use Decimal.js for currency math to avoid precision loss.
- This file provides pure computations only; validation lives in shared/zod.
- If the product has a `pricingFormula` like `cost * 1.20`, pass `defaultMultiplier: 1.20` for equivalent behavior.