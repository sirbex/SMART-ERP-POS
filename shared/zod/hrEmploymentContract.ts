/**
 * Zod for employment contract lifecycle actions.
 * SSOT: shared/hr/employmentContractSsot.ts
 */

import { z } from 'zod';
import {
  EMPLOYMENT_TYPES,
  assertContractDateRange,
  type EmploymentType,
} from '../hr/employmentContractSsot.js';

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');
const ymdOptional = z
  .union([ymd, z.literal(''), z.null()])
  .optional()
  .transform((v) => (!v ? null : v));

export const CreateContractSchema = z
  .object({
    employmentType: z.enum(EMPLOYMENT_TYPES),
    startDate: ymd,
    endDate: ymdOptional,
    probationEndDate: ymdOptional,
    contractNumber: z.string().trim().max(60).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    signNow: z.boolean().optional().default(false),
  })
  .superRefine((val, ctx) => {
    try {
      assertContractDateRange({
        startDate: val.startDate,
        endDate: val.endDate,
        employmentType: val.employmentType as EmploymentType,
        probationEndDate: val.probationEndDate,
      });
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: e instanceof Error ? e.message : 'Invalid contract dates',
      });
    }
  });

export const SignContractSchema = z.object({
  signedAt: ymdOptional,
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const RenewContractSchema = z
  .object({
    startDate: ymd,
    endDate: ymd, // renewal of fixed-term always needs new end
    probationEndDate: ymdOptional,
    contractNumber: z.string().trim().max(60).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    signNow: z.boolean().optional().default(true),
  })
  .superRefine((val, ctx) => {
    if (val.endDate < val.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Renewal endDate cannot be before startDate',
      });
    }
  });

export const ConvertEmploymentSchema = z
  .object({
    toType: z.enum(['PERMANENT', 'CONTRACT']),
    effectiveDate: ymd,
    endDate: ymdOptional, // required if toType=CONTRACT
    probationEndDate: ymdOptional,
    notes: z.string().trim().max(2000).optional().nullable(),
    signNow: z.boolean().optional().default(true),
  })
  .superRefine((val, ctx) => {
    if (val.toType === 'CONTRACT' && !val.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Converting to CONTRACT requires endDate',
      });
    }
    if (val.toType === 'PERMANENT' && val.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Converting to PERMANENT must not set endDate',
      });
    }
  });

export const ExpireContractSchema = z.object({
  asOfDate: ymdOptional,
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type CreateContractInput = z.infer<typeof CreateContractSchema>;
export type SignContractInput = z.infer<typeof SignContractSchema>;
export type RenewContractInput = z.infer<typeof RenewContractSchema>;
export type ConvertEmploymentInput = z.infer<typeof ConvertEmploymentSchema>;
export type ExpireContractInput = z.infer<typeof ExpireContractSchema>;
