/**
 * Kitchen food-cost analytics pure helpers — ADR-005 Phase 5.
 * Operational analytics only (not financial P&L SSOT).
 */

/** Theoretical cost from planned qty @ actual unit cost proxy. */
export function theoreticalLineCost(
  plannedQtyBase: number,
  actualUnitCost: number | null,
  actualQtyBase: number,
  actualLineCost: number | null,
): number {
  const planned = Number(plannedQtyBase) || 0;
  if (planned <= 0) return 0;
  if (actualUnitCost != null && Number.isFinite(actualUnitCost) && actualUnitCost >= 0) {
    return planned * actualUnitCost;
  }
  const actualQty = Number(actualQtyBase) || 0;
  const actualCost = Number(actualLineCost) || 0;
  if (actualQty > 0 && actualCost >= 0) {
    return planned * (actualCost / actualQty);
  }
  return 0;
}

/** Actual − theoretical. Positive = overspent / over-used vs plan. */
export function costVariance(actualCost: number, theoreticalCost: number): number {
  return (Number(actualCost) || 0) - (Number(theoreticalCost) || 0);
}

/** Variance as % of theoretical; null when theoretical is 0. */
export function costVariancePct(actualCost: number, theoreticalCost: number): number | null {
  const t = Number(theoreticalCost) || 0;
  if (!(t > 0)) return null;
  return (costVariance(actualCost, theoreticalCost) / t) * 100;
}

/**
 * Food cost % = kitchen costs / revenue.
 * Returns null when revenue is 0 (undefined profitability).
 */
export function foodCostPercent(kitchenCost: number, revenue: number): number | null {
  const rev = Number(revenue) || 0;
  if (!(rev > 0)) return null;
  return ((Number(kitchenCost) || 0) / rev) * 100;
}

/** Contribution = revenue − kitchen costs (ops margin, not GL P&L). */
export function contributionMargin(revenue: number, kitchenCost: number): number {
  return (Number(revenue) || 0) - (Number(kitchenCost) || 0);
}

/** Qty yield ratio actual/planned; 1 = perfect plan adherence. */
export function qtyYieldRatio(plannedQty: number, actualQty: number): number | null {
  const p = Number(plannedQty) || 0;
  if (!(p > 0)) return null;
  return (Number(actualQty) || 0) / p;
}

export function roundMoney(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round((Number(n) + Number.EPSILON) * f) / f;
}

export function roundPct(n: number | null, digits = 1): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
}
