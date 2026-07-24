/**
 * Service vs inventory product rules (restaurant menu dishes + fees).
 * Pure helpers — used by Product form UX, create/update save, and proofs.
 */

export type CatalogProductType = 'inventory' | 'consumable' | 'service';

export function isServiceProductType(
  productType: string | null | undefined,
): boolean {
  return String(productType || '').toLowerCase() === 'service';
}

/** How createSale should handle inventory for one sale line. */
export type SaleStockDeductionPlan =
  | { kind: 'skip' }
  | { kind: 'parent' }
  | { kind: 'ingredients' };

/**
 * Parent × recipe matrix at payment (not KOT):
 * | Parent type           | Active recipe? | Stock at pay                     |
 * | inventory / consumable| no             | deduct parent                    |
 * | inventory / consumable| yes            | deduct ingredient lines (FEFO)   |
 * | service               | no             | skip stock                       |
 * | service               | yes            | deduct ingredient lines (FEFO)   |
 */
export function planSaleStockDeduction(
  parentProductType: string,
  hasRecipeLines: boolean,
): SaleStockDeductionPlan {
  const type = (parentProductType || 'inventory').toLowerCase();
  if (type === 'service' && !hasRecipeLines) return { kind: 'skip' };
  if (hasRecipeLines) return { kind: 'ingredients' };
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
};

/**
 * Normalize create/update payload when type is service:
 * clears supplier, expiry, reorder; forces STANDARD costing.
 * Does not invent a selling price — caller must set menu price.
 */
export function normalizeProductSaveForType<T extends ProductSaveShape>(data: T): T {
  if (!isServiceProductType(data.productType)) return data;
  const clears = serviceInventoryClearsNumeric();
  return {
    ...data,
    productType: 'service',
    ...clears,
  };
}

/** Which Product form sections are active for a given type. */
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
  };
}
