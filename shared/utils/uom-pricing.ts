import Decimal from 'decimal.js';
import type {
  ComputeUomPricesInput,
  ComputeUomPricesResult,
  UomPriceRow,
  RoundingMode,
} from '../types/muom';

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
 * Compute MUoM-derived unit costs and selling prices from a base cost (e.g., carton cost).
 *
 * Conventions:
 * - Each unit factor is a fraction of the base UoM (carton). costForUnit = baseCost * factor.
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
 * Helper for defining common carton-based MUoMs using counts.
 * Provide counts of components per carton to derive fractional factors automatically.
 *
 * Example:
 * makeCartonUoms({ cartons: 1, halfCartons: 2, boxesPerCarton: 10, piecesPerCarton: 120 })
 * returns factors: CARTON(1), HALF_CARTON(0.5), BOX(0.1), PIECE(1/120)
 */
export function makeCartonUoms(options: {
  includeHalfCarton?: boolean;
  boxesPerCarton?: number; // e.g., 10 boxes in a carton => factor 0.1
  piecesPerCarton?: number; // e.g., 120 pieces in a carton => factor 1/120
}) {
  const result: { name: string; factor: number }[] = [];
  result.push({ name: 'CARTON', factor: 1 });
  if (options.includeHalfCarton) {
    result.push({ name: 'HALF_CARTON', factor: 0.5 });
  }
  if (options.boxesPerCarton && options.boxesPerCarton > 0) {
    result.push({ name: 'BOX', factor: 1 / options.boxesPerCarton });
  }
  if (options.piecesPerCarton && options.piecesPerCarton > 0) {
    result.push({ name: 'PIECE', factor: 1 / options.piecesPerCarton });
  }
  return result;
}
