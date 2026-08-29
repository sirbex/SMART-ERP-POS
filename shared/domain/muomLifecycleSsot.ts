/**
 * MUoM lifecycle SSOT — stock/factor/rebase guards for live items.
 *
 * Invariants locked by evidence tests (muomLifecycleStockGuards.evidence.test.ts):
 * - Stock qty is stored in base UoM only.
 * - Posted document lines snapshot conversion_factor (history does not re-read master).
 * - Base UoM identity must not change on a live product_uom row.
 * - Conversion factor must not change while on-hand base qty is material.
 */

export const MUOM_STOCK_QTY_EPS = 0.0001;
export const MUOM_FACTOR_EPS = 0.0001;

export const MUOM_LIFECYCLE_MESSAGES = {
  rebaseBlocked:
    'Changing the base stock UoM is blocked by canonical MUoM rules. Create a new item instead of rebasing a live item.',
  factorChangeWithStock:
    'Cannot change conversion factor while stock remains on hand. Clear or invent stock to zero first. Past documents keep their snapshots.',
  factorInvalid: 'Conversion factor must be a finite number ≥ 1.',
} as const;

export function hasMaterialStockOnHand(onHandBase: number, eps = MUOM_STOCK_QTY_EPS): boolean {
  return Math.abs(Number(onHandBase) || 0) > eps;
}

export function isMeaningfulFactorChange(
  previous: number,
  next: number,
  eps = MUOM_FACTOR_EPS,
): boolean {
  if (!Number.isFinite(previous) || !Number.isFinite(next)) return true;
  return Math.abs(previous - next) > eps;
}

/** Pack/purchase factor edits are permitted only when measured on-hand base is ~0. */
export function canChangeConversionFactor(onHandBase: number): boolean {
  return !hasMaterialStockOnHand(onHandBase);
}

export function residualFactorChangeBlockedReason(onHandBase: number): string | null {
  if (canChangeConversionFactor(onHandBase)) return null;
  return MUOM_LIFECYCLE_MESSAGES.factorChangeWithStock;
}

/**
 * Identity change on the base/default product_uom row = rebase.
 * Non-base pack rows may rename (e.g. purchase BOX → PACKET).
 */
export function isBaseUomIdentityChange(input: {
  uomIdChanging: boolean;
  isDefaultRow: boolean;
  rowUomId: string;
  baseUomId: string | null | undefined;
}): boolean {
  if (!input.uomIdChanging) return false;
  if (input.isDefaultRow) return true;
  if (input.baseUomId && input.baseUomId === input.rowUomId) return true;
  return false;
}

export function rebaseBlockedReason(input: {
  uomIdChanging: boolean;
  isDefaultRow: boolean;
  rowUomId: string;
  baseUomId: string | null | undefined;
}): string | null {
  return isBaseUomIdentityChange(input) ? MUOM_LIFECYCLE_MESSAGES.rebaseBlocked : null;
}
