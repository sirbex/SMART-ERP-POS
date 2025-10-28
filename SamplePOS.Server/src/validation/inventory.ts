import { z } from 'zod';

/**
 * Inventory Validation Schemas
 * 
 * These schemas validate inventory operations for:
 * - Stock adjustments
 * - Stock transfers
 * - Inventory counts
 * 
 * Features:
 * - Required fields: product, quantity, reason
 * - Optional fields: notes, batch information
 * - Business rules: Valid adjustment types, non-negative stock
 * - Audit trail requirements
 */

/**
 * Stock Adjustment Schema
 * Used when adjusting inventory via POST /api/inventory/adjust
 */
export const StockAdjustmentSchema = z.object({
  productId: z.string()
    .trim()
    .min(1, 'Product ID is required'),
  
  quantity: z.number()
    .int('Quantity must be a whole number')
    .refine((val) => val !== 0, {
      message: 'Quantity cannot be zero'
    }),
  
  type: z.enum(['IN', 'OUT', 'ADJUSTMENT', 'DAMAGED', 'EXPIRED', 'RETURN', 'TRANSFER'], {
    errorMap: () => ({ message: 'Invalid adjustment type' })
  }),
  
  reason: z.string()
    .trim()
    .min(1, 'Reason is required')
    .max(500, 'Reason cannot exceed 500 characters'),
  
  referenceNumber: z.string()
    .trim()
    .max(100, 'Reference number cannot exceed 100 characters')
    .optional()
    .nullable(),
  
  batchNumber: z.string()
    .trim()
    .max(100, 'Batch number cannot exceed 100 characters')
    .optional()
    .nullable(),
  
  expiryDate: z.string()
    .trim()
    .datetime({ message: 'Expiry date must be a valid ISO datetime' })
    .optional()
    .nullable()
    .or(z.date().transform(date => date.toISOString()).optional().nullable()),
  
  notes: z.string()
    .max(500, 'Notes cannot exceed 500 characters')
    .optional()
    .nullable(),
});

/**
 * Stock Transfer Schema
 * Used when transferring stock between locations via POST /api/inventory/transfer
 */
export const StockTransferSchema = z.object({
  productId: z.string()
    .trim()
    .min(1, 'Product ID is required'),
  
  quantity: z.number()
    .positive('Quantity must be greater than 0')
    .int('Quantity must be a whole number'),
  
  fromLocation: z.string()
    .trim()
    .min(1, 'Source location is required')
    .max(200, 'Source location cannot exceed 200 characters'),
  
  toLocation: z.string()
    .trim()
    .min(1, 'Destination location is required')
    .max(200, 'Destination location cannot exceed 200 characters'),
  
  reason: z.string()
    .trim()
    .min(1, 'Transfer reason is required')
    .max(500, 'Reason cannot exceed 500 characters'),
  
  referenceNumber: z.string()
    .trim()
    .max(100, 'Reference number cannot exceed 100 characters')
    .optional()
    .nullable(),
  
  notes: z.string()
    .max(500, 'Notes cannot exceed 500 characters')
    .optional()
    .nullable(),
});

/**
 * Inventory Count Schema
 * Used when recording physical inventory count via POST /api/inventory/count
 */
export const InventoryCountSchema = z.object({
  items: z.array(z.object({
    productId: z.string().trim().min(1, 'Product ID is required'),
    countedQuantity: z.number().nonnegative('Counted quantity cannot be negative').int('Quantity must be whole number'),
    notes: z.string().max(200, 'Item notes cannot exceed 200 characters').optional().nullable(),
  })).min(1, 'At least one item is required'),
  
  countDate: z.string()
    .trim()
    .datetime({ message: 'Count date must be a valid ISO datetime' })
    .optional()
    .or(z.date().transform(date => date.toISOString()).optional()),
  
  countedBy: z.string()
    .trim()
    .max(200, 'Counted by name cannot exceed 200 characters')
    .optional()
    .nullable(),
  
  notes: z.string()
    .max(500, 'Notes cannot exceed 500 characters')
    .optional()
    .nullable(),
});

/**
 * Update Stock Level Schema
 * Used when manually setting stock level via PUT /api/inventory/:id/stock-level
 */
export const UpdateStockLevelSchema = z.object({
  newQuantity: z.number()
    .nonnegative('Stock level cannot be negative')
    .int('Stock level must be a whole number'),
  
  reason: z.string()
    .trim()
    .min(1, 'Reason is required')
    .max(500, 'Reason cannot exceed 500 characters'),
});

// TypeScript types for use in route handlers
export type StockAdjustmentInput = z.infer<typeof StockAdjustmentSchema>;
export type StockTransferInput = z.infer<typeof StockTransferSchema>;
export type InventoryCountInput = z.infer<typeof InventoryCountSchema>;
export type UpdateStockLevelInput = z.infer<typeof UpdateStockLevelSchema>;
