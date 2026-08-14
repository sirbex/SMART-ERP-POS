/**
 * HR employee create/update Zod — SSOT for HTTP + client forms.
 * Field catalog + max lengths: shared/hr/employeeMasterSsot.ts
 * Cross-field rules (create): shared/hr/employeeMasterIntegrity.ts
 * Cross-field rules (update): service merges existing + patch then asserts.
 */

import { z } from 'zod';
import {
  EMPLOYEE_GENDERS,
  EMPLOYEE_MARITAL_STATUSES,
  EMPLOYEE_MOMO_PROVIDERS,
  EMPLOYEE_PAYMENT_METHODS,
  EMPLOYEE_MASTER_FIELD_MAX as MAX,
} from '../hr/employeeMasterSsot.js';
import { EMPLOYMENT_TYPES, EMPLOYEE_STATUSES } from '../hr/employeeIdentitySsot.js';
import { requiresContractEndDate, type EmploymentType } from '../hr/employmentContractSsot.js';
import { assertEmployeeMasterIntegrity } from '../hr/employeeMasterIntegrity.js';

const ymdOptional = z
  .union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    z.literal(''),
    z.null(),
  ])
  .optional()
  .transform((v) => (!v ? null : v));

const strOptional = (max: number) =>
  z
    .union([z.string().max(max), z.literal(''), z.null()])
    .optional()
    .transform((v) => {
      if (v == null || v === '') return null;
      const t = String(v).trim();
      return t.length ? t : null;
    });

const emailOptional = z
  .union([z.string().email().max(MAX.email), z.literal(''), z.null()])
  .optional()
  .transform((v) => (!v ? null : String(v).trim()));

const uuidOptional = z.string().uuid().optional().nullable();

/** Empty select → null (never send "" into PG CHECK enums). */
const enumOrNull = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.enum(values).nullable()
  );

const EmployeeMasterBodyBase = z.object({
  userId: uuidOptional,
  firstName: z.string().trim().min(1).max(MAX.firstName),
  lastName: z.string().trim().min(1).max(MAX.lastName),
  phone: strOptional(MAX.phone),
  email: emailOptional,
  departmentId: uuidOptional,
  positionId: uuidOptional,
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  endDate: ymdOptional,
  employmentType: z.enum(EMPLOYMENT_TYPES).optional().default('PERMANENT'),
  monthlyAllowance: z.number().nonnegative().finite().optional(),

  employeeNumber: strOptional(MAX.employeeNumber),
  nationalId: strOptional(MAX.nationalId),
  dateOfBirth: ymdOptional,
  gender: enumOrNull(EMPLOYEE_GENDERS).optional(),
  nationality: strOptional(MAX.nationality),
  maritalStatus: enumOrNull(EMPLOYEE_MARITAL_STATUSES).optional(),

  addressLine1: strOptional(MAX.addressLine1),
  addressDistrict: strOptional(MAX.addressDistrict),

  nextOfKinName: strOptional(MAX.nextOfKinName),
  nextOfKinPhone: strOptional(MAX.nextOfKinPhone),
  nextOfKinRelation: strOptional(MAX.nextOfKinRelation),

  nssfNumber: strOptional(MAX.nssfNumber),
  tinNumber: strOptional(MAX.tinNumber),

  bankName: strOptional(MAX.bankName),
  bankBranch: strOptional(MAX.bankBranch),
  bankAccountNumber: strOptional(MAX.bankAccountNumber),
  bankAccountName: strOptional(MAX.bankAccountName),
  mobileMoneyNumber: strOptional(MAX.mobileMoneyNumber),
  mobileMoneyProvider: enumOrNull(EMPLOYEE_MOMO_PROVIDERS).optional(),
  preferredPaymentMethod: enumOrNull(EMPLOYEE_PAYMENT_METHODS).optional(),

  /** Initial engagement extras (seed employee_contracts on create). */
  probationEndDate: ymdOptional,
  contractNumber: strOptional(60),
  signContract: z.boolean().optional().default(false),
});

export const CreateEmployeeSchema = EmployeeMasterBodyBase.superRefine((val, ctx) => {
  try {
    assertEmployeeMasterIntegrity(val);
  } catch (e) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: e instanceof Error ? e.message : 'Employee master integrity failed',
    });
  }
  const et = (val.employmentType ?? 'PERMANENT') as EmploymentType;
  if (requiresContractEndDate(et) && !val.endDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endDate'],
      message: `${et} requires a planned contract end date`,
    });
  }
  if (et === 'PERMANENT' && val.endDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endDate'],
      message: 'PERMANENT hire must not set endDate on create — use End Employment to leave',
    });
  }
});

/** Partial patch only — lengths/enums. Merged integrity is enforced in hr.service. */
export const UpdateEmployeeSchema = EmployeeMasterBodyBase.partial().extend({
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  firstName: z.string().trim().min(1).max(MAX.firstName).optional(),
  lastName: z.string().trim().min(1).max(MAX.lastName).optional(),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
});

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>;
