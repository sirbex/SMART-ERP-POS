/**
 * PO line quantity/cost — PricingEngine SSOT with commercial UX.
 *
 * Rules:
 * 1. Either unit cost or line total may lead while editing.
 * 2. When line total is entered, that 2dp total is preserved; unit cost gets
 *    the minimum decimals (2–6) needed so PE(qty×unit) equals that total.
 *    Never overwrite the user's total (e.g. 7000 → 7000.08 is forbidden).
 * 3. When unit cost is entered at 2dp, line total = PE(qty×unit).
 * 4. Prefer 2dp unit cost whenever it already matches; only use more decimals
 *    when required for an exact line total.
 */
import Decimal from 'decimal.js';
import { PricingEngine } from './pricingEngine.js';

export const PO_UNIT_COST_MIN_DP = 2;
export const PO_UNIT_COST_MAX_DP = 6;

export function poLineBaseQuantity(
  quantity: number | string,
  conversionFactor: number | string = 1,
): number {
  const q = Number(quantity) || 0;
  const f = Number(conversionFactor) || 1;
  return q * f;
}

export function convertPoLineQuantityForUomChange(
  quantity: string | number,
  oldFactor: number | string,
  newFactor: number | string,
): string {
  const baseQty = poLineBaseQuantity(quantity, oldFactor);
  const nf = Number(newFactor) || 1;
  if (nf <= 0) return String(quantity);
  const converted = baseQty / nf;
  const rounded = Math.round(converted * 1e6) / 1e6;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(6).replace(/\.?0+$/, '');
}

export function poLineDisplayUnitCost(
  baseCost: number | string,
  factor: number | string = 1,
): string {
  const b = Number(baseCost) || 0;
  const f = Number(factor) || 1;
  return new Decimal(b)
    .times(f)
    .toDecimalPlaces(PO_UNIT_COST_MIN_DP, Decimal.ROUND_HALF_UP)
    .toFixed(PO_UNIT_COST_MIN_DP);
}

export function poLineBaseCostFromDisplay(
  unitCost: number | string,
  factor: number | string = 1,
): string {
  const c = Number(unitCost) || 0;
  const f = Number(factor) || 1;
  if (f <= 0) {
    return formatUnitAtDp(new Decimal(c), PO_UNIT_COST_MAX_DP);
  }
  // Keep enough precision so total-led units (e.g. 7000÷24) survive UoM round-trips
  return formatUnitAtDp(new Decimal(c).div(f), PO_UNIT_COST_MAX_DP);
}

function formatUnitAtDp(value: Decimal, dp: number): string {
  let s = value.toDecimalPlaces(dp, Decimal.ROUND_HALF_UP).toFixed(dp);
  // Strip trailing zeros (200.000000 → 200); keep at least 2dp for currency look
  if (s.includes('.')) {
    s = s.replace(/0+$/, '').replace(/\.$/, '');
  }
  if (!s.includes('.')) {
    s = `${s}.00`;
  } else {
    const parts = s.split('.');
    if (parts[1].length < PO_UNIT_COST_MIN_DP) {
      s = `${parts[0]}.${parts[1].padEnd(PO_UNIT_COST_MIN_DP, '0')}`;
    }
  }
  return s;
}

/** Format a manually entered unit cost to 2dp (unit-cost lead). */
export function formatPoUnitCost(unitCost: number | string): string {
  const n = new Decimal(unitCost || 0);
  if (!n.isFinite() || n.lt(0)) return '0.00';
  return n
    .toDecimalPlaces(PO_UNIT_COST_MIN_DP, Decimal.ROUND_HALF_UP)
    .toFixed(PO_UNIT_COST_MIN_DP);
}

/**
 * Unit-cost field blur.
 * Never 2dp-snap a total-led precise unit (that rewrites 7000.00 → 7000.08).
 * Returns null when the displayed unit should be left unchanged.
 */
export function resolveUnitCostAfterBlur(
  quantity: number | string,
  unitCostRaw: number | string,
  lineTotal: number | string,
): string | null {
  const raw = String(unitCostRaw ?? '').trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || raw === '') return null;
  const as2 = formatPoUnitCost(n);
  if (isPoLineMoneyConsistent(quantity, as2, lineTotal)) {
    return raw === as2 ? null : as2;
  }
  // Precise unit already matches line total — keep it
  if (isPoLineMoneyConsistent(quantity, raw, lineTotal)) {
    return null;
  }
  // Unit was edited away from the line total → unit leads at 2dp
  return as2;
}

export function poLineTotal(quantity: number | string, unitCost: number | string): string {
  return PricingEngine.calculateLineTotal(quantity, unitCost)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
}

export function isPoLineMoneyConsistent(
  quantity: number | string,
  unitCost: number | string,
  lineTotal: number | string,
  eps = 0.005,
): boolean {
  const pe = PricingEngine.calculateLineTotal(quantity, unitCost).toDecimalPlaces(
    2,
    Decimal.ROUND_HALF_UP,
  );
  return pe.minus(new Decimal(lineTotal || 0)).abs().lte(eps);
}

