import { z } from 'zod';
import { positiveFiniteAmount } from './numeric.js';

/** Body for POST /customers/opening-balance */
export const CustomerOpeningBalanceSchema = z.object({
  customerId: z.string().uuid(),
  amount: positiveFiniteAmount,
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional(),
  /** Required business justification (audit trail). */
  postReason: z.string().min(5, 'Reason must be at least 5 characters'),
});

/** Body for POST /customers/opening-balance/replace */
export const CustomerOpeningBalanceReplaceSchema = CustomerOpeningBalanceSchema.omit({
  postReason: true,
}).extend({
  replaceReason: z.string().min(5, 'Reason must be at least 5 characters'),
});

/** Body for POST /customers/opening-balance/cancel */
export const CustomerOpeningBalanceCancelSchema = z.object({
  invoiceId: z.string().uuid(),
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
});
