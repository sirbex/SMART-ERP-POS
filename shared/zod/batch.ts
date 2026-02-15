// Inventory Batch Validation Schema
// Schema for inventory batch tracking with FEFO (First Expiry First Out) support

import { z } from 'zod';
import Decimal from 'decimal.js';

/**
 * Batch status enum
 */
export const BatchStatusSchema = z.enum(['ACTIVE', 'DEPLETED', 'EXPIRED', 'QUARANTINED', 'RECALLED']);

export type BatchStatus = z.infer<typeof BatchStatusSchema>;

/**
 * Inventory batch validation schema
 */
export const InventoryBatchSchema = z
  .object({
    id: z.string().uuid(),
    batchNumber: z
      .string()
      .min(1, 'Batch number is required')
      .max(50, 'Batch number cannot exceed 50 characters')
      .regex(/^[A-Z0-9-]+$/, 'Batch number must be alphanumeric with hyphens'),
    productId: z.string().uuid(),
    goodsReceiptId: z.string().uuid().optional().nullable(),
    receivedDate: z.string().date(), // YYYY-MM-DD format
    expiryDate: z.string().date().optional().nullable(), // YYYY-MM-DD format
    manufacturingDate: z.string().date().optional().nullable(), // YYYY-MM-DD format
    quantity: z
      .number()
      .nonnegative('Quantity cannot be negative')
      .refine(
        (val) => {
          try {
            const decimal = new Decimal(val);
            const str = decimal.toString();
            const decimalIndex = str.indexOf('.');
            if (decimalIndex === -1) return true;
            return str.length - decimalIndex - 1 <= 3;
          } catch {
            return false;
          }
        },
        {
          message: 'Quantity must have at most 3 decimal places',
        }
      )
      .transform((val) => new Decimal(val).toNumber()),
    remainingQuantity: z
      .number()
      .nonnegative('Remaining quantity cannot be negative')
      .refine(
        (val) => {
          try {
            const decimal = new Decimal(val);
            const str = decimal.toString();
            const decimalIndex = str.indexOf('.');
            if (decimalIndex === -1) return true;
            return str.length - decimalIndex - 1 <= 3;
          } catch {
            return false;
          }
        },
        {
          message: 'Remaining quantity must have at most 3 decimal places',
        }
      )
      .transform((val) => new Decimal(val).toNumber()),
    unitCost: z
      .number()
      .nonnegative('Unit cost cannot be negative')
      .refine(
        (val) => {
          try {
            const decimal = new Decimal(val);
            const str = decimal.toString();
            const decimalIndex = str.indexOf('.');
            if (decimalIndex === -1) return true;
            return str.length - decimalIndex - 1 <= 2;
          } catch {
            return false;
          }
        },
        {
          message: 'Unit cost must have at most 2 decimal places',
        }
      )
      .transform((val) => new Decimal(val).toNumber()),
    status: BatchStatusSchema.default('ACTIVE'),
    location: z.string().max(100).optional().nullable(),
    supplierBatchRef: z.string().max(50).optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
    quarantineReason: z.string().max(255).optional().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .refine(
    (data) => {
      // remainingQuantity cannot exceed quantity
      return data.remainingQuantity <= data.quantity;
    },
    {
      message: 'Remaining quantity cannot exceed total quantity',
      path: ['remainingQuantity'],
    }
  )
  .refine(
    (data) => {
      // If expiryDate is set, it must be after manufacturingDate
      if (data.manufacturingDate && data.expiryDate) {
        return new Date(data.expiryDate) > new Date(data.manufacturingDate);
      }
      return true;
    },
    {
      message: 'Expiry date must be after manufacturing date',
      path: ['expiryDate'],
    }
  )
  .refine(
    (data) => {
      // If expiryDate is set, it must be after receivedDate
      if (data.expiryDate) {
        return new Date(data.expiryDate) >= new Date(data.receivedDate);
      }
      return true;
    },
    {
      message: 'Expiry date must be on or after received date',
      path: ['expiryDate'],
    }
  );

export type InventoryBatch = z.infer<typeof InventoryBatchSchema>;

/**
 * Create batch schema (from goods receipt)
 */
// Extract base object before applying omit
const baseInventoryBatchSchema = InventoryBatchSchema._def.schema._def.schema._def.schema;
export const CreateInventoryBatchSchema = baseInventoryBatchSchema.omit({
  id: true,
  remainingQuantity: true, // Initially equals quantity
  status: true, // Defaults to ACTIVE
  createdAt: true,
  updatedAt: true,
});

export type CreateInventoryBatchInput = z.infer<typeof CreateInventoryBatchSchema>;

/**
 * Update batch schema (for adjustments)
 */
export const UpdateInventoryBatchSchema = z
  .object({
    remainingQuantity: z.number().nonnegative().optional(),
    status: BatchStatusSchema.optional(),
    location: z.string().max(100).optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
    quarantineReason: z.string().max(255).optional().nullable(),
  })
  .strict();

export type UpdateInventoryBatchInput = z.infer<typeof UpdateInventoryBatchSchema>;

/**
 * Batch with product details
 */
// Extract base object before applying extend
export const BatchWithDetailsSchema = baseInventoryBatchSchema.extend({
  productName: z.string(),
  productSku: z.string().optional().nullable(),
  isExpired: z.boolean(),
  isExpiringSoon: z.boolean(),
  daysUntilExpiry: z.number().int().optional().nullable(),
});

export type BatchWithDetails = z.infer<typeof BatchWithDetailsSchema>;

/**
 * FEFO (First Expiry First Out) selection result
 */
export const FEFOSelectionSchema = z.object({
  batches: z.array(
    z.object({
      batchId: z.string().uuid(),
      batchNumber: z.string(),
      allocatedQuantity: z.number().positive(),
      remainingQuantity: z.number().nonnegative(),
      expiryDate: z.string().date().optional().nullable(),
      unitCost: z.number().nonnegative(),
    })
  ),
  totalAllocated: z.number().nonnegative(),
  totalCost: z.number().nonnegative(),
  shortfall: z.number().nonnegative(), // If requested > available
});

export type FEFOSelection = z.infer<typeof FEFOSelectionSchema>;

/**
 * Batch query filters
 */
export const BatchFiltersSchema = z.object({
  productId: z.string().uuid().optional(),
  status: BatchStatusSchema.optional(),
  location: z.string().optional(),
  expiringBefore: z.string().date().optional(), // Find batches expiring before this date
  expiringSoon: z.boolean().optional(), // Within 30 days
  isExpired: z.boolean().optional(),
  hasStock: z.boolean().optional(), // remainingQuantity > 0
});

export type BatchFilters = z.infer<typeof BatchFiltersSchema>;

/**
 * Batch expiry alert thresholds
 */
export const ExpiryAlertThresholdsSchema = z.object({
  warningDays: z.number().int().positive().default(30), // Warning when < 30 days
  criticalDays: z.number().int().positive().default(7), // Critical when < 7 days
});

export type ExpiryAlertThresholds = z.infer<typeof ExpiryAlertThresholdsSchema>;

/**
 * Batch expiry report
 */
export const BatchExpiryReportSchema = z.object({
  expiredBatches: z.array(BatchWithDetailsSchema),
  expiringSoonBatches: z.array(BatchWithDetailsSchema),
  totalExpiredValue: z.number().nonnegative(),
  totalExpiringSoonValue: z.number().nonnegative(),
  generatedAt: z.string().datetime(),
});

export type BatchExpiryReport = z.infer<typeof BatchExpiryReportSchema>;
