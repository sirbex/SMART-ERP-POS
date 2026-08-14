/**
 * Employment contract lifecycle SSOT (SAP HCM / Odoo HR / Uganda SME).
 *
 * Model:
 * - Employee.EmploymentType = current engagement class (PERMANENT|CASUAL|CONTRACT|INTERN)
 * - employee_contracts = versioned fixed-term / engagement history (Odoo hr.contract style)
 * - Only one ACTIVE contract per employee
 * - Employment EndDate/INACTIVE = leave the company (not the same as contract expiry)
 *
 * Lifecycle:
 *   DRAFT → sign → ACTIVE → (renew | convert | expire | terminate)
 *   renew: ACTIVE → RENEWED + new ACTIVE
 *   convert: ACTIVE → CONVERTED + new ACTIVE permanent
 *   expire: ACTIVE past EndDate → EXPIRED (fail-loud if still ACTIVE after end)
 *   terminate: employment end closes ACTIVE → TERMINATED
 *
 * Transitions (engagement class):
 *   INTERN → CONTRACT | PERMANENT
 *   CONTRACT → PERMANENT (or renew as CONTRACT)
 *   CASUAL → CONTRACT | PERMANENT
 *   PERMANENT → no convert (already permanent); end employment only
 */

export const EMPLOYMENT_TYPES = ['PERMANENT', 'CASUAL', 'CONTRACT', 'INTERN'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const CONTRACT_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'EXPIRED',
  'RENEWED',
  'CONVERTED',
  'TERMINATED',
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/** Types that require a planned contract end date (fixed-term). */
export const FIXED_TERM_EMPLOYMENT_TYPES = ['CONTRACT', 'INTERN'] as const;
export type FixedTermEmploymentType = (typeof FIXED_TERM_EMPLOYMENT_TYPES)[number];

export const CONTRACT_CONVERT_TARGETS: Record<EmploymentType, readonly EmploymentType[]> = {
  INTERN: ['CONTRACT', 'PERMANENT'],
  CONTRACT: ['PERMANENT'],
  CASUAL: ['CONTRACT', 'PERMANENT'],
  PERMANENT: [],
};

export function isEmploymentType(value: unknown): value is EmploymentType {
  return typeof value === 'string' && (EMPLOYMENT_TYPES as readonly string[]).includes(value);
}

export function isContractStatus(value: unknown): value is ContractStatus {
  return typeof value === 'string' && (CONTRACT_STATUSES as readonly string[]).includes(value);
}

export function isFixedTermEmploymentType(value: unknown): value is FixedTermEmploymentType {
  return (
    typeof value === 'string' &&
    (FIXED_TERM_EMPLOYMENT_TYPES as readonly string[]).includes(value)
  );
}

/** Fixed-term engagements must have EndDate; permanent must not use contract end as employment end. */
export function requiresContractEndDate(employmentType: EmploymentType): boolean {
  return isFixedTermEmploymentType(employmentType);
}

export function assertContractDateRange(input: {
  startDate: string;
  endDate: string | null | undefined;
  employmentType: EmploymentType;
  probationEndDate?: string | null;
}): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
    throw new Error('Contract startDate must be YYYY-MM-DD');
  }
  if (requiresContractEndDate(input.employmentType)) {
    if (!input.endDate) {
      throw new Error(
        `${input.employmentType} requires a contract end date (fixed-term engagement)`
      );
    }
  }
  if (input.endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
      throw new Error('Contract endDate must be YYYY-MM-DD');
    }
    if (input.endDate < input.startDate) {
      throw new Error('Contract endDate cannot be before startDate');
    }
  }
  if (input.employmentType === 'PERMANENT' && input.endDate) {
    // Permanent engagement contract is open-ended; planned end belongs on fixed-term only.
    // Allow null only — if endDate set on permanent create, refuse (use end-employment instead).
    throw new Error(
      'PERMANENT contracts are open-ended — do not set endDate (use End Employment to leave)'
    );
  }
  if (input.probationEndDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.probationEndDate)) {
      throw new Error('probationEndDate must be YYYY-MM-DD');
    }
    if (input.probationEndDate < input.startDate) {
      throw new Error('probationEndDate cannot be before contract startDate');
    }
    if (input.endDate && input.probationEndDate > input.endDate) {
      throw new Error('probationEndDate cannot be after contract endDate');
    }
  }
}

export function assertCanSignContract(status: ContractStatus): void {
  if (status !== 'DRAFT' && status !== 'ACTIVE') {
    throw new Error(`Cannot sign contract in status ${status}`);
  }
}

export function assertCanRenewContract(input: {
  status: ContractStatus;
  employmentType: EmploymentType;
}): void {
  if (input.status !== 'ACTIVE') {
    throw new Error(`Only ACTIVE contracts can be renewed (got ${input.status})`);
  }
  if (input.employmentType === 'PERMANENT') {
    throw new Error('PERMANENT engagements are open-ended — renew does not apply');
  }
}

export function assertCanConvertContract(input: {
  status: ContractStatus;
  fromType: EmploymentType;
  toType: EmploymentType;
}): void {
  if (input.status !== 'ACTIVE') {
    throw new Error(`Only ACTIVE contracts can be converted (got ${input.status})`);
  }
  const allowed = CONTRACT_CONVERT_TARGETS[input.fromType] ?? [];
  if (!allowed.includes(input.toType)) {
    throw new Error(
      `Cannot convert ${input.fromType} → ${input.toType}. Allowed: ${allowed.join(', ') || 'none'}`
    );
  }
}

export function assertContractNotPastEndWithoutAction(input: {
  status: ContractStatus;
  endDate: string | null | undefined;
  asOfDate: string;
}): void {
  if (input.status !== 'ACTIVE') return;
  if (!input.endDate) return;
  if (input.endDate < input.asOfDate) {
    throw new Error(
      `Contract ended ${input.endDate} but is still ACTIVE — renew, convert, or expire before payroll/actions`
    );
  }
}

export function daysUntilContractEnd(endDate: string | null | undefined, asOfDate: string): number | null {
  if (!endDate) return null;
  const a = Date.parse(`${asOfDate}T00:00:00Z`);
  const b = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** @deprecated Import from shared/hr/employeeFormSections.ts — re-exported for compat. */
export {
  EMPLOYEE_FORM_SECTIONS,
  type EmployeeFormSectionId,
  EMPLOYEE_FORM_SECTIONS_STORAGE_KEY,
} from './employeeFormSections.js';
