import { ProductCreateSchema, UpdateProductSchema } from '@shared/zod/product';
import type { CostingMethod } from '@shared/zod/product';
import type { ProductFormValues } from '@/components/products/ProductForm';
import type { CreateProductInput } from '@/types/inputs';

export type ProductValidationErrors = Partial<Record<keyof ProductFormValues, string>>;

/** DOM ids for focus management after validation failures. */
export const PRODUCT_FORM_FIELD_DOM_IDS: Partial<Record<keyof ProductFormValues, string>> = {
  name: 'product-name',
  sku: 'product-sku',
  barcode: 'product-barcode',
  genericName: 'generic-name',
  description: 'product-description',
  productType: 'product-type',
  costPrice: 'cost-price',
  sellingPrice: 'selling-price',
  costingMethod: 'costing-method',
  taxRate: 'tax-rate',
  pricingFormula: 'pricing-formula',
  reorderLevel: 'reorder-level',
  minDaysBeforeExpirySale: 'min-days-expiry',
  preferredSupplierId: 'preferred-supplier',
  supplierProductCode: 'supplier-product-code',
  purchaseUomId: 'purchase-uom',
  leadTimeDays: 'lead-time-days',
  reorderQuantity: 'reorder-quantity',
};

export function focusFirstProductValidationError(errors: ProductValidationErrors): void {
  const firstField = Object.keys(errors)[0] as keyof ProductFormValues | undefined;
  if (!firstField) return;
  const domId = PRODUCT_FORM_FIELD_DOM_IDS[firstField];
  if (!domId) return;
  requestAnimationFrame(() => {
    const el = document.getElementById(domId);
    el?.focus();
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

export type MasterUomOption = { id: string; name: string; symbol?: string | null };

export type BuildCreateProductInputOptions = {
  stockUomId: string;
  masterUoms: MasterUomOption[];
  purchaseConversionFactor: number;
};

/** Default base stock UoM when the user has not picked one explicitly. */
export function resolveDefaultStockUomId(
  stockUomId: string,
  masterUoms: MasterUomOption[],
): string {
  return (
    stockUomId ||
    masterUoms.find((u) => u.name.toUpperCase() === 'EACH')?.id ||
    masterUoms.find((u) => u.name.toUpperCase() === 'PIECE')?.id ||
    masterUoms[0]?.id ||
    ''
  );
}

export type PurchaseUomOption = { id: string; name: string; symbol?: string | null };

/** SSOT: Purchase UoM dropdown options — configured Product UoMs only when restricted. */
export function buildPurchaseUomOptions(input: {
  restrictToConfigured: boolean;
  configuredProductUoms?: PurchaseUomOption[];
  masterUoms?: PurchaseUomOption[];
  currentPurchaseUomId?: string;
}): PurchaseUomOption[] {
  const { restrictToConfigured, configuredProductUoms, masterUoms, currentPurchaseUomId } = input;

  if (restrictToConfigured) {
    const configured = configuredProductUoms ?? [];
    if (
      currentPurchaseUomId &&
      !configured.some((u) => u.id === currentPurchaseUomId) &&
      masterUoms?.some((u) => u.id === currentPurchaseUomId)
    ) {
      const orphan = masterUoms!.find((u) => u.id === currentPurchaseUomId)!;
      return [
        ...configured,
        {
          ...orphan,
          name: `${orphan.name} (not in Product UoMs — repair required)`,
        },
      ];
    }
    return configured;
  }
  return masterUoms ?? [];
}

/**
 * SSOT mapper: ProductForm values + master UoM context → API create payload.
 * Preserves unitOfMeasure and purchase conversion factor (Quick Create, Manual GR, etc.).
 */
export function buildCreateProductInput(
  values: ProductFormValues,
  options: BuildCreateProductInputOptions,
):
  | { ok: true; data: CreateProductInput }
  | { ok: false; errors: ProductValidationErrors } {
  const result = validateProductValues(values);
  if (!result.valid) {
    return { ok: false, errors: result.errors };
  }

  const resolvedStockUomId = resolveDefaultStockUomId(options.stockUomId, options.masterUoms);
  const stockUom = options.masterUoms.find((u) => u.id === resolvedStockUomId);
  const purchaseUomDiffers =
    !!values.purchaseUomId &&
    !!resolvedStockUomId &&
    values.purchaseUomId !== resolvedStockUomId;
  const factor = purchaseUomDiffers ? options.purchaseConversionFactor : 1;

  return {
    ok: true,
    data: {
      name: values.name.trim(),
      sku: values.sku.trim(),
      barcode: values.barcode?.trim() || undefined,
      description: values.description?.trim() || undefined,
      category: values.category?.trim() || undefined,
      productType: values.productType || 'inventory',
      unitOfMeasure: stockUom?.name || 'EACH',
      conversionFactor: factor,
      costPrice: parseFloat(String(values.costPrice)) || 0,
      sellingPrice: parseFloat(String(values.sellingPrice)) || 0,
      costingMethod: values.costingMethod as 'FIFO' | 'AVCO' | 'STANDARD',
      isTaxable: values.isTaxable,
      taxRate: parseFloat(String(values.taxRate)) || 0,
      reorderLevel: parseFloat(String(values.reorderLevel)) || 0,
      trackExpiry: values.trackExpiry,
      isActive: values.isActive,
      availableInRestaurant: values.availableInRestaurant !== false,
      preferredSupplierId: values.preferredSupplierId || undefined,
      supplierProductCode: values.supplierProductCode?.trim() || undefined,
      purchaseUomId: values.purchaseUomId || undefined,
      leadTimeDays: parseInt(String(values.leadTimeDays), 10) || 0,
      reorderQuantity: parseFloat(String(values.reorderQuantity)) || 0,
    },
  };
}

// Convert form strings to proper types for Zod validation
function coerceToSchemaInput(values: ProductFormValues) {
  // Helper to safely convert form values to trimmed string
  const toStr = (val: string | boolean | undefined): string =>
    val != null ? String(val).trim() : '';
  const toStrOrUndefined = (val: string | boolean | undefined): string | undefined => {
    const s = val != null ? String(val).trim() : '';
    return s || undefined;
  };

  return {
    name: toStr(values.name),
    sku: toStr(values.sku),
    barcode: toStrOrUndefined(values.barcode),
    description: toStrOrUndefined(values.description),
    category: toStrOrUndefined(values.category),
    productType: (values.productType || 'inventory') as 'inventory' | 'consumable' | 'service',
    genericName: toStrOrUndefined(values.genericName),
    conversionFactor: 1, // Always 1 for base unit
    costPrice: parseFloat(String(values.costPrice || '0')) || 0,
    sellingPrice: parseFloat(String(values.sellingPrice || '0')) || 0,
    costingMethod: values.costingMethod as CostingMethod,
    isTaxable: !!values.isTaxable,
    taxRate: parseFloat(String(values.taxRate || '0')) || 0,
    pricingFormula: toStrOrUndefined(values.pricingFormula),
    autoUpdatePrice: !!values.autoUpdatePrice,
    reorderLevel: parseFloat(String(values.reorderLevel || '0')) || 0,
    trackExpiry: !!values.trackExpiry,
    minDaysBeforeExpirySale: parseInt(String(values.minDaysBeforeExpirySale || '0'), 10) || 0,
    isActive: !!values.isActive,
    availableInRestaurant: values.availableInRestaurant !== false,
    preferredSupplierId: toStrOrUndefined(values.preferredSupplierId),
    supplierProductCode: toStrOrUndefined(values.supplierProductCode),
    purchaseUomId: toStrOrUndefined(values.purchaseUomId),
    leadTimeDays: parseInt(String(values.leadTimeDays || '0'), 10) || 0,
    reorderQuantity: parseFloat(String(values.reorderQuantity || '0')) || 0,
  };
}

export function validateProductValues(values: ProductFormValues, mode: 'create' | 'update' = 'create') {
  const input = coerceToSchemaInput(values);
  const schema = mode === 'update' ? UpdateProductSchema : ProductCreateSchema;
  const result = schema.safeParse(input);

  if (result.success) {
    return { valid: true as const, data: result.data, errors: {} as ProductValidationErrors };
  }

  const errors: ProductValidationErrors = {};
  for (const issue of result.error.issues) {
    const path = issue.path[0];
    if (typeof path === 'string') {
      errors[path as keyof ProductFormValues] = issue.message;
    }
  }
  return { valid: false as const, errors };
}
