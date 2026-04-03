// Shared Zod Schemas - Cost Layers (FIFO/AVCO Inventory Valuation)
// Used by both frontend and backend for validation

import { z } from 'zod';

export const CostLayerSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  remainingQuantity: z.number().nonnegative(),
  unitCost: z.number().nonnegative(),
  receivedDate: z.string().datetime(),
  goodsReceiptId: z.string().uuid().optional().nullable(),
  batchNumber: z.string().max(100).optional().nullable(),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const CreateCostLayerSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  quantity: z.number().positive('Quantity must be positive'),
  unitCost: z.number().nonnegative('Unit cost cannot be negative'),
  receivedDate: z.string().datetime().optional(),
  goodsReceiptId: z.string().uuid().optional(),
  batchNumber: z.string().max(100).optional(),
}).strict();

export const ConsumeCostLayerSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  quantity: z.number().positive('Quantity must be positive'),
}).strict();

export const CostLayerConsumptionSchema = z.object({
  costLayerId: z.string().uuid(),
  quantityConsumed: z.number().positive(),
  unitCost: z.number().nonnegative(),
  totalCost: z.number().nonnegative(),
}).strict();

export const CostLayerConsumptionResultSchema = z.object({
  totalCost: z.number().nonnegative(),
  averageCost: z.number().nonnegative(),
  layers: z.array(CostLayerConsumptionSchema),
}).strict();

export type CostLayer = z.infer<typeof CostLayerSchema>;
export type CreateCostLayer = z.infer<typeof CreateCostLayerSchema>;
export type ConsumeCostLayer = z.infer<typeof ConsumeCostLayerSchema>;
export type CostLayerConsumption = z.infer<typeof CostLayerConsumptionSchema>;
export type CostLayerConsumptionResult = z.infer<typeof CostLayerConsumptionResultSchema>;
