/**
 * Goods Receipt Validation Schemas
 * 
 * Zod validation schemas for Goods Receipt creation and finalization.
 * Handles discrepancy tracking and batch creation.
 */

import { z } from 'zod';

/**
 * Goods Receipt Status Enum
 */
export const GRStatusEnum = z.enum([
  'DRAFT',
  'COMPLETED',
  'CANCELLED'
]);

/**
 * Discrepancy Type Enum
 */
export const DiscrepancyTypeEnum = z.enum([
  'NONE',
  'SHORTAGE',
  'OVERAGE',
  'DAMAGE',
  'QUALITY_ISSUE'
]);

/**
 * Goods Receipt Item Schema
 * Used when creating/updating a goods receipt
 * Enhanced with precise validation for valuation accuracy
 */
export const GoodsReceiptItemSchema = z.object({
  productId: z
    .string()
    .cuid('Product ID must be a valid CUID'),
  
  receivedQuantity: z
    .number()
    .positive('Received quantity must be greater than zero')
    .finite('Received quantity must be a finite number')
    .refine(
      (val) => val <= 999999999.9999,
      'Received quantity cannot exceed 999,999,999.9999 (schema limit: DECIMAL(15,4))'
    ),
  
  actualCost: z
    .number()
    .nonnegative('Actual cost cannot be negative')
    .finite('Actual cost must be a finite number')
    .refine(
      (val) => val <= 9999999999999.99,
      'Actual cost cannot exceed 9,999,999,999,999.99 (schema limit: DECIMAL(15,2))'
    )
    .refine(
      (val) => {
        // Ensure precision doesn't exceed 2 decimal places
        const decimalPart = val.toString().split('.')[1];
        return !decimalPart || decimalPart.length <= 2;
      },
      'Actual cost precision cannot exceed 2 decimal places'
    ),
  
  batchNumber: z
    .string()
    .min(1, 'Batch number is required')
    .max(100, 'Batch number cannot exceed 100 characters')
    .optional()
    .nullable(),
  
  expiryDate: z
    .string()
    .datetime('Expiry date must be a valid ISO datetime')
    .refine(
      (val) => {
        if (!val) return true;
        const date = new Date(val);
        return date > new Date();
      },
      'Expiry date must be in the future'
    )
    .optional()
    .nullable(),
  
  discrepancyType: DiscrepancyTypeEnum
    .optional()
    .default('NONE'),
  
  discrepancyNotes: z
    .string()
    .max(500, 'Discrepancy notes cannot exceed 500 characters')
    .optional()
    .nullable()
})
  .refine(
    (data) => {
      // If discrepancy type is not NONE, notes must be provided
      if (data.discrepancyType && data.discrepancyType !== 'NONE') {
        return !!data.discrepancyNotes && data.discrepancyNotes.trim().length > 0;
      }
      return true;
    },
    {
      message: 'Discrepancy notes are required when discrepancy type is not NONE',
      path: ['discrepancyNotes']
    }
  );

/**
 * Create Goods Receipt Schema
 * Used for POST /api/goods-receipts
 * Enhanced with cross-field validation
 */
export const CreateGoodsReceiptSchema = z.object({
  purchaseOrderId: z
    .string()
    .cuid('Purchase Order ID must be a valid CUID')
    .optional()
    .nullable(),
  
  receivedDate: z
    .string()
    .datetime('Received date must be a valid ISO datetime')
    .refine(
      (val) => {
        const date = new Date(val);
        const now = new Date();
        const futureLimit = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
        return date <= futureLimit;
      },
      'Received date cannot be more than 24 hours in the future'
    )
    .optional()
    .default(() => new Date().toISOString()),
  
  notes: z
    .string()
    .max(1000, 'Notes cannot exceed 1000 characters')
    .optional()
    .nullable(),
  
  items: z
    .array(GoodsReceiptItemSchema)
    .min(1, 'Goods receipt must contain at least one item')
    .max(500, 'Goods receipt cannot exceed 500 items')
    .refine(
      (items) => {
        // Ensure no duplicate products in the same receipt
        const productIds = items.map(item => item.productId);
        const uniqueIds = new Set(productIds);
        return uniqueIds.size === productIds.length;
      },
      'Goods receipt cannot contain duplicate products. Combine quantities for the same product.'
    )
});

