import { z } from 'zod';

/** Restate posted sale tax from current DocumentTax rules (product + customer SSOT). */
export const SaleTaxRestatementBodySchema = z.object({
  saleId: z.string().uuid(),
  reason: z.string().min(5).max(2000),
});

export type SaleTaxRestatementBody = z.infer<typeof SaleTaxRestatementBodySchema>;

export const SaleTaxRestatementExecuteSchema = SaleTaxRestatementBodySchema;

export type SaleTaxRestatementExecuteBody = z.infer<typeof SaleTaxRestatementExecuteSchema>;
