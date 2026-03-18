import Decimal from 'decimal.js';
import { computeUomPrices } from '@shared/utils/uom-pricing';

// Types aligned with shared zod schemas
export interface ProductUomInput {
  id?: string;
  uomId: string;
  conversionFactor: number;
  isDefault?: boolean;
  priceOverride?: number | null;
  costOverride?: number | null;
}

export interface ApplyAutoUomPricingOptions {
  baseCost: number; // Cost of base UoM (e.g., carton)
  baseSelling?: number; // Optional selling price of base; if present, used to infer defaultMultiplier
  currencyDecimals?: number; // Defaults to 0 for UGX
}

/**
 * Apply auto-calculated UoM cost/price for entries with missing overrides, ensuring BE/FE parity.
 * - Uses computeUomPrices shared utility to derive values.
 * - If baseSelling is provided, defaultMultiplier = baseSelling / baseCost; otherwise 1.2.
 */
export function applyAutoUomPricing(
  uoms: ProductUomInput[],
  options: ApplyAutoUomPricingOptions
): ProductUomInput[] {
  const { baseCost, baseSelling, currencyDecimals = 0 } = options;
  if (!baseCost || baseCost <= 0) return uoms;

  const defaultMultiplier =
    baseSelling && baseSelling > 0 ? new Decimal(baseSelling).div(baseCost).toNumber() : 1.2;

  const computed = computeUomPrices({
    baseCost,
    units: uoms.map((u) => ({
      name: u.uomId,
      factor: u.conversionFactor,
      costOverride: u.costOverride,
      priceOverride: u.priceOverride,
    })),
    defaultMultiplier,
    currencyDecimals,
  });

  const byUomId: Record<string, { unitCost: number; sellingPrice: number }> = {};
  computed.rows.forEach((r, idx) => {
    // Match back by order since we used mapping order; name carries uomId
    const uom = uoms[idx];
    byUomId[uom.uomId] = { unitCost: r.unitCost, sellingPrice: r.sellingPrice };
  });

  return uoms.map((u) => {
    const auto = byUomId[u.uomId];
    if (!auto) return u;
    return {
      ...u,
      costOverride: u.costOverride == null ? auto.unitCost : u.costOverride,
      priceOverride: u.priceOverride == null ? auto.sellingPrice : u.priceOverride,
    };
  });
}
