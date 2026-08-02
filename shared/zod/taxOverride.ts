import { z } from 'zod';

/** DocumentTax Phase 5 — privileged VAT/tax override on a sale document. */
export const TaxOverrideModeSchema = z.enum(['FORCE_EXEMPT', 'FORCE_RATE']);

export const DocumentTaxOverrideSchema = z
  .object({
    mode: TaxOverrideModeSchema,
    /** Required when mode is FORCE_RATE (percent, e.g. 18). */
    rate: z.number().nonnegative().finite().optional(),
    reason: z.string().trim().min(5).max(500),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.mode === 'FORCE_RATE') {
      if (data.rate === undefined || Number.isNaN(data.rate)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rate'],
          message: 'FORCE_RATE requires a non-negative rate',
        });
      }
    }
  });

export type TaxOverrideMode = z.infer<typeof TaxOverrideModeSchema>;
export type DocumentTaxOverride = z.infer<typeof DocumentTaxOverrideSchema>;
