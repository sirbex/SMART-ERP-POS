import { z } from 'zod';

/**
 * UoM Validation Schemas
 * Comprehensive validation for Unit of Measure operations
 */

// ============================================================
// UoM Category Validators
// ============================================================

export const createUoMCategorySchema = z.object({
  name: z.string()
    .min(1, 'Category name is required')
    .max(100, 'Category name too long')
    .trim(),
  description: z.string()
    .max(500, 'Description too long')
    .optional()
    .nullable(),
});

export const updateUoMCategorySchema = createUoMCategorySchema.partial();

// ============================================================
// Unit of Measure Validators
// ============================================================

export const createUnitOfMeasureSchema = z.object({
  categoryId: z.string().cuid('Invalid category ID'),
  name: z.string()
    .min(1, 'Unit name is required')
    .max(100, 'Unit name too long')
    .trim(),
  abbreviation: z.string()
    .min(1, 'Abbreviation is required')
    .max(20, 'Abbreviation too long')
    .trim(),
  conversionFactor: z.number()
    .positive('Conversion factor must be positive')
    .finite('Conversion factor must be a valid number'),
  isBase: z.boolean().default(false),
  description: z.string()
    .max(500, 'Description too long')
    .optional()
    .nullable(),
});

export const updateUnitOfMeasureSchema = z.object({
  name: z.string()
    .min(1, 'Unit name is required')
    .max(100, 'Unit name too long')
    .trim()
    .optional(),
  abbreviation: z.string()
    .min(1, 'Abbreviation is required')
    .max(20, 'Abbreviation too long')
    .trim()
    .optional(),
  conversionFactor: z.number()
    .positive('Conversion factor must be positive')
    .finite('Conversion factor must be a valid number')
    .optional(),
  isBase: z.boolean().optional(),
  description: z.string()
    .max(500, 'Description too long')
    .optional()
    .nullable(),
  isActive: z.boolean().optional(),
});

// ============================================================
// Product UoM Validators
// ============================================================

export const createProductUoMSchema = z.object({
  productId: z.string().cuid('Invalid product ID'),
  uomId: z.string().cuid('Invalid UoM ID'),
  conversionFactor: z.number()
    .positive('Conversion factor must be positive')
    .finite('Conversion factor must be a valid number'),
  unitPrice: z.number()
    .nonnegative('Unit price cannot be negative')
    .finite('Unit price must be a valid number')
    .optional()
    .nullable(),
  isDefault: z.boolean().default(false),
  isSaleAllowed: z.boolean().default(true),
  isPurchaseAllowed: z.boolean().default(true),
  barcode: z.string()
    .max(100, 'Barcode too long')
    .optional()
    .nullable(),
  sortOrder: z.number()
    .int('Sort order must be an integer')
    .nonnegative('Sort order cannot be negative')
    .default(0),
});

export const updateProductUoMSchema = z.object({
  conversionFactor: z.number()
    .positive('Conversion factor must be positive')
    .finite('Conversion factor must be a valid number')
    .optional(),
  unitPrice: z.number()
    .nonnegative('Unit price cannot be negative')
    .finite('Unit price must be a valid number')
    .optional()
    .nullable(),
  isDefault: z.boolean().optional(),
  isSaleAllowed: z.boolean().optional(),
  isPurchaseAllowed: z.boolean().optional(),
  barcode: z.string()
    .max(100, 'Barcode too long')
    .optional()
    .nullable(),
  sortOrder: z.number()
    .int('Sort order must be an integer')
    .nonnegative('Sort order cannot be negative')
    .optional(),
});

// Bulk update prices for multiple UoMs
export const bulkUpdateUoMPricesSchema = z.object({
  productId: z.string().cuid('Invalid product ID'),
  prices: z.array(z.object({
    uomId: z.string().cuid('Invalid UoM ID'),
    unitPrice: z.number()
      .nonnegative('Unit price cannot be negative')
      .finite('Unit price must be a valid number'),
  })).min(1, 'At least one price must be provided'),
});

// Setup product with multiple UoMs and prices
export const setupProductUoMsSchema = z.object({
  productId: z.string().cuid('Invalid product ID'),
  baseUoMId: z.string().cuid('Invalid base UoM ID'),
  uoms: z.array(z.object({
    uomId: z.string().cuid('Invalid UoM ID'),
    conversionFactor: z.number()
      .positive('Conversion factor must be positive')
      .finite('Conversion factor must be a valid number'),
    unitPrice: z.number()
      .nonnegative('Unit price cannot be negative')
      .finite('Unit price must be a valid number'),
    isDefault: z.boolean().default(false),
    isSaleAllowed: z.boolean().default(true),
    isPurchaseAllowed: z.boolean().default(true),
    barcode: z.string()
      .max(100, 'Barcode too long')
      .optional()
      .nullable(),
  })).min(1, 'At least one UoM must be provided')
    .refine(
      (uoms) => uoms.filter((u) => u.isDefault).length === 1,
      { message: 'Exactly one UoM must be marked as default' }
    ),
});

// ============================================================
// Type Exports
// ============================================================

export type CreateUoMCategoryInput = z.infer<typeof createUoMCategorySchema>;
export type UpdateUoMCategoryInput = z.infer<typeof updateUoMCategorySchema>;
export type CreateUnitOfMeasureInput = z.infer<typeof createUnitOfMeasureSchema>;
export type UpdateUnitOfMeasureInput = z.infer<typeof updateUnitOfMeasureSchema>;
export type CreateProductUoMInput = z.infer<typeof createProductUoMSchema>;
export type UpdateProductUoMInput = z.infer<typeof updateProductUoMSchema>;
export type BulkUpdateUoMPricesInput = z.infer<typeof bulkUpdateUoMPricesSchema>;
export type SetupProductUoMsInput = z.infer<typeof setupProductUoMsSchema>;
