/**
 * Customer Invoice Adjustment Zod Schemas
 * SAP/Odoo-style: price correction (CN, no stock) or return goods (CN + RETURN stock)
 */
import { z } from 'zod';
import { positiveFiniteQuantity } from './numeric.js';

export const PriceCorrectionLineSchema = z.object({
    /** sale_items.id — server recalculates credit from pricing engine */
    saleItemId: z.string().uuid('Sale item ID must be a valid UUID'),
}).strict();

export const AdjustCustomerPriceCorrectionSchema = z.object({
    intent: z.literal('PRICE_CORRECTION'),
    invoiceId: z.string().uuid('Invoice ID must be a valid UUID'),
    reason: z.string().min(1, 'Reason is required').max(500),
    notes: z.string().max(1000).optional(),
    lines: z.array(PriceCorrectionLineSchema).min(1, 'Select at least one line to correct'),
});

export const ReturnGoodsLineSchema = z.object({
    saleItemId: z.string().uuid('Sale item ID must be a valid UUID'),
    quantity: positiveFiniteQuantity,
}).strict();

export const AdjustCustomerReturnSchema = z.object({
    intent: z.literal('RETURN_GOODS'),
    invoiceId: z.string().uuid('Invoice ID must be a valid UUID'),
    reason: z.string().min(1, 'Reason is required').max(500),
    notes: z.string().max(1000).optional(),
    lines: z.array(ReturnGoodsLineSchema).min(1, 'At least one return line is required'),
});

export const AdjustCustomerInvoiceSchema = z.discriminatedUnion('intent', [
    AdjustCustomerPriceCorrectionSchema,
    AdjustCustomerReturnSchema,
]);

export type AdjustCustomerInvoice = z.infer<typeof AdjustCustomerInvoiceSchema>;
export type AdjustCustomerPriceCorrection = z.infer<typeof AdjustCustomerPriceCorrectionSchema>;
export type AdjustCustomerReturn = z.infer<typeof AdjustCustomerReturnSchema>;
