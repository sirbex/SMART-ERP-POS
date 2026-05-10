import Decimal from 'decimal.js';
import type {
  ComputeUomPricesInput,
  ComputeUomPricesResult,
  UomPriceRow,
  RoundingMode,
} from '../types/muom.js';

// Map friendly rounding names to Decimal.js rounding constants
// Note: use numeric constants directly to avoid relying on Decimal namespace typing
const roundingMap: Record<RoundingMode, number> = {
  ROUND_HALF_UP: 4,
  ROUND_HALF_DOWN: 5,
  ROUND_HALF_EVEN: 6,
  ROUND_UP: 0,
  ROUND_DOWN: 1,
};

/**
 * Compute MUoM-derived unit costs and selling prices from a base-unit cost.
 *
 * Conventions:
 * - Each factor is the number of base units represented by the display UoM.
 *   Example: base TABLET, PACKET factor 12 => packetCost = baseCost * 12.
 * - Selling price = unitCost * (priceMultiplierOverride ?? defaultMultiplier).
 * - If a priceOverride is provided, it takes precedence and usedMultiplier is reported as 1.
 * - Values are rounded to currencyDecimals with roundingMode (UGX default: 0 decimals, HALF_UP).
 */
export function computeUomPrices(input: ComputeUomPricesInput): ComputeUomPricesResult {
  const defaultMultiplier = new Decimal(input.defaultMultiplier ?? 1.2); // 20% markup default
  const currencyDecimals = input.currencyDecimals ?? 0; // UGX: no fractional digits
  const roundingMode = roundingMap[input.roundingMode ?? 'ROUND_HALF_UP'];

  Decimal.set({ rounding: roundingMode });

  const baseCost = new Decimal(input.baseCost);

  if (!baseCost.isFinite()) {
    throw new Error(`Invalid base cost: ${input.baseCost}`);
  }

  const rows: UomPriceRow[] = input.units.map((u) => {
    const factor = new Decimal(u.factor ?? 1);
    if (!factor.isFinite() || factor.lte(0)) {
      throw new Error(`Invalid MUoM factor for ${u.name ?? u.uomId ?? 'uom'}: ${u.factor}`);
    }

    // Cost: use override if provided, otherwise derive from base
    const unitCost = u.costOverride != null
      ? new Decimal(u.costOverride)
      : baseCost.times(factor);

    // Price: use override or multiplier
    let sellingPrice: Decimal;
    let usedMultiplier = new Decimal(1);

    if (u.priceOverride != null) {
      sellingPrice = new Decimal(u.priceOverride);
    } else {
      const multiplier = new Decimal(u.priceMultiplierOverride ?? defaultMultiplier);
      sellingPrice = unitCost.times(multiplier);
      usedMultiplier = multiplier;
    }

    const unitCostRounded = unitCost.toDecimalPlaces(currencyDecimals);
    const sellingPriceRounded = sellingPrice.toDecimalPlaces(currencyDecimals);

    return {
      uomId: u.uomId,
      name: u.name,
      factor: factor.toNumber(),
      unitCost: unitCostRounded.toNumber(),
      sellingPrice: sellingPriceRounded.toNumber(),
      usedMultiplier: usedMultiplier.toNumber(),
    };
  });

  return {
    baseUomName: input.baseUomName,
    baseCost: baseCost.toDecimalPlaces(currencyDecimals).toNumber(),
    rows,
  };
}

/**
 * Helper for defining common pack hierarchies using the smallest stock unit as base.
 *
 * Example:
 * makeCartonUoms({ includeHalfCarton: true, boxesPerCarton: 10, piecesPerCarton: 120 })
 * returns factors: PIECE(1), BOX(12), HALF_CARTON(60), CARTON(120)
 */
export function makeCartonUoms(options: {
  includeHalfCarton?: boolean;
  boxesPerCarton?: number; // e.g., 10 boxes in a carton
  piecesPerCarton?: number; // e.g., 120 pieces in a carton
}) {
  const result: { name: string; factor: number }[] = [];
  const piecesPerCarton = options.piecesPerCarton && options.piecesPerCarton > 0
    ? options.piecesPerCarton
    : 1;
  result.push({ name: 'PIECE', factor: 1 });
  if (options.boxesPerCarton && options.boxesPerCarton > 0) {
    result.push({ name: 'BOX', factor: piecesPerCarton / options.boxesPerCarton });
  }
  if (options.includeHalfCarton) {
    result.push({ name: 'HALF_CARTON', factor: piecesPerCarton / 2 });
  }
  result.push({ name: 'CARTON', factor: piecesPerCarton });
  return result;
}
