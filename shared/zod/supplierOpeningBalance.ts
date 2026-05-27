import { z } from 'zod';

/** Body for POST /supplier-payments/invoices/opening-balance */
export const SupplierOpeningBalanceSchema = z.object({
  supplierId: z.string().uuid(),
  amount: z.union([z.number().positive(), z.string().transform(Number)]),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional(),
});

/** Body for POST .../opening-balance/replace */
export const SupplierOpeningBalanceReplaceSchema = SupplierOpeningBalanceSchema.extend({
  replaceReason: z.string().min(5),
});

/** Body for POST .../opening-balance/cancel */
export const SupplierOpeningBalanceCancelSchema = z.object({
  invoiceId: z.string().uuid(),
  reason: z.string().min(5),
});
