import { z } from 'zod';

/** Shared query fields for paginated ERP lists (sort + balance filters). */
export const EnterpriseListQueryFields = {
  sortBy: z.string().optional(),
  sortOrder: z
    .string()
    .optional()
    .transform((v) => (v?.toLowerCase() === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc'),
  outstandingOnly: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true' || v === '1'),
  balanceGt: z
    .string()
    .optional()
    .transform((v) => (v != null && v !== '' ? parseFloat(v) : undefined)),
  stockGt: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true' || v === '1'),
  paymentTerms: z.string().optional(),
};

export type EnterpriseListQueryInput = {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  outstandingOnly?: boolean;
  balanceGt?: number;
  stockGt?: boolean;
  paymentTerms?: string;
};
