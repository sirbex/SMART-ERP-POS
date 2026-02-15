// Shared Zod Schemas - Goods Receipts
// Used by both frontend and backend for validation

import { z } from 'zod';

export const GRStatusEnum = z.enum(['DRAFT', 'FINALIZED']);
export type GRStatus = z.infer<typeof GRStatusEnum>;

export const GoodsReceiptItemSchema = z.object({
  id: z.string().uuid(),
  goodsReceiptId: z.string().uuid(),
  purchaseOrderItemId: z.string().uuid(),
  productId: z.string().uuid(),
  quantityReceived: z.number().positive(),
  quantityRejected: z.number().nonnegative().default(0),
  unitCost: z.number().nonnegative(),
  totalCost: z.number().nonnegative(),
  batchNumber: z.string().max(100).optional().nullable(),
  expiryDate: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const GoodsReceiptSchema = z.object({
  id: z.string().uuid(),
  grNumber: z.string(),
  purchaseOrderId: z.string().uuid(),
  receiptDate: z.string().datetime(),
  status: GRStatusEnum,
  totalAmount: z.number().nonnegative(),
  notes: z.string().optional().nullable(),
  receivedBy: z.string().uuid(),
  items: z.array(GoodsReceiptItemSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const CreateGRItemSchema = z.object({
  purchaseOrderItemId: z.string().uuid('Invalid PO item ID'),
  productId: z.string().uuid('Invalid product ID'),
  quantityReceived: z.number().positive('Quantity received must be positive'),
  quantityRejected: z.number().nonnegative().default(0),
  unitCost: z.number().nonnegative('Unit cost cannot be negative'),
  batchNumber: z.string().max(100).optional(),
  expiryDate: z.string().datetime().optional(),
  notes: z.string().optional(),
}).strict();

export const CreateGoodsReceiptSchema = z.object({
  purchaseOrderId: z.string().uuid('Invalid PO ID'),
  receiptDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  items: z.array(CreateGRItemSchema).min(1, 'At least one item is required'),
}).strict();

export const FinalizeGoodsReceiptSchema = z.object({
  id: z.string().uuid('Invalid GR ID'),
}).strict();

export type GoodsReceipt = z.infer<typeof GoodsReceiptSchema>;
export type GoodsReceiptItem = z.infer<typeof GoodsReceiptItemSchema>;
export type CreateGoodsReceipt = z.infer<typeof CreateGoodsReceiptSchema>;
export type CreateGRItem = z.infer<typeof CreateGRItemSchema>;
export type FinalizeGoodsReceipt = z.infer<typeof FinalizeGoodsReceiptSchema>;
