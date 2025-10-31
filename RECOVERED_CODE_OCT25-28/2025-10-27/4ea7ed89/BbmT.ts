import { z } from 'zod';

/**
 * Sales Validation Schemas
 * 
 * These schemas validate sales/transaction data for:
 * - Creating new sales
 * - Recording payments
 * - Processing refunds
 * 
 * Features:
 * - Required fields: items, payment information
 * - Optional fields: customer, discount, notes
 * - Business rules: quantity > 0, prices > 0, valid payment methods
 * - Transaction integrity validation
 */

/**
 * Sale Item Schema
 * Individual line item in a sale
 */
export const SaleItemSchema = z.object({
  productId: z.string()
    .trim()
    .min(1, 'Product ID is required'),
  
  // Allow fractional quantities (e.g., 1.5 box) — precision handled server-side
  quantity: z.number()
    .positive('Quantity must be greater than 0')
    .refine((v) => Number.isFinite(v), { message: 'Quantity must be a number' }),
  
  unit: z.string()
    .optional()
    .nullable(),
  
  uomId: z.string()
    .cuid('Invalid UoM ID')
    .optional()
    .nullable(),
  
  unitPrice: z.number()
    .positive('Unit price must be greater than 0')
    .multipleOf(0.01, 'Price can have at most 2 decimal places')
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) {
        throw new Error('Valid unit price required');
      }
      return Math.round(num * 100) / 100;
    })),
  
  // Treat discount as amount (currency), not percentage
  discount: z.number()
    .nonnegative('Discount cannot be negative')
    .multipleOf(0.01, 'Discount can have at most 2 decimal places')
    .optional()
    .default(0)
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num < 0) {
        throw new Error('Valid discount amount required');
      }
      return Math.round(num * 100) / 100;
    }).optional()),
  
  taxRate: z.number()
    .nonnegative('Tax rate cannot be negative')
    .max(1, 'Tax rate cannot exceed 100%')
    .multipleOf(0.0001, 'Tax rate can have at most 4 decimal places')
    .optional()
    .default(0)
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num < 0 || num > 1) {
        throw new Error('Valid tax rate required (0-1)');
      }
      return Math.round(num * 10000) / 10000;
    }).optional()),
  
  notes: z.string()
    .max(200, 'Item notes cannot exceed 200 characters')
    .optional()
    .nullable(),
});

/**
 * Payment Schema
 * Payment information for a sale
 */
export const PaymentSchema = z.object({
  // Align with Prisma enum PaymentMethod and POS client
  method: z.enum([
    'CASH',
    'CARD',
    'CREDIT',
    'BANK_TRANSFER',
    'MOBILE_MONEY',
    'AIRTEL_MONEY',
    'FLEX_PAY',
  ], { errorMap: () => ({ message: 'Invalid payment method' }) }),

  amount: z.number()
    .positive('Payment amount must be greater than 0')
    .multipleOf(0.01, 'Amount can have at most 2 decimal places')
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) {
        throw new Error('Valid payment amount required');
      }
      return Math.round(num * 100) / 100;
    })),

  reference: z.string()
    .trim()
    .max(100, 'Payment reference cannot exceed 100 characters')
    .optional()
    .nullable(),
}).refine((data) => {
  // Require reference for non-cash and non-credit methods
  if (data.method !== 'CASH' && data.method !== 'CREDIT') {
    if (!data.reference || data.reference.trim().length < 3) {
      return false;
    }
  }
  // Mobile money providers require alphanumeric, min 6 chars
  if ((data.method === 'MOBILE_MONEY' || data.method === 'AIRTEL_MONEY') && data.reference) {
    if (!/^[A-Z0-9]{6,}$/i.test(data.reference)) {
      return false;
    }
  }
  return true;
}, {
  message: 'Payment reference required (min 3 chars). Mobile money references must be alphanumeric and at least 6 characters.',
  path: ['reference']
});

/**
 * Create Sale Schema
 * Used when creating a new sale via POST /api/sales
 */
export const CreateSaleSchema = z.object({
  customerId: z.string()
    .trim()
    .optional()
    .nullable(),
  
  items: z.array(SaleItemSchema)
    .min(1, 'At least one item is required'),
  
  payments: z.array(PaymentSchema)
    .min(1, 'At least one payment is required'),
  
  subtotal: z.number()
    .nonnegative('Subtotal cannot be negative')
    .multipleOf(0.01, 'Subtotal can have at most 2 decimal places')
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num < 0) {
        throw new Error('Valid subtotal required');
      }
      return Math.round(num * 100) / 100;
    })),
  
  discount: z.number()
    .nonnegative('Discount cannot be negative')
    .multipleOf(0.01, 'Discount can have at most 2 decimal places')
    .optional()
    .default(0)
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num < 0) {
        throw new Error('Valid discount required');
      }
      return Math.round(num * 100) / 100;
    }).optional()),
  
  tax: z.number()
    .nonnegative('Tax cannot be negative')
    .transform(val => Math.round(val * 100) / 100) // Always round to 2 decimal places
    .optional()
    .default(0)
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num < 0) {
        throw new Error('Valid tax required');
      }
      return Math.round(num * 100) / 100;
    }).optional()),
  
  total: z.number()
    .positive('Total must be greater than 0')
    .multipleOf(0.01, 'Total can have at most 2 decimal places')
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) {
        throw new Error('Valid total required');
      }
      return Math.round(num * 100) / 100;
    })),
  
  notes: z.string()
    .max(500, 'Notes cannot exceed 500 characters')
    .optional()
    .nullable(),
});

/**
 * Refund Sale Schema
 * Used when processing a refund via POST /api/sales/:id/refund
 */
export const RefundSaleSchema = z.object({
  reason: z.string()
    .trim()
    .min(1, 'Refund reason is required')
    .max(500, 'Refund reason cannot exceed 500 characters'),
  
  amount: z.number()
    .positive('Refund amount must be greater than 0')
    .multipleOf(0.01, 'Amount can have at most 2 decimal places')
    .optional()
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) {
        throw new Error('Valid refund amount required');
      }
      return Math.round(num * 100) / 100;
    }).optional()),
  
  items: z.array(z.object({
    saleItemId: z.string().trim().min(1, 'Sale item ID is required'),
    quantity: z.number().positive('Refund quantity must be greater than 0').int('Quantity must be whole number')
  })).optional(),
});

// TypeScript types for use in route handlers
export type CreateSaleInput = z.infer<typeof CreateSaleSchema>;
export type SaleItemInput = z.infer<typeof SaleItemSchema>;
export type PaymentInput = z.infer<typeof PaymentSchema>;
export type RefundSaleInput = z.infer<typeof RefundSaleSchema>;
