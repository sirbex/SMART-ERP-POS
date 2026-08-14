/**
 * Zod for payroll pay runs — SSOT: shared/hr/payrollPaySsot.ts
 */

import { z } from 'zod';
import { PAYROLL_PAY_MODES } from '../hr/payrollPaySsot.js';

const PayLineSchema = z.object({
  employeeId: z.string().uuid(),
  amount: z.number().positive().finite(),
});

export const PayPayrollSchema = z
  .object({
    paymentAccountCode: z.string().min(1).max(20),
    paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    notes: z.string().max(1000).optional().nullable(),
    /** Default ALL — whole remaining period payroll. */
    mode: z.enum(PAYROLL_PAY_MODES).optional().default('ALL'),
    /** SELECTED: pay full remaining for these employees. */
    employeeIds: z.array(z.string().uuid()).optional(),
    /** PARTIAL: explicit cash amounts (≤ remaining). */
    lines: z.array(PayLineSchema).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.mode === 'ALL' && (val.employeeIds?.length || val.lines?.length)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'mode=ALL must not include employeeIds or lines',
      });
    }
    if (val.mode === 'SELECTED' && (!val.employeeIds || val.employeeIds.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'mode=SELECTED requires employeeIds',
        path: ['employeeIds'],
      });
    }
    if (val.mode === 'SELECTED' && val.lines?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'mode=SELECTED cannot include lines — use PARTIAL for amounts',
      });
    }
    if (val.mode === 'PARTIAL' && (!val.lines || val.lines.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'mode=PARTIAL requires lines[{ employeeId, amount }]',
        path: ['lines'],
      });
    }
  });

export type PayPayrollInput = z.infer<typeof PayPayrollSchema>;
