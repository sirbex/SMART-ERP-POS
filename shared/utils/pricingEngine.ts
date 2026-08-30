/**
 * PricingEngine SSOT — document line/document totals for PO, GRN, supplier bills.
 * Server and client must use this arithmetic only (no ad-hoc qty × cost).
 */
import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export interface PricingLine {
  quantity: number | string;
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

  /** Line total: qty × unitCost at 4dp (aggregation precision). */
  static calculateLineTotal(
    quantity: number | string,
    unitCost: number | string,
  ): Decimal {
    return new Decimal(quantity)
      .times(new Decimal(unitCost))
      .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  }

  /** Document total: sum of line totals, 2dp currency. */
  static calculateDocumentTotal(lines: PricingLine[]): Decimal {
    const sum = lines.reduce(
      (acc, line) =>
        acc.plus(PricingEngine.calculateLineTotal(line.quantity, line.unitCost)),
      new Decimal(0),
    );
    return sum.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  static calculateVariance(
    grnComputedTotal: number | string | Decimal,
    supplierReportedTotal: number | string | Decimal,
  ): Decimal {
    return new Decimal(grnComputedTotal)
      .minus(new Decimal(supplierReportedTotal))
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

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
