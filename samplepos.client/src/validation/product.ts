import { ProductCreateSchema } from '@shared/zod/product';
import type { CostingMethod } from '@shared/zod/product';
import type { ProductFormValues } from '@/components/products/ProductForm';

export type ProductValidationErrors = Partial<Record<keyof ProductFormValues, string>>;

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
  };
}

export function validateProductValues(values: ProductFormValues) {
  const input = coerceToSchemaInput(values);
  const result = ProductCreateSchema.safeParse(input);

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
