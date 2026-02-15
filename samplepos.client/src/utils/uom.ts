import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

function toDec(v: number | string | undefined | null): Decimal {
  if (v === undefined || v === null || v === '') return new Decimal(0);
  try {
    return new Decimal(v);
  } catch {
    return new Decimal(0);
  }
}

export function computeUnitCost(
  baseCost: number | string,
  factor?: number | string,
  override?: number | string | null
): string {
  const base = toDec(baseCost);
  if (override !== undefined && override !== null && `${override}` !== '') {
    return toDec(override).toFixed(2);
  }
  const f = toDec(factor ?? 1);
  return base.mul(f).toFixed(2);
}

export function computeUnitPrice(
  basePrice: number | string,
  factor?: number | string,
  override?: number | string | null
): string {
  const base = toDec(basePrice);
  if (override !== undefined && override !== null && `${override}` !== '') {
    return toDec(override).toFixed(2);
  }
  const f = toDec(factor ?? 1);
  return base.mul(f).toFixed(2);
}

export function convertQtyToBase(quantity: number | string, factor?: number | string): string {
  const q = toDec(quantity);
  const f = toDec(factor ?? 1);
  return q.mul(f).toFixed(6);
}

export function convertQtyFromBase(baseQty: number | string, factor?: number | string): string {
  const q = toDec(baseQty);
  const f = toDec(factor ?? 1);
  if (f.eq(0)) return q.toFixed(6);
  return q.div(f).toFixed(6);
}

// Convert a displayed unit cost (e.g., box price) to base unit cost using the conversion factor
export function convertCostToBase(displayCost: number | string, factor?: number | string): string {
  const c = toDec(displayCost);
  const f = toDec(factor ?? 1);
  if (f.eq(0)) return c.toFixed(2);
  return c.div(f).toFixed(2);
}

// Compare two costs allowing a small relative tolerance (default 0.5%) to ignore rounding noise
export function isSameCostWithinTolerance(a: number | string, b: number | string, tolerancePct: number = 0.5): boolean {
  const da = toDec(a);
  const db = toDec(b);
  const diff = da.minus(db).abs();
  const absb = db.abs();
  const denom = absb.greaterThan(1) ? absb : new Decimal(1);
  const pct = diff.div(denom).mul(100);
  return pct.lte(tolerancePct);
}
