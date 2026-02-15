/**
 * @module StockCount Types
 * @description Shared types for Physical Counting (Stocktake) feature
 */

import { z } from 'zod';

// Stock Count State
export const StockCountStateEnum = z.enum(['draft', 'counting', 'validating', 'done', 'cancelled']);
export type StockCountState = z.infer<typeof StockCountStateEnum>;

// Stock Count Schema
export const StockCountSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  locationId: z.string().uuid().optional().nullable(),
  state: StockCountStateEnum,
  createdById: z.string().uuid(),
  validatedById: z.string().uuid().optional().nullable(),
  createdAt: z.string().datetime(),
  validatedAt: z.string().datetime().optional().nullable(),
  snapshotTimestamp: z.string().datetime(),
  notes: z.string().optional().nullable(),
}).strict();

export type StockCount = z.infer<typeof StockCountSchema>;

// Stock Count Line Schema
export const StockCountLineSchema = z.object({
  id: z.string().uuid(),
  stockCountId: z.string().uuid(),
  productId: z.string().uuid(),
  batchId: z.string().uuid().optional().nullable(),
  expectedQtyBase: z.number().nonnegative(),
  countedQtyBase: z.number().nonnegative().optional().nullable(),
  uomRecorded: z.string().max(50).optional().nullable(),
  notes: z.string().optional().nullable(),
  createdById: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export type StockCountLine = z.infer<typeof StockCountLineSchema>;

// Create Stock Count Request
export const CreateStockCountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  locationId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  // Scope options
  includeAllProducts: z.boolean().default(true),
  productIds: z.array(z.string().uuid()).optional(),
  categoryId: z.string().uuid().optional().nullable(),
}).strict();

export type CreateStockCount = z.infer<typeof CreateStockCountSchema>;

// Update/Add Count Line Request
export const UpdateCountLineSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  batchId: z.string().uuid().optional().nullable(),
  countedQty: z.number().nonnegative('Counted quantity must be non-negative'),
  uom: z.string().max(50, 'UOM symbol too long'),
  notes: z.string().optional().nullable(),
}).strict();

export type UpdateCountLine = z.infer<typeof UpdateCountLineSchema>;

// Validate Stock Count Request
export const ValidateStockCountSchema = z.object({
  allowNegativeAdjustments: z.boolean().default(false),
  createMissingBatches: z.boolean().default(false),
  notes: z.string().optional().nullable(),
}).strict();

export type ValidateStockCount = z.infer<typeof ValidateStockCountSchema>;

// Stock Count Line with Details (for UI)
export const StockCountLineWithDetailsSchema = StockCountLineSchema.extend({
  productName: z.string(),
  productSku: z.string().optional().nullable(),
  batchNumber: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  difference: z.number(), // counted - expected
  differencePercentage: z.number().optional().nullable(),
}).strict();

export type StockCountLineWithDetails = z.infer<typeof StockCountLineWithDetailsSchema>;

// Reconciliation Result
export const ReconciliationResultSchema = z.object({
  stockCountId: z.string().uuid(),
  linesProcessed: z.number(),
  adjustmentsCreated: z.number(),
  movementIds: z.array(z.string().uuid()),
  warnings: z.array(z.string()).optional(),
  errors: z.array(z.string()).optional(),
}).strict();

export type ReconciliationResult = z.infer<typeof ReconciliationResultSchema>;

// CSV Import Line
export const CsvImportLineSchema = z.object({
  product: z.string().min(1, 'Product SKU or name required'),
  batch: z.string().optional(),
  countedQty: z.number().nonnegative('Quantity must be non-negative'),
  uom: z.string().max(50).default('BASE'),
  notes: z.string().optional(),
}).strict();

export type CsvImportLine = z.infer<typeof CsvImportLineSchema>;

// Export types for database layer
export interface StockCountDbRow {
  id: string;
  name: string;
  location_id?: string | null;
  state: string;
  created_by_id: string;
  validated_by_id?: string | null;
  created_at: string;
  validated_at?: string | null;
  snapshot_timestamp: string;
  notes?: string | null;
}

export interface StockCountLineDbRow {
  id: string;
  stock_count_id: string;
  product_id: string;
  batch_id?: string | null;
  expected_qty_base: string; // PostgreSQL numeric
  counted_qty_base?: string | null; // PostgreSQL numeric
  uom_recorded?: string | null;
  notes?: string | null;
  created_by_id: string;
  created_at: string;
  updated_at: string;
}
