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
  /**
   * Required when replace would unallocate receipts and/or leave surplus on-account
   * (customer GL can go into credit). UI must show impact and resubmit with true.
   */
  confirmImpact: z.boolean().optional(),
});

/**
 * Body for POST /customers/opening-balance/increase
 * Smart path (Tally/SAP/Odoo style): user enters the amount TO ADD, not a rewritten total
 * and not "today's outstanding". Server derives new cutover document total.
 */
export const CustomerOpeningBalanceIncreaseSchema = z.object({
  customerId: z.string().uuid(),
  /** Positive amount to add on top of the active cutover document total. */
  increaseBy: positiveFiniteAmount,
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional(),
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
  confirmImpact: z.boolean().optional(),
});

/** Body for POST /customers/opening-balance/cancel */
export const CustomerOpeningBalanceCancelSchema = z.object({
  invoiceId: z.string().uuid(),
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
});
