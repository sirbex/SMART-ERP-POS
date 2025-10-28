import { z } from 'zod';

/**
 * Validation schemas for Unit of Measure (UoM) system
 * High precision validation with proper constraints
 */

// ============================================================================
// UoM Category Schemas
// ============================================================================

export const CreateUoMCategorySchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less')
    .trim(),
  description: z.string()
    .max(1000, 'Description must be 1000 characters or less')
    .optional()
    .nullable(),
  baseUoMId: z.string()
    .cuid('Invalid UoM ID')
    .optional()
    .nullable(),
});

export const UpdateUoMCategorySchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less')
    .trim()
    .optional(),
  description: z.string()
    .max(1000, 'Description must be 1000 characters or less')
    .optional()
    .nullable(),
  baseUoMId: z.string()
    .cuid('Invalid UoM ID')
    .optional()
    .nullable(),
  isActive: z.boolean().optional(),
});

// ============================================================================
// Unit of Measure Schemas
// ============================================================================

export const CreateUnitOfMeasureSchema = z.object({
  categoryId: z.string()
    .cuid('Invalid category ID'),
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less')
    .trim(),
  abbreviation: z.string()
    .min(1, 'Abbreviation is required')
    .max(20, 'Abbreviation must be 20 characters or less')
    .trim()
    .toUpperCase(),
  conversionFactor: z.number()
    .positive('Conversion factor must be positive')
    .finite('Conversion factor must be finite')
    .refine(val => val > 0, 'Conversion factor must be greater than zero')
    .refine(val => val <= 1000000, 'Conversion factor cannot exceed 1,000,000'),
  isBase: z.boolean()
    .default(false),
  description: z.string()
    .max(1000, 'Description must be 1000 characters or less')
    .optional()
    .nullable(),
});

export const UpdateUnitOfMeasureSchema = z.object({
  categoryId: z.string()
    .cuid('Invalid category ID')
    .optional(),
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less')
    .trim()
    .optional(),
  abbreviation: z.string()
    .min(1, 'Abbreviation is required')
    .max(20, 'Abbreviation must be 20 characters or less')
    .trim()
    .toUpperCase()
    .optional(),
  conversionFactor: z.number()
    .positive('Conversion factor must be positive')
    .finite('Conversion factor must be finite')
    .refine(val => val > 0, 'Conversion factor must be greater than zero')
    .refine(val => val <= 1000000, 'Conversion factor cannot exceed 1,000,000')
    .optional(),
  isBase: z.boolean().optional(),
  isActive: z.boolean().optional(),
  description: z.string()
    .max(1000, 'Description must be 1000 characters or less')
    .optional()
    .nullable(),
});

// ============================================================================
// Product UoM Association Schemas
// ============================================================================

export const CreateProductUoMSchema = z.object({
  productId: z.string()
    .cuid('Invalid product ID'),
  uomId: z.string()
    .cuid('Invalid UoM ID'),
  conversionFactor: z.number()
    .positive('Conversion factor must be positive')
    .finite('Conversion factor must be finite')
    .refine(val => val > 0, 'Conversion factor must be greater than zero')
    .refine(val => val <= 1000000, 'Conversion factor cannot exceed 1,000,000'),
  priceMultiplier: z.number()
    .positive('Price multiplier must be positive')
    .finite('Price multiplier must be finite')
    .default(1)
    .refine(val => val > 0, 'Price multiplier must be greater than zero')
    .refine(val => val <= 1000, 'Price multiplier cannot exceed 1,000'),
  unitPrice: z.number()
    .nonnegative('Unit price must be non-negative')
    .finite('Unit price must be finite')
    .refine(val => val >= 0, 'Unit price cannot be negative')
    .refine(val => val <= 99999999999.99, 'Unit price exceeds maximum allowed value')
    .optional()
    .nullable()
    .describe('Manual price override for this UoM. If null, price will be calculated from base price * priceMultiplier'),
  isDefault: z.boolean()
    .default(false),
  isSaleAllowed: z.boolean()
    .default(true),
  isPurchaseAllowed: z.boolean()
    .default(true),
  barcode: z.string()
    .max(100, 'Barcode must be 100 characters or less')
    .trim()
    .optional()
    .nullable(),
  sortOrder: z.number()
    .int('Sort order must be an integer')
    .nonnegative('Sort order must be non-negative')
    .default(0),
});

