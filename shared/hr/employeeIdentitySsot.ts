/**
 * Employee ↔ User identity SSOT (Odoo/SAP-style, SamplePOS-smart).
 *
 * Employment types + contract lifecycle: shared/hr/employmentContractSsot.ts (canonical).
 * This module re-exports types and keeps hire/end + user-link rules.
 */

export {
  EMPLOYMENT_TYPES,
  type EmploymentType,
  isEmploymentType,
  FIXED_TERM_EMPLOYMENT_TYPES,
  requiresContractEndDate,
} from './employmentContractSsot.js';

import { isEmploymentType, type EmploymentType } from './employmentContractSsot.js';

export const EMPLOYEE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export function normalizeEmploymentType(value: unknown): EmploymentType {
  if (isEmploymentType(value)) return value;
  return 'PERMANENT';
}

/** Login is never required — casuals / interns / contractors often have none. */
export function requiresRelatedUser(_employmentType: EmploymentType): boolean {
  return false;
}

/**
 * When ending employment, EndDate must be set and status must be INACTIVE.
 * HireDate ≤ EndDate when both present.
 */
export function assertEmploymentLifecycle(input: {
  status: string;
  hireDate: string;
  endDate: string | null | undefined;
  ending: boolean;
}): void {
  if (input.ending) {
    if (!input.endDate) {
      throw new Error('EndDate is required when ending employment');
    }
    if (input.status !== 'INACTIVE') {
      throw new Error('Status must be INACTIVE when ending employment');
    }
  }
  if (input.endDate && input.hireDate && input.endDate < input.hireDate) {
    throw new Error('EndDate cannot be before HireDate');
  }
}

/** Pure uniqueness check used by API + proofs. */
export function assertUserLinkAvailable(opts: {
  userId: string | null | undefined;
  currentEmployeeId?: string | null;
  linkedEmployeeId: string | null | undefined;
}): void {
  if (!opts.userId) return;
  if (!opts.linkedEmployeeId) return;
  if (opts.currentEmployeeId && opts.linkedEmployeeId === opts.currentEmployeeId) return;
  throw new Error('User is already linked to another employee');
}
