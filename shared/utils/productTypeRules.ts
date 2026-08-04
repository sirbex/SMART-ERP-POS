/**
 * Service vs inventory product rules (restaurant menu dishes + fees).
 * Pure helpers — used by Product form UX, create/update save, and proofs.
 */

export type CatalogProductType = 'inventory' | 'consumable' | 'service';

/**
 * When a parent recipe’s ingredients are reserved for inventory:
 * - AT_SALE — kit / cook-to-order (explode on payment)
 * - AT_PRODUCTION — manufacture / cook-to-stock (explode only on production batch; sale deducts parent)
 */
export type RecipeUsageMode = 'AT_SALE' | 'AT_PRODUCTION';

export function isServiceProductType(
  productType: string | null | undefined,
): boolean {
  return String(productType || '').toLowerCase() === 'service';
}

export function normalizeRecipeUsageMode(
  mode: string | null | undefined,
): RecipeUsageMode {
  return String(mode || 'AT_SALE').toUpperCase() === 'AT_PRODUCTION'
    ? 'AT_PRODUCTION'
    : 'AT_SALE';
}

/** How createSale should handle inventory for one sale line. */
export type SaleStockDeductionPlan =
  | { kind: 'skip' }
  | { kind: 'parent' }
  | { kind: 'ingredients' };

/**
 * Parent × recipe matrix at payment (not KOT):
 * | Parent type           | Recipe at sale? | Stock at pay                     |
 * | inventory / consumable| no (or production-only BOM) | deduct parent             |
 * | inventory / consumable| yes AT_SALE     | deduct ingredient lines (FEFO)   |
 * | service               | no              | skip stock                       |
 * | service               | yes AT_SALE     | deduct ingredient lines (FEFO)   |
 *
 * @param recipeExplodesAtSale — true only when active recipe has usage_mode AT_SALE with lines
 */
export function planSaleStockDeduction(
  parentProductType: string,
  recipeExplodesAtSale: boolean,
): SaleStockDeductionPlan {
  const type = (parentProductType || 'inventory').toLowerCase();
  if (type === 'service' && !recipeExplodesAtSale) return { kind: 'skip' };
  if (recipeExplodesAtSale) return { kind: 'ingredients' };
  return { kind: 'parent' };
}

/** Inventory / procurement fields that must not apply to a service parent. */
export function serviceInventoryClearsNumeric() {
  return {
    trackExpiry: false as const,
    minDaysBeforeExpirySale: 0,
    reorderLevel: 0,
    reorderQuantity: 0,
    preferredSupplierId: null as string | null,
    supplierProductCode: null as string | null,
    purchaseUomId: null as string | null,
    leadTimeDays: 0,
    autoUpdatePrice: false as const,
    pricingFormula: null as string | null,
    costingMethod: 'STANDARD' as const,
  };
}

/** Form-string version for ProductForm field clears when switching to Service. */
export function serviceInventoryClearsForm() {
  return {
    trackExpiry: false as const,
    minDaysBeforeExpirySale: '0',
    reorderLevel: '0',
    reorderQuantity: '0',
    preferredSupplierId: '',
    supplierProductCode: '',
    purchaseUomId: '',
    leadTimeDays: '0',
    autoUpdatePrice: false as const,
  };
}

export type ProductSaveShape = {
  productType?: CatalogProductType | string;
  trackExpiry?: boolean;
  minDaysBeforeExpirySale?: number;
  reorderLevel?: number;
  reorderQuantity?: number;
  preferredSupplierId?: string | null;
  supplierProductCode?: string | null;
  purchaseUomId?: string | null;
  leadTimeDays?: number;
  autoUpdatePrice?: boolean;
  pricingFormula?: string | null;
  costingMethod?: string;
  costPrice?: number;
  sellingPrice?: number;
  isPreparedFood?: boolean;
  isBuffetCover?: boolean;
};

/**
 * Normalize create/update payload when type is service:
 * clears supplier, expiry, reorder; forces STANDARD costing.
 * Does not invent a selling price — caller must set menu price.
 * Prepared food flag is cleared for service parents (cannot be stocked FG).
 */
export function normalizeProductSaveForType<T extends ProductSaveShape>(data: T): T {
  if (!isServiceProductType(data.productType)) return data;
  const clears = serviceInventoryClearsNumeric();
  return {
    ...data,
    productType: 'service',
    isPreparedFood: false,
    ...clears,
  };
}

/**
 * Defaults when marking a product as kitchen prepared food (Phase 2).
 * Does not force selling price or name.
 */
export function prepareFoodCatalogDefaults(): {
  productType: 'inventory';
  isPreparedFood: true;
  recommendedRecipeUsageMode: RecipeUsageMode;
} {
  return {
    productType: 'inventory',
    isPreparedFood: true,
    recommendedRecipeUsageMode: 'AT_PRODUCTION',
  };
}

/** Which ProductForm sections are active for a given type. */
export function productFormSectionVisibility(productType: string | null | undefined) {
  const service = isServiceProductType(productType);
  return {
    showStockLevels: !service,
    showProcurement: !service,
    showPricingFormula: !service,
    showInventorySnapshot: !service,
    showCostingMethod: !service,
    showExpiry: !service,
    showActiveOnlyAvailability: service,
    showPreparedFood: !service,
  };
}
