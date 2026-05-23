/**
 * Sale posting integrity helpers (SALE-2026-4063 regression guards).
 */
import Decimal from 'decimal.js';
import { BusinessError } from '../../middleware/errorHandler.js';
import { Money } from '../../utils/money.js';

export function deriveUnitPriceFromLineTotal(lineTotal: number, quantity: number): number {
  if (quantity <= 0) return 0;
  return Money.toNumber(Money.round(new Decimal(lineTotal).dividedBy(quantity), 2));
}

export function assertSaleHeaderMatchesCalculatedTotal(
  providedTotal: number | undefined,
  calculatedTotal: Decimal,
): void {
  if (providedTotal === undefined || providedTotal === null) return;
  const provided = new Decimal(providedTotal);
  if (provided.minus(calculatedTotal).abs().greaterThan(0.02)) {
    throw new BusinessError(
      `Sale total ${provided.toFixed(2)} does not match priced line items ${calculatedTotal.toFixed(2)}. ` +
        'Reselect the customer, refresh cart prices, and try again.',
      'ERR_SALE_TOTAL_MISMATCH',
      {
        providedTotal: Money.toNumber(provided),
        calculatedTotal: Money.toNumber(calculatedTotal),
      },
    );
  }
}

export function assertSaleLineEconomicsConsistent(params: {
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  tolerance?: number;
}): { ok: boolean; message: string } {
  const tol = params.tolerance ?? 0.02;
  const implied = new Decimal(params.quantity).times(params.unitPrice);
  const stored = new Decimal(params.totalPrice);
  if (implied.minus(stored).abs().greaterThan(tol)) {
    return {
      ok: false,
      message: `unit×qty=${implied.toFixed(2)} != total_price=${stored.toFixed(2)}`,
    };
  }
  return { ok: true, message: 'line economics OK' };
}

export function assertAtCostMargin(params: {
  totalAmount: number;
  totalCost: number;
  maxMarginPct?: number;
}): { ok: boolean; message: string; marginPct: number } {
  const revenue = new Decimal(params.totalAmount);
  const cost = new Decimal(params.totalCost);
  if (revenue.lessThanOrEqualTo(0)) {
    return { ok: false, message: 'zero revenue', marginPct: 0 };
  }
  const marginPct = revenue.minus(cost).dividedBy(revenue).times(100).toNumber();
  const max = params.maxMarginPct ?? 2;
  if (marginPct > max) {
    return {
      ok: false,
      message: `margin ${marginPct.toFixed(2)}% exceeds at-cost max ${max}%`,
      marginPct,
    };
  }
  return { ok: true, message: 'at-cost margin OK', marginPct };
}
