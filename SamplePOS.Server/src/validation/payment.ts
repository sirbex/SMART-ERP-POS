import { z } from 'zod';

/**
 * Payment Validation Schemas
 * 
 * These schemas validate payment operations for:
 * - Recording payments
 * - Processing refunds
 * - Payment installments
 * 
 * Features:
 * - Required fields: amount, payment method
 * - Optional fields: reference, customer
 * - Business rules: Positive amounts, valid payment methods
 * - Receipt generation support
 */

/**
 * Create Payment Schema
 * Used when recording a payment via POST /api/payments
 */
export const CreatePaymentSchema = z.object({
  customerId: z.string()
    .trim()
    .optional()
    .nullable(),
  
  saleId: z.string()
    .trim()
    .optional()
    .nullable(),
  
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
  
  paymentMethod: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'], {
    errorMap: () => ({ message: 'Invalid payment method' })
  }),
  
  reference: z.string()
    .trim()
    .max(100, 'Payment reference cannot exceed 100 characters')
    .optional()
    .nullable(),
  
  paymentDate: z.string()
    .trim()
    .datetime({ message: 'Payment date must be a valid ISO datetime' })
    .optional()
    .or(z.date().transform(date => date.toISOString()).optional()),
  
  notes: z.string()
    .max(500, 'Notes cannot exceed 500 characters')
    .optional()
    .nullable(),
});

/**
 * Update Payment Schema
 * Used when updating a payment via PUT /api/payments/:id
 */
export const UpdatePaymentSchema = z.object({
  reference: z.string()
    .trim()
    .max(100, 'Payment reference cannot exceed 100 characters')
    .optional()
    .nullable(),
  
  notes: z.string()
    .max(500, 'Notes cannot exceed 500 characters')
    .optional()
    .nullable(),
  
  status: z.enum(['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(),
});

/**
 * Installment Payment Schema
 * Used when recording an installment payment via POST /api/installments/:id/payment
 */
export const InstallmentPaymentSchema = z.object({
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
  
  paymentMethod: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'], {
    errorMap: () => ({ message: 'Invalid payment method' })
  }),
  
  reference: z.string()
    .trim()
    .max(100, 'Payment reference cannot exceed 100 characters')
    .optional()
    .nullable(),
  
  notes: z.string()
    .max(500, 'Notes cannot exceed 500 characters')
    .optional()
    .nullable(),
});

/**
 * Refund Payment Schema
 * Used when processing a refund via POST /api/payments/:id/refund
 */
export const RefundPaymentSchema = z.object({
  amount: z.number()
    .positive('Refund amount must be greater than 0')
    .multipleOf(0.01, 'Amount can have at most 2 decimal places')
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) {
        throw new Error('Valid refund amount required');
      }
      return Math.round(num * 100) / 100;
    })),
  
  reason: z.string()
    .trim()
    .min(1, 'Refund reason is required')
    .max(500, 'Reason cannot exceed 500 characters'),
  
  refundMethod: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'ORIGINAL_METHOD'], {
    errorMap: () => ({ message: 'Invalid refund method' })
  }).optional(),
  
  notes: z.string()
    .max(500, 'Notes cannot exceed 500 characters')
    .optional()
    .nullable(),
});

// TypeScript types for use in route handlers
export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>;
export type UpdatePaymentInput = z.infer<typeof UpdatePaymentSchema>;
export type InstallmentPaymentInput = z.infer<typeof InstallmentPaymentSchema>;
export type RefundPaymentInput = z.infer<typeof RefundPaymentSchema>;
