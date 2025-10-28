/**
 * Stock Valuation Layer Validation Schemas
 * 
 * Zod validation schemas for querying and reporting valuation layers.
 * Ensures precision and accuracy in inventory valuation queries.
 */

import { z } from 'zod';

/**
 * Movement Type Enum (reused from stock movement)
 */
export const ValuationMovementTypeEnum = z.enum([
  'IN',
  'OUT',
  'ADJUSTMENT',
  'TRANSFER',
  'RETURN',
  'DAMAGE',
  'EXPIRY'
]);

/**
 * Valuation Query Filters Schema
 * Used for GET /api/stock-valuations (if implemented)
 */
export const ValuationFiltersSchema = z.object({
  productId: z
    .string()
    .cuid('Product ID must be a valid CUID')
    .optional(),
  
  movementType: ValuationMovementTypeEnum.optional(),
  
  startDate: z
    .string()
    .datetime('Start date must be a valid ISO datetime')
    .optional(),
  
  endDate: z
    .string()
    .datetime('End date must be a valid ISO datetime')
    .optional(),
  
  batchId: z
    .string()
    .cuid('Batch ID must be a valid CUID')
    .optional(),
  
  sourceDocType: z
    .enum(['SALE_INVOICE', 'SALE_RECEIPT', 'PURCHASE_ORDER', 'PURCHASE_RECEIPT', 'CREDIT_NOTE', 'CUSTOMER_STATEMENT', 'SUPPLIER_STATEMENT'])
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
    .max(1000, 'Limit cannot exceed 1000 for valuation queries')
    .optional()
    .default(100)
})
  .refine(
    (data) => {
      if (!data.startDate || !data.endDate) return true;
      return new Date(data.endDate) >= new Date(data.startDate);
    },
    {
      message: 'End date must be after or equal to start date',
      path: ['endDate']
    }
  );

/**
 * Valuation Report Query Schema
 * Used for generating inventory valuation reports
 */
export const ValuationReportQuerySchema = z.object({
  asOfDate: z
    .string()
    .datetime('As-of date must be a valid ISO datetime')
    .optional()
    .default(() => new Date().toISOString())
    .refine(
      (val) => {
        const date = new Date(val);
        return date <= new Date();
      },
      'As-of date cannot be in the future'
    ),
  
  productIds: z
    .array(z.string().cuid('Product ID must be a valid CUID'))
    .max(100, 'Cannot generate report for more than 100 products at once')
    .optional(),
  
  categoryFilter: z
    .string()
    .max(100)
    .optional(),
  
  includeZeroStock: z
    .boolean()
    .optional()
    .default(false),
  
  groupBy: z
    .enum(['product', 'category', 'batch', 'none'])
    .optional()
    .default('product'),
  
  format: z
    .enum(['json', 'csv', 'xlsx', 'pdf'])
    .optional()
    .default('json')
});

/**
 * Valuation Reconciliation Query Schema
 * Used for reconciling valuation layers with actual stock
 */
export const ValuationReconciliationSchema = z.object({
  productId: z
    .string()
    .cuid('Product ID must be a valid CUID'),
  
  startDate: z
    .string()
    .datetime('Start date must be a valid ISO datetime'),
  
  endDate: z
    .string()
    .datetime('End date must be a valid ISO datetime'),
  
  includeMovements: z
    .boolean()
    .optional()
    .default(true),
  
  includeBatches: z
    .boolean()
    .optional()
    .default(true)
})
  .refine(
    (data) => {
      return new Date(data.endDate) >= new Date(data.startDate);
    },
    {
      message: 'End date must be after or equal to start date',
      path: ['endDate']
    }
  );

/**
 * Type exports for TypeScript
 */
export type ValuationFilters = z.infer<typeof ValuationFiltersSchema>;
export type ValuationReportQuery = z.infer<typeof ValuationReportQuerySchema>;
export type ValuationReconciliation = z.infer<typeof ValuationReconciliationSchema>;
export type ValuationMovementType = z.infer<typeof ValuationMovementTypeEnum>;
