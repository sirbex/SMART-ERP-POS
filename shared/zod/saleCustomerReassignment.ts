import { z } from 'zod';

/** fromCustomerId null/omitted = walk-in source */
export const SaleCustomerReassignmentBodySchema = z.object({
  saleId: z.string().uuid(),
  fromCustomerId: z.string().uuid().nullable().optional(),
  toCustomerId: z.string().uuid(),
  reason: z.string().min(3).max(2000),
});

export type SaleCustomerReassignmentBody = z.infer<typeof SaleCustomerReassignmentBodySchema>;

export const SaleCustomerReassignmentExecuteSchema = SaleCustomerReassignmentBodySchema;

export type SaleCustomerReassignmentExecuteBody = z.infer<
  typeof SaleCustomerReassignmentExecuteSchema
>;
