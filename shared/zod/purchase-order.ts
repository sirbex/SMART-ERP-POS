// Shared Zod Schemas - Purchase Orders
// Used by both frontend and backend for validation

import { z } from 'zod';

export const POStatusEnum = z.enum(['DRAFT', 'PENDING', 'COMPLETED', 'CANCELLED']);
export type POStatus = z.infer<typeof POStatusEnum>;

export const PurchaseOrderItemSchema = z.object({
  id: z.string().uuid(),
  purchaseOrderId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
  totalCost: z.number().nonnegative(),
  receivedQuantity: z.number().nonnegative().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const PurchaseOrderSchema = z.object({
  id: z.string().uuid(),
  poNumber: z.string(),
  supplierId: z.string().uuid(),
  orderDate: z.string().datetime(),
  expectedDeliveryDate: z.string().datetime().optional().nullable(),
  status: POStatusEnum,
  subtotal: z.number().nonnegative(),
  taxAmount: z.number().nonnegative().default(0),
  shippingCost: z.number().nonnegative().default(0),
  totalAmount: z.number().nonnegative(),
  notes: z.string().optional().nullable(),
  createdBy: z.string().uuid(),
  items: z.array(PurchaseOrderItemSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const CreatePOItemSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  quantity: z.number().positive('Quantity must be positive'),
  unitCost: z.number().nonnegative('Unit cost cannot be negative'),
}).strict();

export const CreatePurchaseOrderSchema = z.object({
  supplierId: z.string().uuid('Invalid supplier ID'),
  expectedDeliveryDate: z.string().datetime().optional(),
  taxAmount: z.number().nonnegative().default(0),
  shippingCost: z.number().nonnegative().default(0),
  notes: z.string().optional(),
  items: z.array(CreatePOItemSchema).min(1, 'At least one item is required'),
}).strict();

export const UpdatePurchaseOrderSchema = z.object({
  supplierId: z.string().uuid().optional(),
  expectedDeliveryDate: z.string().datetime().optional(),
  taxAmount: z.number().nonnegative().optional(),
  shippingCost: z.number().nonnegative().optional(),
  notes: z.string().optional(),
}).strict();

export const SubmitPurchaseOrderSchema = z.object({
  id: z.string().uuid('Invalid PO ID'),
}).strict();

export const CancelPurchaseOrderSchema = z.object({
  id: z.string().uuid('Invalid PO ID'),
  reason: z.string().min(1, 'Cancellation reason is required'),
}).strict();

export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;
export type PurchaseOrderItem = z.infer<typeof PurchaseOrderItemSchema>;
export type CreatePurchaseOrder = z.infer<typeof CreatePurchaseOrderSchema>;
export type CreatePOItem = z.infer<typeof CreatePOItemSchema>;
export type UpdatePurchaseOrder = z.infer<typeof UpdatePurchaseOrderSchema>;
export type SubmitPurchaseOrder = z.infer<typeof SubmitPurchaseOrderSchema>;
export type CancelPurchaseOrder = z.infer<typeof CancelPurchaseOrderSchema>;
