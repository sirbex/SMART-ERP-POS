/**
 * Stock Movement Validation Schemas
 * 
 * Zod validation schemas for Stock Movement tracking and audit trail.
 * Immutable records for complete inventory accountability.
 */

import { z } from 'zod';

/**
 * Movement Type Enum
 */
export const MovementTypeEnum = z.enum([
  'IN',           // Goods receipt
  'OUT',          // Sale/dispatch
  'ADJUSTMENT',   // Manual adjustment
  'TRANSFER',     // Inter-location transfer
  'RETURN',       // Customer/supplier return
  'DAMAGE',       // Damaged goods write-off
  'EXPIRY'        // Expired goods write-off
]);

/**
 * Create Manual Adjustment Schema
 * Used for POST /api/stock-movements/adjustment
 * Enhanced with precision validation for valuation accuracy
 */
export const CreateAdjustmentSchema = z.object({
  productId: z
    .string()
    .cuid('Product ID must be a valid CUID'),
  
  batchId: z
    .string()
    .cuid('Batch ID must be a valid CUID')
    .optional()
    .nullable(),
  
  adjustmentQuantity: z
    .number()
    .finite('Adjustment quantity must be a finite number')
    .refine(val => val !== 0, 'Adjustment quantity cannot be zero')
    .refine(
      (val) => Math.abs(val) <= 999999999.9999,
      'Adjustment quantity magnitude cannot exceed 999,999,999.9999 (schema limit: DECIMAL(15,4))'
    )
    .refine(
      (val) => {
        // Ensure precision doesn't exceed 4 decimal places
        const decimalPart = Math.abs(val).toString().split('.')[1];
        return !decimalPart || decimalPart.length <= 4;
      },
      'Adjustment quantity precision cannot exceed 4 decimal places'
    ),
  
  reason: z
    .string()
    .min(5, 'Reason must be at least 5 characters for audit trail')
    .max(500, 'Reason cannot exceed 500 characters')
    .refine(
      (val) => val.trim().length >= 5,
      'Reason must contain at least 5 non-whitespace characters'
    ),
  
  notes: z
    .string()
    .max(1000, 'Notes cannot exceed 1000 characters')
    .optional()
    .nullable(),
  
  reference: z
    .string()
    .min(1, 'Reference cannot be empty if provided')
    .max(100, 'Reference cannot exceed 100 characters')
    .optional()
    .nullable()
});

/**
 * Stock Movement Query Filters Schema
 * Used for GET /api/stock-movements
 */
export const StockMovementFiltersSchema = z.object({
  movementType: MovementTypeEnum.optional(),
  
  productId: z
    .string()
    .cuid('Product ID must be a valid CUID')
    .optional(),
  
  batchId: z
    .string()
    .cuid('Batch ID must be a valid CUID')
    .optional(),
  
  startDate: z
    .string()
    .datetime('Start date must be a valid ISO datetime')
    .optional(),
  
  endDate: z
    .string()
    .datetime('End date must be a valid ISO datetime')
    .optional(),
  
  performedById: z
    .string()
    .cuid('Performed by ID must be a valid CUID')
    .optional(),
  
  page: z
    .number()
    .int('Page must be an integer')
    .positive('Page must be positive')
    .optional()
    .default(1),
  
  limit: z
    .number()
    .int('Limit must be an integer')
    .positive('Limit must be positive')
    .max(100, 'Limit cannot exceed 100')
    .optional()
    .default(50)
});

/**
 * Audit Report Query Schema
 * Used for GET /api/stock-movements/audit
 */
export const AuditReportQuerySchema = z.object({
  productId: z
    .string()
    .cuid('Product ID must be a valid CUID')
    .optional(),
  
  startDate: z
    .string()
    .datetime('Start date must be a valid ISO datetime'),
  
  endDate: z
    .string()
    .datetime('End date must be a valid ISO datetime'),
  
  groupBy: z
    .enum(['product', 'batch', 'type', 'user', 'day'])
    .optional()
    .default('product'),
  
  includeZeroMovements: z
    .boolean()
    .optional()
    .default(false)
});

/**
 * Export Query Schema
 * Used for GET /api/stock-movements/export
 */
export const ExportMovementsQuerySchema = z.object({
  format: z
    .enum(['csv', 'xlsx', 'json'])
    .optional()
    .default('csv'),
  
  startDate: z
    .string()
    .datetime('Start date must be a valid ISO datetime'),
  
  endDate: z
    .string()
    .datetime('End date must be a valid ISO datetime'),
  
  productId: z
    .string()
    .cuid('Product ID must be a valid CUID')
    .optional(),
  
  movementType: MovementTypeEnum.optional()
});

/**
 * Type exports for TypeScript
 */
export type CreateAdjustmentInput = z.infer<typeof CreateAdjustmentSchema>;
export type StockMovementFilters = z.infer<typeof StockMovementFiltersSchema>;
export type AuditReportQuery = z.infer<typeof AuditReportQuerySchema>;
export type ExportMovementsQuery = z.infer<typeof ExportMovementsQuerySchema>;
export type MovementType = z.infer<typeof MovementTypeEnum>;
