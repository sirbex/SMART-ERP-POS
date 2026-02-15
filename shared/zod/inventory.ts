// Shared Zod Schemas - Inventory Management
// Used by both frontend and backend for validation

import { z } from 'zod';

export const BatchSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  batchNumber: z.string().min(1).max(100),
  quantity: z.number().nonnegative(),
  remainingQuantity: z.number().nonnegative(),
  expiryDate: z.string().datetime().optional().nullable(),
  receivedDate: z.string().datetime(),
  costPrice: z.number().nonnegative(),
  goodsReceiptId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const CreateBatchSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  batchNumber: z.string().min(1, 'Batch number is required').max(100),
  quantity: z.number().positive('Quantity must be positive'),
  expiryDate: z.string().datetime().optional(),
  receivedDate: z.string().datetime().optional(),
  costPrice: z.number().nonnegative('Cost price cannot be negative'),
  goodsReceiptId: z.string().uuid().optional(),
}).strict();

export const UpdateBatchSchema = z.object({
  batchNumber: z.string().min(1).max(100).optional(),
  expiryDate: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
}).strict();

export const StockMovementTypeEnum = z.enum([
  'PURCHASE',
  'SALE',
  'ADJUSTMENT',
  'TRANSFER',
  'RETURN',
  'DAMAGE',
  'EXPIRY',
]);
export type StockMovementType = z.infer<typeof StockMovementTypeEnum>;

export const StockMovementSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  batchId: z.string().uuid().optional().nullable(),
  movementType: StockMovementTypeEnum,
  quantity: z.number(),
  quantityBefore: z.number().nonnegative(),
  quantityAfter: z.number().nonnegative(),
  unitCost: z.number().nonnegative().default(0),
  totalCost: z.number().default(0),
  referenceType: z.string().max(50).optional().nullable(),
  referenceId: z.string().uuid().optional().nullable(),
  reason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  userId: z.string().uuid(),
  createdAt: z.string().datetime(),
}).strict();

export const CreateStockMovementSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  batchId: z.string().uuid().optional(),
  movementType: StockMovementTypeEnum,
  quantity: z.number().refine((val) => val !== 0, 'Quantity cannot be zero'),
  unitCost: z.number().nonnegative().default(0),
  referenceType: z.string().max(50).optional(),
  referenceId: z.string().uuid().optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
}).strict();

export const StockLevelSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  sku: z.string(),
  quantityOnHand: z.number().nonnegative(),
  reorderLevel: z.number().nonnegative(),
  averageCost: z.number().nonnegative(),
  totalValue: z.number().nonnegative(),
  needsReorder: z.boolean(),
}).strict();

export const InventoryAdjustmentSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  adjustment: z.number().refine((val) => val !== 0, 'Adjustment cannot be zero'),
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
  userId: z.string().uuid('Invalid user ID'),
}).strict();

export type Batch = z.infer<typeof BatchSchema>;
export type CreateBatch = z.infer<typeof CreateBatchSchema>;
export type UpdateBatch = z.infer<typeof UpdateBatchSchema>;
export type StockMovement = z.infer<typeof StockMovementSchema>;
export type CreateStockMovement = z.infer<typeof CreateStockMovementSchema>;
export type StockLevel = z.infer<typeof StockLevelSchema>;
export type InventoryAdjustment = z.infer<typeof InventoryAdjustmentSchema>;