export const UpdateProductUoMSchema = z.object({
  conversionFactor: z.number()
    .positive('Conversion factor must be positive')
    .finite('Conversion factor must be finite')
    .refine(val => val > 0, 'Conversion factor must be greater than zero')
    .refine(val => val <= 1000000, 'Conversion factor cannot exceed 1,000,000')
    .optional(),
  priceMultiplier: z.number()
    .positive('Price multiplier must be positive')
    .finite('Price multiplier must be finite')
    .refine(val => val > 0, 'Price multiplier must be greater than zero')
    .refine(val => val <= 1000, 'Price multiplier cannot exceed 1,000')
    .optional(),
  unitPrice: z.number()
    .nonnegative('Unit price must be non-negative')
    .finite('Unit price must be finite')
    .refine(val => val >= 0, 'Unit price cannot be negative')
    .refine(val => val <= 99999999999.99, 'Unit price exceeds maximum allowed value')
    .optional()
    .nullable()
    .describe('Manual price override for this UoM. If null, price will be calculated from base price * priceMultiplier'),
  isDefault: z.boolean().optional(),
  isSaleAllowed: z.boolean().optional(),
  isPurchaseAllowed: z.boolean().optional(),
  barcode: z.string()
    .max(100, 'Barcode must be 100 characters or less')
    .trim()
    .optional()
    .nullable(),
  sortOrder: z.number()
    .int('Sort order must be an integer')
    .nonnegative('Sort order must be non-negative')
    .optional(),
});

export const BulkAssignUoMsSchema = z.object({
  productId: z.string()
    .cuid('Invalid product ID'),
  uoms: z.array(z.object({
    uomId: z.string()
      .cuid('Invalid UoM ID'),
    conversionFactor: z.number()
      .positive('Conversion factor must be positive'),
    priceMultiplier: z.number()
      .positive('Price multiplier must be positive')
      .default(1),
    unitPrice: z.number()
      .nonnegative('Unit price must be non-negative')
      .finite('Unit price must be finite')
      .optional()
      .nullable()
      .describe('Manual price override for this UoM'),
    isDefault: z.boolean()
      .default(false),
    isSaleAllowed: z.boolean()
      .default(true),
    isPurchaseAllowed: z.boolean()
      .default(true),
    sortOrder: z.number()
      .int()
      .nonnegative()
      .default(0),
  }))
    .min(1, 'At least one UoM is required')
    .refine(
      uoms => uoms.filter(u => u.isDefault).length <= 1,
      'Only one UoM can be set as default'
    ),
});

// ============================================================================
// UoM Conversion Request Schemas
// ============================================================================

export const ConvertUoMSchema = z.object({
  productId: z.string()
    .cuid('Invalid product ID'),
  quantity: z.number()
    .positive('Quantity must be positive')
    .finite('Quantity must be finite'),
  fromUoMId: z.string()
    .cuid('Invalid source UoM ID'),
  toUoMId: z.string()
    .cuid('Invalid target UoM ID'),
});

export const CalculatePriceSchema = z.object({
  productId: z.string()
    .cuid('Invalid product ID'),
  quantity: z.number()
    .positive('Quantity must be positive')
    .finite('Quantity must be finite'),
  uomId: z.string()
    .cuid('Invalid UoM ID'),
  basePrice: z.number()
    .nonnegative('Base price must be non-negative')
    .finite('Base price must be finite')
    .optional(),
});

// Type exports
export type CreateUoMCategoryInput = z.infer<typeof CreateUoMCategorySchema>;
export type UpdateUoMCategoryInput = z.infer<typeof UpdateUoMCategorySchema>;
export type CreateUnitOfMeasureInput = z.infer<typeof CreateUnitOfMeasureSchema>;
export type UpdateUnitOfMeasureInput = z.infer<typeof UpdateUnitOfMeasureSchema>;
export type CreateProductUoMInput = z.infer<typeof CreateProductUoMSchema>;
export type UpdateProductUoMInput = z.infer<typeof UpdateProductUoMSchema>;
export type BulkAssignUoMsInput = z.infer<typeof BulkAssignUoMsSchema>;
export type ConvertUoMInput = z.infer<typeof ConvertUoMSchema>;
export type CalculatePriceInput = z.infer<typeof CalculatePriceSchema>;
