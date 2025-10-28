import { z } from 'zod';

/**
 * Product Validation Schemas
 * 
 * These schemas validate product data for:
 * - Creating new products
 * - Updating existing products
 * 
 * Features:
 * - Required fields: name, baseUnit, costPrice, sellingPrice
 * - Optional fields: barcode, category, taxRate, multiple units, notes
 * - Price validation: Positive decimals with 2 decimal places
 * - Unit conversion: For products sold in multiple units
 * - Business rules enforced at validation layer
 */

/**
 * Create Product Schema
 * Used when creating a new product via POST /api/products
 */
export const CreateProductSchema = z.object({
  name: z.string()
    .trim()
    .min(1, 'Product name is required')
    .max(200, 'Product name cannot exceed 200 characters'),
  
  barcode: z.string()
    .trim()
    .max(100, 'Barcode cannot exceed 100 characters')
    .optional()
    .nullable(),
  
  category: z.string()
    .trim()
    .max(100, 'Category cannot exceed 100 characters')
    .optional()
    .nullable(),
  
  baseUnit: z.string()
    .trim()
    .min(1, 'Base unit is required')
    .max(50, 'Base unit cannot exceed 50 characters'),
  
  costPrice: z.number()
    .positive('Cost price must be greater than 0')
    .multipleOf(0.01, 'Cost price can have at most 2 decimal places')
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) {
        throw new Error('Valid cost price required');
      }
      return Math.round(num * 100) / 100;
    })),
  
  sellingPrice: z.number()
    .positive('Selling price must be greater than 0')
    .multipleOf(0.01, 'Selling price can have at most 2 decimal places')
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) {
        throw new Error('Valid selling price required');
      }
      return Math.round(num * 100) / 100;
    })),
  
  taxRate: z.number()
    .nonnegative('Tax rate must be 0 or greater')
    .max(1, 'Tax rate cannot exceed 100%')
    .multipleOf(0.0001, 'Tax rate can have at most 4 decimal places')
    .optional()
    .nullable()
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num < 0 || num > 1) {
        throw new Error('Valid tax rate required (0-1)');
      }
      return Math.round(num * 10000) / 10000;
    }).optional().nullable()),
  
  hasMultipleUnits: z.boolean()
    .optional()
    .default(false),
  
  alternateUnit: z.string()
    .trim()
    .max(50, 'Alternate unit cannot exceed 50 characters')
    .optional()
    .nullable(),
  
  conversionFactor: z.number()
    .positive('Conversion factor must be greater than 0')
    .multipleOf(0.0001, 'Conversion factor can have at most 4 decimal places')
    .optional()
    .nullable()
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) {
        throw new Error('Valid conversion factor required');
      }
      return Math.round(num * 10000) / 10000;
    }).optional().nullable()),
  
  minStockLevel: z.number()
    .int('Minimum stock level must be a whole number')
    .nonnegative('Minimum stock level cannot be negative')
    .optional()
    .nullable()
    .or(z.string().transform((val) => {
      const num = parseInt(val, 10);
      if (isNaN(num) || num < 0) {
        throw new Error('Valid minimum stock level required');
      }
      return num;
    }).optional().nullable()),
  
  maxStockLevel: z.number()
    .int('Maximum stock level must be a whole number')
    .nonnegative('Maximum stock level cannot be negative')
    .optional()
    .nullable()
    .or(z.string().transform((val) => {
      const num = parseInt(val, 10);
      if (isNaN(num) || num < 0) {
        throw new Error('Valid maximum stock level required');
      }
      return num;
    }).optional().nullable()),
  
  reorderPoint: z.number()
    .int('Reorder point must be a whole number')
    .nonnegative('Reorder point cannot be negative')
    .optional()
    .nullable()
    .or(z.string().transform((val) => {
      const num = parseInt(val, 10);
      if (isNaN(num) || num < 0) {
        throw new Error('Valid reorder point required');
      }
      return num;
    }).optional().nullable()),
  
  notes: z.string()
    .max(500, 'Notes cannot exceed 500 characters')
    .optional()
    .nullable(),
});

