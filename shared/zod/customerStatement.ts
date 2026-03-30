// Customer Statement Zod Schemas - shared between backend and frontend
import { z } from 'zod';

export const CustomerStatementEntrySchema = z.object({
  date: z.string(), // ISO string
  type: z.enum(['OPENING', 'INVOICE', 'PAYMENT', 'ADJUSTMENT', 'DEPOSIT', 'DEPOSIT_APPLIED', 'CREDIT_NOTE', 'DEBIT_NOTE']),
  reference: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  debit: z.number().nonnegative(), // Increases what customer owes
  credit: z.number().nonnegative(), // Decreases what customer owes
  balanceAfter: z.number(),
});

export const CustomerStatementSchema = z.object({
  customerId: z.string().uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
  openingBalance: z.number(),
  closingBalance: z.number(),
  entries: z.array(CustomerStatementEntrySchema),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
  totalEntries: z.number().int().nonnegative().optional(),
}).strict();

export type CustomerStatementEntry = z.infer<typeof CustomerStatementEntrySchema>;
export type CustomerStatement = z.infer<typeof CustomerStatementSchema>;
