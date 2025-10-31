/**
 * POS Validation Schemas with Bank-Grade Precision
 * Zod schemas for advanced POS features: discounts, price overrides, payment types, held sales
 */

import { z } from 'zod';

// Precision helpers for currency validation
const currencySchema = z.number()
  .refine(val => {
    // Ensure exactly 2 decimal places
    const str = val.toFixed(2);
    return Math.abs(parseFloat(str) - val) < 0.001;
  }, { message: 'Amount must have exactly 2 decimal places' })
  .refine(val => val >= 0, { message: 'Amount must be non-negative' });

const positiveDecimalSchema = z.number()
  .positive({ message: 'Value must be positive' })
  .refine(val => {
    // Allow up to 4 decimal places for quantities
    const str = val.toFixed(4);
    return Math.abs(parseFloat(str) - val) < 0.00001;
  }, { message: 'Value must have at most 4 decimal places' });

// Payment Method enum
export const PaymentMethodSchema = z.enum([
  'CASH',
  'CARD',
  'CREDIT',
  'BANK_TRANSFER',
  'MOBILE_MONEY',
  'AIRTEL_MONEY',
  'FLEX_PAY'
]);

// Line Item with inline editing support
export const POSLineItemSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  name: z.string().min(1, 'Product name is required'),
  quantity: positiveDecimalSchema,
  unit: z.string().min(1, 'Unit is required'),
  uomId: z.string().optional().nullable(),
  unitPrice: currencySchema,
  priceOverride: currencySchema.optional().nullable(),
  priceOverrideReason: z.string().max(255).optional().nullable(),
  discount: currencySchema.optional().default(0),
  discountReason: z.string().max(255).optional().nullable(),
  subtotal: currencySchema,
  taxRate: z.number().min(0).max(1).optional().default(0),
  taxAmount: currencySchema.optional().default(0),
  total: currencySchema,
}).refine(data => {
  // Validate price override is reasonable
  if (data.priceOverride !== null && data.priceOverride !== undefined) {
    const maxAllowedOverride = data.unitPrice * 2; // 200% of original price
    const minAllowedOverride = data.unitPrice * 0.1; // 10% of original price
    if (data.priceOverride > maxAllowedOverride || data.priceOverride < minAllowedOverride) {
      return false;
    }
    // Require reason for price override
    if (!data.priceOverrideReason || data.priceOverrideReason.trim().length < 3) {
      return false;
    }
  }
  return true;
}, {
  message: 'Price override must be between 10% and 200% of original price and require a reason (min 3 characters)',
  path: ['priceOverride']
}).refine(data => {
  // Validate discount
  const maxDiscount = data.unitPrice * data.quantity; // Cannot exceed line subtotal
  if (data.discount > maxDiscount) {
    return false;
  }
  // Require reason for discounts > 5%
  const discountPercent = (data.discount / (data.unitPrice * data.quantity)) * 100;
  if (discountPercent > 5 && (!data.discountReason || data.discountReason.trim().length < 3)) {
    return false;
  }
  return true;
}, {
  message: 'Discount cannot exceed line subtotal. Discounts > 5% require a reason (min 3 characters)',
  path: ['discount']
}).refine(data => {
  // Validate calculation precision
  const expectedSubtotal = Math.round(data.unitPrice * data.quantity * 100) / 100;
  const expectedTotal = Math.round((expectedSubtotal - data.discount + (data.taxAmount || 0)) * 100) / 100;
  return Math.abs(data.total - expectedTotal) < 0.01;
}, {
  message: 'Line total calculation mismatch. Check precision.',
  path: ['total']
});

// Payment with new types
export const PaymentSchema = z.object({
  method: PaymentMethodSchema,
  amount: currencySchema,
  reference: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
}).refine(data => {
  // Require reference for non-cash payments
  if (data.method !== 'CASH' && data.method !== 'CREDIT') {
    if (!data.reference || data.reference.trim().length < 3) {
      return false;
    }
  }
  // Validate mobile money reference format
  if ((data.method === 'MOBILE_MONEY' || data.method === 'AIRTEL_MONEY') && data.reference) {
    // Should be alphanumeric, min 6 chars
    if (!/^[A-Z0-9]{6,}$/i.test(data.reference)) {
      return false;
    }
  }
  return true;
}, {
  message: 'Payment reference required (min 3 chars). Mobile money requires alphanumeric code (min 6 chars)',
  path: ['reference']
});

