// Multi-Unit of Measure (MUoM) shared types
// Canonical rule: factors are always stored from larger unit to smaller/base unit.
// Example: 1 PACKET = 12 TABLET, so PACKET factor = 12 while TABLET = 1.

export type RoundingMode =
  | 'ROUND_HALF_UP'
  | 'ROUND_HALF_DOWN'
  | 'ROUND_HALF_EVEN'
  | 'ROUND_UP'
  | 'ROUND_DOWN';

// Defines an individual UoM for a product, expressed as its factor to the base UoM.
// Example: if base is TABLET then:
// - TABLET factor = 1
// - BOX factor = 12
// - CARTON factor = 120
export interface MuoMUnit {
  // Link to UoM master record (shared/zod/uom.ts) if available
  uomId?: string;
  // Human-friendly label when uomId is not present
  name?: string;

  // Count of base units represented by this display UoM. Must be >= 1.
  // costForThisUom = baseUnitCost * factor
  factor: number;

  // Optional per-UoM multiplier applied on cost to derive selling price.
  // If not provided, global defaultMultiplier is used.
  // sellingPrice = costForThisUom * (overrideMultiplier ?? defaultMultiplier)
  priceMultiplierOverride?: number; // e.g., 1.20 for +20%

  // If present, this price takes precedence over calculated price.
  priceOverride?: number | null;

  // If present, this cost takes precedence over calculated cost (baseUnitCost * factor).
  costOverride?: number | null;
}

export interface ComputeUomPricesInput {
  // The cost of ONE base UoM (e.g., one tablet / one piece)
  baseCost: number; // currency amount

  // A display name for the base UoM (e.g., 'TABLET') — optional helper for reporting
  baseUomName?: string;

  // UoMs defined by their larger->base factor
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
  factor: number; // larger/display unit -> base factor
  unitCost: number; // derived cost for this UoM
  sellingPrice: number; // final price after multiplier/override
  usedMultiplier: number; // the multiplier that produced sellingPrice (or 1 if override used)
}

export interface ComputeUomPricesResult {
  baseUomName?: string;
  baseCost: number;
  rows: UomPriceRow[];
}