/**
 * Update Product Schema
 * Used when updating an existing product via PUT /api/products/:id
 * All fields are optional since this is a partial update
 */
export const UpdateProductSchema = z.object({
  name: z.string()
    .trim()
    .min(1, 'Product name cannot be empty')
    .max(200, 'Product name cannot exceed 200 characters')
    .optional(),
  
  barcode: z.string()
    .trim()
    .max(100, 'Barcode cannot exceed 100 characters')
    .optional()
    .nullable(),
  
  category: z.string()
    .trim()
    .max(100, 'Category cannot exceed 100 characters')
    .optional()
    .nullable(),
  
  baseUnit: z.string()
    .trim()
    .min(1, 'Base unit cannot be empty')
    .max(50, 'Base unit cannot exceed 50 characters')
    .optional(),
  
  costPrice: z.number()
    .positive('Cost price must be greater than 0')
    .multipleOf(0.01, 'Cost price can have at most 2 decimal places')
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) {
        throw new Error('Valid cost price required');
      }
      return Math.round(num * 100) / 100;
    }))
    .optional(),
  
  sellingPrice: z.number()
    .positive('Selling price must be greater than 0')
    .multipleOf(0.01, 'Selling price can have at most 2 decimal places')
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) {
        throw new Error('Valid selling price required');
      }
      return Math.round(num * 100) / 100;
    }))
    .optional(),
  
  taxRate: z.number()
    .nonnegative('Tax rate must be 0 or greater')
    .max(1, 'Tax rate cannot exceed 100%')
    .multipleOf(0.0001, 'Tax rate can have at most 4 decimal places')
    .optional()
    .nullable()
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num < 0 || num > 1) {
        throw new Error('Valid tax rate required (0-1)');
      }
      return Math.round(num * 10000) / 10000;
    }).optional().nullable()),
  
  hasMultipleUnits: z.boolean()
    .optional(),
  
  alternateUnit: z.string()
    .trim()
    .max(50, 'Alternate unit cannot exceed 50 characters')
    .optional()
    .nullable(),
  
  conversionFactor: z.number()
    .positive('Conversion factor must be greater than 0')
    .multipleOf(0.0001, 'Conversion factor can have at most 4 decimal places')
    .optional()
    .nullable()
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) {
        throw new Error('Valid conversion factor required');
      }
      return Math.round(num * 10000) / 10000;
    }).optional().nullable()),
  
  minStockLevel: z.number()
    .int('Minimum stock level must be a whole number')
    .nonnegative('Minimum stock level cannot be negative')
    .optional()
    .nullable()
    .or(z.string().transform((val) => {
      const num = parseInt(val, 10);
      if (isNaN(num) || num < 0) {
        throw new Error('Valid minimum stock level required');
      }
      return num;
    }).optional().nullable()),
  
  maxStockLevel: z.number()
    .int('Maximum stock level must be a whole number')
    .nonnegative('Maximum stock level cannot be negative')
    .optional()
    .nullable()
    .or(z.string().transform((val) => {
      const num = parseInt(val, 10);
      if (isNaN(num) || num < 0) {
        throw new Error('Valid maximum stock level required');
      }
      return num;
    }).optional().nullable()),
  
  reorderPoint: z.number()
    .int('Reorder point must be a whole number')
    .nonnegative('Reorder point cannot be negative')
    .optional()
    .nullable()
    .or(z.string().transform((val) => {
      const num = parseInt(val, 10);
      if (isNaN(num) || num < 0) {
        throw new Error('Valid reorder point required');
      }
      return num;
    }).optional().nullable()),
  
  notes: z.string()
    .max(500, 'Notes cannot exceed 500 characters')
    .optional()
    .nullable(),
  
  isActive: z.boolean()
    .optional(),
});

// TypeScript types for use in route handlers
export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