// Held Sale Schema
export const HoldSaleSchema = z.object({
  customerId: z.string().optional().nullable(),
  items: z.array(POSLineItemSchema).min(1, 'At least one item required'),
  subtotal: currencySchema,
  taxAmount: currencySchema.optional().default(0),
  discount: currencySchema.optional().default(0),
  total: currencySchema,
  notes: z.string().max(500).optional().nullable(),
}).refine(data => {
  // Validate total calculation
  const calculatedTotal = Math.round((data.subtotal + data.taxAmount - data.discount) * 100) / 100;
  return Math.abs(data.total - calculatedTotal) < 0.01;
}, {
  message: 'Total calculation mismatch',
  path: ['total']
});

// Complete Sale with round-off
export const CompleteSaleSchema = z.object({
  customerId: z.string().optional().nullable(),
  items: z.array(POSLineItemSchema).min(1, 'At least one item required'),
  subtotal: currencySchema,
  taxAmount: currencySchema.optional().default(0),
  discount: currencySchema.optional().default(0),
  roundOffAmount: currencySchema.optional().default(0),
  total: currencySchema,
  payments: z.array(PaymentSchema).min(1, 'At least one payment required'),
  notes: z.string().max(500).optional().nullable(),
}).refine(data => {
  // Validate total calculation with round-off
  const beforeRoundOff = Math.round((data.subtotal + data.taxAmount - data.discount) * 100) / 100;
  const expectedTotal = Math.round((beforeRoundOff + data.roundOffAmount) * 100) / 100;
  return Math.abs(data.total - expectedTotal) < 0.01;
}, {
  message: 'Total calculation mismatch including round-off',
  path: ['total']
}).refine(data => {
  // Validate round-off amount is reasonable (-50 to +50)
  if (Math.abs(data.roundOffAmount) > 50) {
    return false;
  }
  return true;
}, {
  message: 'Round-off amount must be between -50 and +50',
  path: ['roundOffAmount']
}).refine(data => {
  // Validate payment total matches sale total
  const totalPayments = data.payments.reduce((sum, p) => sum + p.amount, 0);
  const roundedTotal = Math.round(totalPayments * 100) / 100;
  return Math.abs(roundedTotal - data.total) < 0.01;
}, {
  message: 'Payment total must match sale total',
  path: ['payments']
});

// Price override validation
export const PriceOverrideSchema = z.object({
  newPrice: currencySchema,
  originalPrice: currencySchema,
  reason: z.string().min(3, 'Reason required (min 3 characters)').max(255),
}).refine(data => {
  const maxAllowedOverride = data.originalPrice * 2;
  const minAllowedOverride = data.originalPrice * 0.1;
  return data.newPrice >= minAllowedOverride && data.newPrice <= maxAllowedOverride;
}, {
  message: 'New price must be between 10% and 200% of original price',
  path: ['newPrice']
});

// Discount validation
export const DiscountSchema = z.object({
  amount: currencySchema,
  maxAmount: currencySchema,
  reason: z.string().max(255).optional().nullable(),
}).refine(data => {
  if (data.amount > data.maxAmount) {
    return false;
  }
  const discountPercent = (data.amount / data.maxAmount) * 100;
  if (discountPercent > 5 && (!data.reason || data.reason.trim().length < 3)) {
    return false;
  }
  return true;
}, {
  message: 'Discount cannot exceed maximum amount. Discounts > 5% require a reason (min 3 characters)',
  path: ['amount']
});

// Round-off calculation schema
export const RoundOffSchema = z.object({
  originalTotal: currencySchema,
  roundTo: z.enum(['50', '100', '500', '1000', 'custom']),
  customAmount: currencySchema.optional(),
}).refine(data => {
  if (data.roundTo === 'custom' && (data.customAmount === undefined || data.customAmount === null)) {
    return false;
  }
  return true;
}, {
  message: 'Custom round amount required when roundTo is custom',
  path: ['customAmount']
});

// Export types
export type POSLineItem = z.infer<typeof POSLineItemSchema>;
export type Payment = z.infer<typeof PaymentSchema>;
export type HoldSale = z.infer<typeof HoldSaleSchema>;
export type CompleteSale = z.infer<typeof CompleteSaleSchema>;
export type PriceOverride = z.infer<typeof PriceOverrideSchema>;
export type Discount = z.infer<typeof DiscountSchema>;
export type RoundOff = z.infer<typeof RoundOffSchema>;
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
