/**
 * PricingEngine — canonical document total calculator.
 *
 * ARCHITECTURAL LAW:
 * All line totals and document totals for POs, GRNs, Supplier Invoices,
 * and the posting engine MUST use these methods.
 *
 * UI code is FORBIDDEN from computing qty × cost directly.
 * The backend is FORBIDDEN from deriving totals from supplier-supplied values.
 *
 * This ensures that inventory valuation, GR/IR clearing, and Accounts Payable
 * always use the same arithmetic and never diverge.
 */

import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export interface PricingLine {
  /** Quantity in display (selling/receiving) units */
  quantity: number | string;
  /** Unit cost in base currency */
  unitCost: number | string;
}

export class PricingEngine {
  static calculateBaseQuantity(
    enteredQuantity: number | string,
    factorToBase: number | string,
  ): Decimal {
    return new Decimal(enteredQuantity)
      .times(new Decimal(factorToBase))
      .toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
  }

  static normalizeDisplayUnitCost(
    enteredUnitCost: number | string,
    factorToBase: number | string,
  ): Decimal {
    return new Decimal(enteredUnitCost)
      .div(new Decimal(factorToBase))
      .toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
  }

  static denormalizeBaseUnitCost(
    baseUnitCost: number | string,
    factorToBase: number | string,
  ): Decimal {
    return new Decimal(baseUnitCost)
      .times(new Decimal(factorToBase))
      .toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
  }

  static calculateDocumentLineFromBase(
    baseQuantity: number | string,
    baseUnitCost: number | string,
  ): Decimal {
    return new Decimal(baseQuantity)
      .times(new Decimal(baseUnitCost))
      .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  }

  /**
   * Compute a single line total: qty × unitCost.
   * Returns a Decimal rounded to 4 decimal places (sub-cent precision for aggregation).
   *
   * Used by: PO line items, GRN line items, Supplier Invoice lines, posting engine.
   */
  static calculateLineTotal(
    quantity: number | string,
    unitCost: number | string,
  ): Decimal {
    return new Decimal(quantity)
      .times(new Decimal(unitCost))
      .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  }

  /**
   * Compute document total: sum of all line totals, rounded to 2dp for currency output.
   *
   * Used by: PO total, GRN total, Supplier Invoice computed total.
   */
  static calculateDocumentTotal(lines: PricingLine[]): Decimal {
    const sum = lines.reduce(
      (acc, line) =>
        acc.plus(PricingEngine.calculateLineTotal(line.quantity, line.unitCost)),
      new Decimal(0),
    );
    return sum.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  /**
   * Compute the variance between the GRN-computed total and a supplier-reported total.
   *
   * variance > 0 → supplier billed LESS than we received (favorable: discount/rounding)
   * variance < 0 → supplier billed MORE than we received (unfavorable: price dispute)
   *
   * Returns Decimal rounded to 2dp.
   */
  static calculateVariance(
    grnComputedTotal: number | string | Decimal,
    supplierReportedTotal: number | string | Decimal,
  ): Decimal {
    return new Decimal(grnComputedTotal)
      .minus(new Decimal(supplierReportedTotal))
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  /**
   * Returns true when the absolute variance is larger than the tolerance.
   * Default tolerance: 0.005 (half-cent) to absorb pure IEEE-754 noise.
   */
  static hasVariance(
    grnComputedTotal: number | string | Decimal,
    supplierReportedTotal: number | string | Decimal,
    tolerance = 0.005,
  ): boolean {
    const variance = PricingEngine.calculateVariance(
      grnComputedTotal,
      supplierReportedTotal,
    );
    return variance.abs().greaterThan(new Decimal(tolerance));
  }
}
