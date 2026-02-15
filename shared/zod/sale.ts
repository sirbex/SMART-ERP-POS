// Shared Zod Schemas - Sales
// Used by both frontend and backend for validation

import { z } from 'zod';

export const PaymentMethodEnum = z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CREDIT']);
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

export const SaleStatusEnum = z.enum(['COMPLETED', 'VOID', 'REFUNDED']);
export type SaleStatus = z.infer<typeof SaleStatusEnum>;

export const SaleItemSchema = z.object({
  id: z.string().uuid(),
  saleId: z.string().uuid(),
  productId: z.string().uuid(),
  batchId: z.string().uuid().optional().nullable(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  unitCost: z.number().nonnegative().default(0),
  discountAmount: z.number().nonnegative().default(0),
  totalPrice: z.number().nonnegative(),
  profit: z.number().default(0),
  createdAt: z.string().datetime(),
}).strict();

export const SaleSchema = z.object({
  id: z.string().uuid(),
  saleNumber: z.string(),
  customerId: z.string().uuid().optional().nullable(),
  saleDate: z.string().datetime(),
  subtotal: z.number().nonnegative(),
  taxAmount: z.number().nonnegative().default(0),
  discountAmount: z.number().nonnegative().default(0),
  totalAmount: z.number().nonnegative(),
  totalCost: z.number().nonnegative().default(0),
  profit: z.number().default(0),
  profitMargin: z.number().min(0).max(1).default(0),
  paymentMethod: PaymentMethodEnum,
  amountPaid: z.number().nonnegative(),
  changeAmount: z.number().nonnegative().default(0),
  status: SaleStatusEnum.default('COMPLETED'),
  notes: z.string().optional().nullable(),
  cashierId: z.string().uuid(),
  items: z.array(SaleItemSchema),
  createdAt: z.string().datetime(),
}).strict();

export const CreateSaleItemSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  batchId: z.string().uuid().optional(),
  quantity: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().nonnegative('Price cannot be negative'),
  discountAmount: z.number().nonnegative().default(0),
}).strict();

export const CreateSaleSchema = z.object({
  customerId: z.string().uuid().optional(),
  paymentMethod: PaymentMethodEnum,
  amountPaid: z.number().nonnegative('Amount paid cannot be negative'),
  notes: z.string().optional(),
  items: z.array(CreateSaleItemSchema).min(1, 'At least one item is required'),
}).strict();

export type Sale = z.infer<typeof SaleSchema>;
export type SaleItem = z.infer<typeof SaleItemSchema>;
export type CreateSale = z.infer<typeof CreateSaleSchema>;
export type CreateSaleItem = z.infer<typeof CreateSaleItemSchema>;
