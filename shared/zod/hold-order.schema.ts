import { z } from 'zod';

/**
 * Held Order Schemas
 * For "Put on Hold" and "Resume" cart functionality
 */

export const HoldOrderItemSchema = z.object({
    productId: z.string().uuid(),
    productName: z.string(),
    productSku: z.string().nullable().optional(),
    productType: z.enum(['inventory', 'consumable', 'service']).default('inventory'),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative(),
    costPrice: z.number().nonnegative().default(0),
    subtotal: z.number().nonnegative(),
    isTaxable: z.boolean().default(true),
    taxRate: z.number().min(0).max(100).default(0),
    taxAmount: z.number().nonnegative().default(0),
    discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).nullable().optional(),
    discountValue: z.number().nullable().optional(),
    discountAmount: z.number().nonnegative().default(0),
    discountReason: z.string().nullable().optional(),
    uomId: z.string().uuid().nullable().optional(),
    uomName: z.string().nullable().optional(),
    uomConversionFactor: z.number().nullable().optional(),
    metadata: z.record(z.any()).nullable().optional(),
    lineOrder: z.number().int().default(0),
}).strict();

export const CreateHoldOrderSchema = z.object({
    terminalId: z.string().max(100).nullable().optional(),
    userId: z.string().uuid(),
    customerId: z.string().uuid().nullable().optional(),
    customerName: z.string().max(255).nullable().optional(),
    subtotal: z.number().nonnegative(),
    taxAmount: z.number().nonnegative(),
    discountAmount: z.number().nonnegative().default(0),
    totalAmount: z.number().nonnegative(),
    holdReason: z.string().max(255).nullable().optional(),
    notes: z.string().nullable().optional(),
    metadata: z.record(z.any()).nullable().optional(), // Draft payment lines, cart discounts, etc.
    items: z.array(HoldOrderItemSchema).min(1, 'At least one item required'),
    expiresAt: z.string().datetime().nullable().optional(), // ISO 8601
}).strict();

export const HoldOrderSchema = z.object({
    id: z.string().uuid(),
    holdNumber: z.string(),
    terminalId: z.string().nullable().optional(),
    userId: z.string().uuid(),
    customerId: z.string().uuid().nullable().optional(),
    customerName: z.string().nullable().optional(),
    subtotal: z.number(),
    taxAmount: z.number(),
    discountAmount: z.number(),
    totalAmount: z.number(),
    holdReason: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    metadata: z.record(z.any()).nullable().optional(),
    createdAt: z.string(), // ISO 8601
    expiresAt: z.string().nullable().optional(),
    items: z.array(HoldOrderItemSchema),
}).strict();

export type HoldOrderItem = z.infer<typeof HoldOrderItemSchema>;
export type CreateHoldOrderInput = z.infer<typeof CreateHoldOrderSchema>;
export type HoldOrder = z.infer<typeof HoldOrderSchema>;
