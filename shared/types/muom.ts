// Multi-Unit of Measure (MUoM) shared types
// These types define a simple, systematic way to derive unit costs and selling prices
// for multiple units of measure based on the cost of a whole carton (or any chosen base UoM).

export type RoundingMode =
  | 'ROUND_HALF_UP'
  | 'ROUND_HALF_DOWN'
  | 'ROUND_HALF_EVEN'
  | 'ROUND_UP'
  | 'ROUND_DOWN';

// Defines an individual UoM for a product, expressed as a fraction of the base UoM.
// Example: if base is CARTON then:
// - CARTON factor = 1
// - HALF_CARTON factor = 0.5
// - BOX factor = 0.1 (if 10 boxes per carton)
// - PIECE factor = 1/120 (if 120 pieces per carton)
export interface MuoMUnit {
  // Link to UoM master record (shared/zod/uom.ts) if available
  uomId?: string;
  // Human-friendly label when uomId is not present
  name?: string;

  // Fraction of the base UoM represented by this unit. Must be > 0.
  // costForThisUom = baseCartonCost * factor
  factor: number;

  // Optional per-UoM multiplier applied on cost to derive selling price.
  // If not provided, global defaultMultiplier is used.
  // sellingPrice = costForThisUom * (overrideMultiplier ?? defaultMultiplier)
  priceMultiplierOverride?: number; // e.g., 1.20 for +20%

  // If present, this price takes precedence over calculated price.
  priceOverride?: number | null;

  // If present, this cost takes precedence over calculated cost (baseCost * factor).
  costOverride?: number | null;
}

export interface ComputeUomPricesInput {
  // The cost of ONE base UoM (e.g., cost of a whole carton)
  baseCost: number; // currency amount

  // A display name for the base UoM (e.g., 'CARTON') — optional helper for reporting
  baseUomName?: string;

  // UoMs defined as fractions of the base
  units: MuoMUnit[];

  // Default multiplier applied when a unit does not specify an override.
  // Example: 1.20 = 20% markup; default 1.20
  defaultMultiplier?: number;

  // Currency rounding options (UGX has 0 fractional digits by default)
  currencyDecimals?: number; // default 0
  roundingMode?: RoundingMode; // default ROUND_HALF_UP
}

export interface UomPriceRow {
  uomId?: string;
  name?: string;
  factor: number; // fraction of base
  unitCost: number; // derived cost for this UoM
  sellingPrice: number; // final price after multiplier/override
  usedMultiplier: number; // the multiplier that produced sellingPrice (or 1 if override used)
}

export interface ComputeUomPricesResult {
  baseUomName?: string;
  baseCost: number;
  rows: UomPriceRow[];
}
