import { z } from 'zod';

/**
 * Purchase Validation Schemas
 * 
 * These schemas validate purchase/goods receipt data for:
 * - Recording purchases from suppliers
 * - Creating goods receipts
 * - Processing purchase returns
 * 
 * Features:
 * - Required fields: supplier, items, payment information
 * - Optional fields: reference number, notes
 * - Business rules: quantity > 0, prices > 0, valid payment methods
 * - Stock management validation
 */

/**
 * Purchase Item Schema
 * Individual line item in a purchase
 */
export const PurchaseItemSchema = z.object({
  productId: z.string()
    .trim()
    .min(1, 'Product ID is required'),
  
  quantity: z.number()
    .positive('Quantity must be greater than 0')
    .int('Quantity must be a whole number'),
  
  unitCost: z.number()
    .positive('Unit cost must be greater than 0')
    .multipleOf(0.01, 'Cost can have at most 2 decimal places')
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) {
        throw new Error('Valid unit cost required');
      }
      return Math.round(num * 100) / 100;
    })),
  
  discount: z.number()
    .nonnegative('Discount cannot be negative')
    .max(1, 'Discount cannot exceed 100%')
    .multipleOf(0.0001, 'Discount can have at most 4 decimal places')
    .optional()
    .default(0)
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num < 0 || num > 1) {
        throw new Error('Valid discount required (0-1)');
      }
      return Math.round(num * 10000) / 10000;
    }).optional()),
  
  notes: z.string()
    .max(200, 'Item notes cannot exceed 200 characters')
    .optional()
    .nullable(),
});

/**
 * Create Purchase Schema
 * Used when recording a new purchase via POST /api/purchases
 */
export const CreatePurchaseSchema = z.object({
  supplierId: z.string()
    .trim()
    .min(1, 'Supplier ID is required'),
  
  items: z.array(PurchaseItemSchema)
    .min(1, 'At least one item is required'),
  
  referenceNumber: z.string()
    .trim()
    .max(100, 'Reference number cannot exceed 100 characters')
    .optional()
    .nullable(),
  
  purchaseDate: z.string()
    .trim()
    .datetime({ message: 'Purchase date must be a valid ISO datetime' })
    .optional()
    .or(z.date().transform(date => date.toISOString())),
  
  paymentMethod: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'CREDIT', 'OTHER'], {
    errorMap: () => ({ message: 'Invalid payment method' })
  }).optional(),
  
  paymentReference: z.string()
    .trim()
    .max(100, 'Payment reference cannot exceed 100 characters')
    .optional()
    .nullable(),
  
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
    .multipleOf(0.01, 'Tax can have at most 2 decimal places')
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
 * Update Purchase Schema
 * Used when updating an existing purchase via PUT /api/purchases/:id
 */
export const UpdatePurchaseSchema = z.object({
  referenceNumber: z.string()
    .trim()
    .max(100, 'Reference number cannot exceed 100 characters')
    .optional()
    .nullable(),
  
  paymentMethod: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'CREDIT', 'OTHER'])
    .optional(),
  
  paymentReference: z.string()
    .trim()
    .max(100, 'Payment reference cannot exceed 100 characters')
    .optional()
    .nullable(),
  
  notes: z.string()
    .max(500, 'Notes cannot exceed 500 characters')
    .optional()
    .nullable(),
  
  status: z.enum(['DRAFT', 'COMPLETED', 'CANCELLED']).optional(),
});

// TypeScript types for use in route handlers
export type CreatePurchaseInput = z.infer<typeof CreatePurchaseSchema>;
export type UpdatePurchaseInput = z.infer<typeof UpdatePurchaseSchema>;
export type PurchaseItemInput = z.infer<typeof PurchaseItemSchema>;
