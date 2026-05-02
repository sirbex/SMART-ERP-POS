/**
 * Supplier Invoice Adjustment Zod Schemas
 * Unified flow: Return Goods (via Return GRN) or Price Correction (via Supplier Credit Note)
 */
import { z } from 'zod';

export const ReturnLineSchema = z.object({
    /** gr_item_id from getReturnableItems — used to trace back to the GRN line */
    grItemId: z.string(),
    productId: z.string().min(1),
    batchId: z.string().uuid().optional().nullable(),
    uomId: z.string().uuid().optional().nullable(),
    quantity: z.number().positive('Quantity must be positive'),
    unitCost: z.number().nonnegative('Unit cost must be non-negative'),
}).strict();

export const AdjustReturnSchema = z.object({
    intent: z.literal('RETURN'),
    invoiceId: z.string().uuid('Invoice ID must be a valid UUID'),
    grnId: z.string().uuid('GRN ID must be a valid UUID'),
    reason: z.string().min(1, 'Reason is required').max(500),
    notes: z.string().max(1000).optional(),
    lines: z.array(ReturnLineSchema).min(1, 'At least one return line is required'),
});

export const AdjustPriceCorrectionSchema = z.object({
    intent: z.literal('PRICE_CORRECTION'),
    invoiceId: z.string().uuid('Invoice ID must be a valid UUID'),
    reason: z.string().min(1, 'Reason is required').max(500),
    notes: z.string().max(1000).optional(),
    amount: z.number().positive('Amount must be positive'),
});

export const AdjustSupplierInvoiceSchema = z.discriminatedUnion('intent', [
    AdjustReturnSchema,
    AdjustPriceCorrectionSchema,
]);

export type AdjustSupplierInvoice = z.infer<typeof AdjustSupplierInvoiceSchema>;
export type AdjustReturn = z.infer<typeof AdjustReturnSchema>;
export type AdjustPriceCorrection = z.infer<typeof AdjustPriceCorrectionSchema>;
export type ReturnLine = z.infer<typeof ReturnLineSchema>;
