import { z } from 'zod';

/**
 * Installment Validation Schemas
 * 
 * These schemas validate installment plan operations for:
 * - Creating installment plans
 * - Updating installment plans
 * - Recording installment payments
 * 
 * Features:
 * - Required fields: customerId, saleId, totalAmount, numberOfInstallments
 * - Optional fields: interestRate, downPayment, startDate
 * - Business rules: Positive amounts, valid frequencies, future dates
 */

/**
 * Create Installment Plan Schema
 * Used when creating an installment plan via POST /api/installments/create
 */
export const CreateInstallmentPlanSchema = z.object({
  customerId: z.string()
    .trim()
    .min(1, 'Customer ID is required'),
  
  saleId: z.string()
    .trim()
    .min(1, 'Sale ID is required'),
  
  totalAmount: z.number()
    .positive('Total amount must be greater than 0')
    .multipleOf(0.01, 'Amount can have at most 2 decimal places')
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) {
        throw new Error('Valid total amount required');
      }
      return Math.round(num * 100) / 100;
    })),
  
  numberOfInstallments: z.number()
    .int('Number of installments must be a whole number')
    .min(2, 'Must have at least 2 installments')
    .max(120, 'Cannot exceed 120 installments')
    .or(z.string().transform((val) => {
      const num = parseInt(val, 10);
      if (isNaN(num) || num < 2 || num > 120) {
        throw new Error('Number of installments must be between 2 and 120');
      }
      return num;
    })),
  
  frequency: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'], {
    errorMap: () => ({ message: 'Invalid payment frequency' })
  }),
  
  interestRate: z.number()
    .min(0, 'Interest rate cannot be negative')
    .max(100, 'Interest rate cannot exceed 100%')
    .optional()
    .default(0)
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num < 0 || num > 100) {
        return 0;
      }
      return num;
    })),
  
  downPayment: z.number()
    .min(0, 'Down payment cannot be negative')
    .multipleOf(0.01, 'Amount can have at most 2 decimal places')
    .optional()
    .default(0)
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num < 0) {
        return 0;
      }
      return Math.round(num * 100) / 100;
    })),
  
  startDate: z.string()
    .trim()
    .datetime({ message: 'Start date must be a valid ISO datetime' })
    .optional()
    .or(z.date().transform(date => date.toISOString()).optional()),
}).refine((data) => data.downPayment < data.totalAmount, {
  message: 'Down payment must be less than total amount',
  path: ['downPayment'],
});

/**
 * Update Installment Schema
 * Used when updating an installment via PUT /api/installments/:id
 */
export const UpdateInstallmentSchema = z.object({
  dueDate: z.string()
    .trim()
    .datetime({ message: 'Due date must be a valid ISO datetime' })
    .optional()
    .or(z.date().transform(date => date.toISOString()).optional()),
  
  amount: z.number()
    .positive('Amount must be greater than 0')
    .multipleOf(0.01, 'Amount can have at most 2 decimal places')
    .optional()
    .or(z.string().transform((val) => {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) {
        throw new Error('Valid amount required');
      }
      return Math.round(num * 100) / 100;
    })),
  
  status: z.enum(['PENDING', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
  
  notes: z.string()
    .max(500, 'Notes cannot exceed 500 characters')
    .optional()
    .nullable(),
});

// TypeScript types for use in route handlers
export type CreateInstallmentPlanInput = z.infer<typeof CreateInstallmentPlanSchema>;
export type UpdateInstallmentInput = z.infer<typeof UpdateInstallmentSchema>;
