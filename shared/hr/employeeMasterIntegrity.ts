/**
 * Employee master integrity — fail-loud business rules (SAP/Odoo-grade).
 * No silent clamps, no partial kin/payment, no DOB after hire.
 *
 * Length catalog: shared/hr/employeeMasterSsot.ts (EMPLOYEE_MASTER_FIELD_MAX)
 */

import {
  EMPLOYEE_MASTER_FIELD_MAX,
  isEmployeeGender,
  isEmployeeMaritalStatus,
  isEmployeeMomoProvider,
  isEmployeePaymentMethod,
  type EmployeeGender,
  type EmployeeMaritalStatus,
  type EmployeeMomoProvider,
  type EmployeePaymentMethod,
} from './employeeMasterSsot.js';

export type EmployeeMasterIntegrityInput = {
  hireDate: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  maritalStatus?: string | null;
  nextOfKinName?: string | null;
  nextOfKinPhone?: string | null;
  nextOfKinRelation?: string | null;
  bankName?: string | null;
  bankBranch?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  mobileMoneyNumber?: string | null;
  mobileMoneyProvider?: string | null;
  preferredPaymentMethod?: string | null;
  nationalId?: string | null;
  employeeNumber?: string | null;
  nssfNumber?: string | null;
  tinNumber?: string | null;
};

const MIN_HIRE_AGE_YEARS = 16;
const MAX_AGE_YEARS = 100;

function nonempty(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function parseYmd(ymd: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error(`Invalid date '${ymd}' — must be YYYY-MM-DD`);
  }
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new Error(`Invalid calendar date '${ymd}'`);
  }
  return dt;
}

function ageYearsOn(hire: Date, dob: Date): number {
  let age = hire.getUTCFullYear() - dob.getUTCFullYear();
  const hm = hire.getUTCMonth() - dob.getUTCMonth();
  if (hm < 0 || (hm === 0 && hire.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

/** Assert string lengths never exceed DB VARCHAR — refuse truncation. */
export function assertEmployeeMasterFieldLengths(
  input: Record<string, unknown>
): void {
  for (const [key, max] of Object.entries(EMPLOYEE_MASTER_FIELD_MAX)) {
    const v = input[key];
    if (v == null || v === '') continue;
    if (typeof v !== 'string') continue;
    if (v.length > max) {
      throw new Error(
        `${key} length ${v.length} exceeds DB max ${max} — refuse truncate`
      );
    }
  }
}

/**
 * Full master integrity for create, or for update after merging with existing row.
 * Throws Error with operator-facing message (service wraps as ValidationError).
 */
export function assertEmployeeMasterIntegrity(input: EmployeeMasterIntegrityInput): void {
  assertEmployeeMasterFieldLengths(input as Record<string, unknown>);

  if (!nonempty(input.hireDate)) {
    throw new Error('hireDate is required');
  }
  const hire = parseYmd(input.hireDate);

  if (nonempty(input.dateOfBirth)) {
    const dob = parseYmd(input.dateOfBirth);
    if (dob.getTime() >= hire.getTime()) {
      throw new Error('dateOfBirth must be before hireDate');
    }
    const age = ageYearsOn(hire, dob);
    if (age < MIN_HIRE_AGE_YEARS) {
      throw new Error(
        `Employee must be at least ${MIN_HIRE_AGE_YEARS} years old on hireDate (got ${age})`
      );
    }
    if (age > MAX_AGE_YEARS) {
      throw new Error(`dateOfBirth implies age ${age} > ${MAX_AGE_YEARS} — refuse`);
    }
  }

  if (input.gender != null && input.gender !== '' && !isEmployeeGender(input.gender)) {
    throw new Error(`Invalid gender '${input.gender}'`);
  }
  if (
    input.maritalStatus != null &&
    input.maritalStatus !== '' &&
    !isEmployeeMaritalStatus(input.maritalStatus)
  ) {
    throw new Error(`Invalid maritalStatus '${input.maritalStatus}'`);
  }
  if (
    input.mobileMoneyProvider != null &&
    input.mobileMoneyProvider !== '' &&
    !isEmployeeMomoProvider(input.mobileMoneyProvider)
  ) {
    throw new Error(`Invalid mobileMoneyProvider '${input.mobileMoneyProvider}'`);
  }
  if (
    input.preferredPaymentMethod != null &&
    input.preferredPaymentMethod !== '' &&
    !isEmployeePaymentMethod(input.preferredPaymentMethod)
  ) {
    throw new Error(`Invalid preferredPaymentMethod '${input.preferredPaymentMethod}'`);
  }

  const kinAny =
    nonempty(input.nextOfKinName) ||
    nonempty(input.nextOfKinPhone) ||
    nonempty(input.nextOfKinRelation);
  if (kinAny) {
    if (!nonempty(input.nextOfKinName)) {
      throw new Error('nextOfKinName is required when next-of-kin fields are set');
    }
    if (!nonempty(input.nextOfKinPhone)) {
      throw new Error('nextOfKinPhone is required when next-of-kin fields are set');
    }
  }

  const bankAny =
    nonempty(input.bankName) ||
    nonempty(input.bankBranch) ||
    nonempty(input.bankAccountNumber) ||
    nonempty(input.bankAccountName);
  if (bankAny) {
    if (!nonempty(input.bankName)) {
      throw new Error('bankName is required when bank details are set');
    }
    if (!nonempty(input.bankAccountNumber)) {
      throw new Error('bankAccountNumber is required when bank details are set');
    }
  }

  const momoAny =
    nonempty(input.mobileMoneyNumber) || nonempty(input.mobileMoneyProvider);
  if (momoAny) {
    if (!nonempty(input.mobileMoneyNumber)) {
      throw new Error('mobileMoneyNumber is required when MoMo details are set');
    }
    if (!nonempty(input.mobileMoneyProvider)) {
      throw new Error('mobileMoneyProvider is required when MoMo details are set');
    }
  }

  const pay = input.preferredPaymentMethod as EmployeePaymentMethod | null | undefined;
  if (pay === 'BANK') {
    if (!nonempty(input.bankName) || !nonempty(input.bankAccountNumber)) {
      throw new Error(
        'preferredPaymentMethod=BANK requires bankName and bankAccountNumber'
      );
    }
  }
  if (pay === 'MOBILE_MONEY') {
    if (!nonempty(input.mobileMoneyNumber) || !nonempty(input.mobileMoneyProvider)) {
      throw new Error(
        'preferredPaymentMethod=MOBILE_MONEY requires mobileMoneyNumber and mobileMoneyProvider'
      );
    }
  }
}

/** Map PG unique index names → operator message (no raw 23505 dump). */
export function mapEmployeeMasterUniqueViolation(err: unknown): string | null {
  const pg = err as { code?: string; constraint?: string; detail?: string; message?: string };
  if (pg.code !== '23505') return null;
  const blob = `${pg.constraint ?? ''} ${pg.detail ?? ''} ${pg.message ?? ''}`.toLowerCase();
  if (blob.includes('uq_employees_national_id') || blob.includes('nationalid')) {
    return 'National ID already assigned to another employee';
  }
  if (blob.includes('uq_employees_employee_number') || blob.includes('employeenumber')) {
    return 'Employee number already assigned to another employee';
  }
  if (blob.includes('uq_employees_userid') || blob.includes('userid')) {
    return 'User is already linked to another employee';
  }
  return 'Duplicate employee master value (unique constraint)';
}

export type {
  EmployeeGender,
  EmployeeMaritalStatus,
  EmployeeMomoProvider,
  EmployeePaymentMethod,
};