/**
 * Hydrate PO line money from DB / API.
 * Prefer stored 2dp line total when present; if unit is the classic 2dp truncation
 * that no longer matches, re-derive unit so Edit does not show 7000.08 for a stored 7000.
 * When stored total already equals PE(qty×2dp unit) (legacy bad row), keep that pair.
 */
export function hydratePoLineMoney(
  quantity: number | string,
  unitCost: number | string,
  storedLineTotal?: number | string | null,
): { unitCost: string; lineTotal: string } {
  const qty = new Decimal(quantity || 0);
  if (qty.lte(0)) {
    return { unitCost: '0.00', lineTotal: '0.00' };
  }
  const unitRaw = String(unitCost ?? '').trim();
  const storedRaw =
    storedLineTotal == null || storedLineTotal === ''
      ? ''
      : String(storedLineTotal).trim();

  if (storedRaw !== '') {
    const stored = new Decimal(storedRaw);
    if (stored.isFinite() && stored.gte(0)) {
      const target = stored.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
      if (unitRaw !== '' && isPoLineMoneyConsistent(quantity, unitRaw, target)) {
        return { unitCost: unitRaw, lineTotal: target };
      }
      return syncPoLineFromEnteredTotal(quantity, target);
    }
  }

  if (unitRaw === '' || unitRaw === '.' || unitRaw === '-') {
    return { unitCost: '0.00', lineTotal: '0.00' };
  }
  return {
    unitCost: unitRaw,
    lineTotal: poLineTotal(quantity, unitRaw),
  };
}

/**
 * Find the smallest unit-cost decimal precision (2–6) where PE(qty×unit) == target total.
 */
export function resolveUnitCostForLineTotal(
  quantity: number | string,
  lineTotal: number | string,
): string {
  const qty = new Decimal(quantity || 0);
  const target = new Decimal(lineTotal || 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (qty.lte(0)) return '0.00';
  const exact = target.div(qty);
  for (let dp = PO_UNIT_COST_MIN_DP; dp <= PO_UNIT_COST_MAX_DP; dp++) {
    const unit = formatUnitAtDp(exact, dp);
    if (poLineTotal(quantity, unit) === target.toFixed(2)) {
      return unit;
    }
  }
  // Last resort: max precision, still keep the caller's line total as authority elsewhere
  return formatUnitAtDp(exact, PO_UNIT_COST_MAX_DP);
}

/**
 * Line-total lead: KEEP the entered 2dp total; derive unit with only enough decimals.
 * Never rewrite 7000.00 → 7000.08.
 */
export function syncPoLineFromEnteredTotal(
  quantity: number | string,
  enteredLineTotal: number | string,
): { unitCost: string; lineTotal: string } {
  const qty = new Decimal(quantity || 0);
  const raw = String(enteredLineTotal ?? '').trim();
  if (qty.lte(0)) {
    return { unitCost: '0.00', lineTotal: '0.00' };
  }
  if (raw === '' || raw === '.' || raw === '-') {
    return { unitCost: '0.00', lineTotal: raw };
  }
  const entered = new Decimal(raw);
  if (!entered.isFinite() || entered.lt(0)) {
    return { unitCost: '0.00', lineTotal: raw };
  }

  const lineTotal = entered.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  const unitCost = resolveUnitCostForLineTotal(quantity, lineTotal);
  return { unitCost, lineTotal };
}

/** While typing a line total: preview unit cost (minimal dp) when parseable. */
export function deriveUnitCostWhileEditingLineTotal(
  quantity: number | string,
  rawLineTotal: string,
): string | null {
  const qty = new Decimal(quantity || 0);
  if (qty.lte(0)) return null;
  const n = parseFloat(rawLineTotal);
  if (!Number.isFinite(n) || n < 0) return null;
  return resolveUnitCostForLineTotal(quantity, n.toFixed(2));
}

/**
 * Save finalize:
 * - If line total is set and unit was derived for it (or pair inconsistent at 2dp unit),
 *   preserve line total and resolve precise unit.
 * - If unit-led and consistent at 2dp, keep 2dp unit + PE line.
 */
export function finalizePoLineForSave(
  quantity: number | string,
  unitCost: number | string,
  lineTotal?: number | string | null,
): { unitCost: string; lineTotal: string } {
  const qty = new Decimal(quantity || 0);
  if (qty.lte(0)) {
    return { unitCost: '0.00', lineTotal: '0.00' };
  }
  const unitRaw = String(unitCost ?? '').trim();
  const lineRaw = lineTotal == null ? '' : String(lineTotal).trim();

  if (lineRaw !== '') {
    const line = new Decimal(lineRaw);
    if (line.isFinite() && line.gte(0)) {
      const target = line.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
      // Prefer preserving entered/saved line total whenever present
      if (unitRaw !== '' && isPoLineMoneyConsistent(quantity, unitRaw, target)) {
        return { unitCost: unitRaw.includes('.') ? unitRaw : formatPoUnitCost(unitRaw), lineTotal: target };
      }
      return syncPoLineFromEnteredTotal(quantity, target);
    }
  }

  const unit2 = formatPoUnitCost(unitRaw || 0);
  return { unitCost: unit2, lineTotal: poLineTotal(quantity, unit2) };
}
