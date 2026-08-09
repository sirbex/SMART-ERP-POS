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
  /**
   * Master data visibility: active (default) | inactive | all.
   * Named activeStatus (not status) so list schemas can still use document status.
   */
  activeStatus: z
    .string()
    .optional()
    .transform((v) => {
      const s = String(v || '').toLowerCase();
      if (s === 'inactive' || s === 'all' || s === 'active') return s as 'active' | 'inactive' | 'all';
      return undefined;
    }),
};

export type EnterpriseListQueryInput = {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  outstandingOnly?: boolean;
  balanceGt?: number;
  stockGt?: boolean;
  paymentTerms?: string;
  activeStatus?: 'active' | 'inactive' | 'all';
};