/**
 * Update Goods Receipt Schema
 * Used for PUT /api/goods-receipts/:id
 * Only allows updates when status is DRAFT
 */
export const UpdateGoodsReceiptSchema = z.object({
  receivedDate: z
    .string()
    .datetime('Received date must be a valid ISO datetime')
    .optional(),
  
  notes: z
    .string()
    .max(1000, 'Notes cannot exceed 1000 characters')
    .optional()
    .nullable(),
  
  items: z
    .array(GoodsReceiptItemSchema)
    .min(1, 'Goods receipt must contain at least one item')
    .max(500, 'Goods receipt cannot exceed 500 items')
    .optional()
});

/**
 * Finalize Goods Receipt Schema
 * Used for POST /api/goods-receipts/:id/finalize
 * Creates inventory batches and updates stock
 */
export const FinalizeGoodsReceiptSchema = z.object({
  finalizedDate: z
    .string()
    .datetime('Finalized date must be a valid ISO datetime')
    .optional()
    .default(() => new Date().toISOString()),
  
  createBatches: z
    .boolean()
    .optional()
    .default(true),
  
  updateStock: z
    .boolean()
    .optional()
    .default(true),
  
  updatePurchaseOrder: z
    .boolean()
    .optional()
    .default(true)
});

/**
 * Receive Without PO Schema
 * Used for POST /api/goods-receipts/receive-without-po
 * Direct receiving without a purchase order
 * Enhanced with cross-field validation
 */
export const ReceiveWithoutPOSchema = z.object({
  supplierId: z
    .string()
    .cuid('Supplier ID must be a valid CUID')
    .optional()
    .nullable(),
  
  receivedDate: z
    .string()
    .datetime('Received date must be a valid ISO datetime')
    .refine(
      (val) => {
        const date = new Date(val);
        const now = new Date();
        const futureLimit = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        return date <= futureLimit;
      },
      'Received date cannot be more than 24 hours in the future'
    )
    .optional()
    .default(() => new Date().toISOString()),
  
  notes: z
    .string()
    .max(1000, 'Notes cannot exceed 1000 characters')
    .optional()
    .nullable(),
  
  items: z
    .array(GoodsReceiptItemSchema)
    .min(1, 'Direct receipt must contain at least one item')
    .max(500, 'Direct receipt cannot exceed 500 items')
    .refine(
      (items) => {
        // Ensure no duplicate products
        const productIds = items.map(item => item.productId);
        const uniqueIds = new Set(productIds);
        return uniqueIds.size === productIds.length;
      },
      'Direct receipt cannot contain duplicate products. Combine quantities for the same product.'
    ),
  
  autoFinalize: z
    .boolean()
    .optional()
    .default(false)
});

/**
 * Goods Receipt Query Filters Schema
 * Used for GET /api/goods-receipts
 */
export const GoodsReceiptFiltersSchema = z.object({
  status: GRStatusEnum.optional(),
  
  purchaseOrderId: z
    .string()
    .cuid('Purchase Order ID must be a valid CUID')
    .optional(),
  
  startDate: z
    .string()
    .datetime('Start date must be a valid ISO datetime')
    .optional(),
  
  endDate: z
    .string()
    .datetime('End date must be a valid ISO datetime')
    .optional(),
  
  hasDiscrepancies: z
    .boolean()
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
    .default(20)
});

/**
 * Type exports for TypeScript
 */
export type CreateGoodsReceiptInput = z.infer<typeof CreateGoodsReceiptSchema>;
export type UpdateGoodsReceiptInput = z.infer<typeof UpdateGoodsReceiptSchema>;
export type GoodsReceiptItemInput = z.infer<typeof GoodsReceiptItemSchema>;
export type FinalizeGoodsReceiptInput = z.infer<typeof FinalizeGoodsReceiptSchema>;
export type ReceiveWithoutPOInput = z.infer<typeof ReceiveWithoutPOSchema>;
export type GoodsReceiptFilters = z.infer<typeof GoodsReceiptFiltersSchema>;
export type GRStatus = z.infer<typeof GRStatusEnum>;
export type DiscrepancyType = z.infer<typeof DiscrepancyTypeEnum>;
