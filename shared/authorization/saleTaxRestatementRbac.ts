/**
 * SSOT — who may use Apply omitted VAT (sales.tax_restatement).
 *
 * Used by:
 * - structural evidence / proof runners
 * - seed grant expectations (Manager full sales module; Accountant explicit key)
 * - SQL heal migration 596 role list must stay aligned
 *
 * Not a substitute for runtime rbac_role_permissions — seed defaults only.
 */

import {
  isSystemAccountantPermission,
  isSystemCashierPermission,
  isSystemManagerPermission,
  isSystemWaiterPermission,
} from './systemRoleGrants.js';

export const SALES_TAX_RESTATEMENT_PERMISSION = 'sales.tax_restatement' as const;

/** System role names (lowercase) that default-grant sales.tax_restatement. */
export const SALES_TAX_RESTATEMENT_DEFAULT_ROLES = [
  'super administrator',
  'administrator',
  'manager',
  'accountant',
] as const;

/**
 * System roles that must NOT receive the default grant.
 * (Administrators still get full catalog via seed admin path.)
 */
export const SALES_TAX_RESTATEMENT_DENIED_DEFAULT_ROLES = [
  'cashier',
  'waiter',
  'auditor',
  'warehouse clerk',
  'sales representative',
  'hr manager',
] as const;

const PERM = {
  key: SALES_TAX_RESTATEMENT_PERMISSION,
  module: 'sales',
  action: 'update',
} as const;

export function isTaxRestatementDefaultRole(roleName: string | null | undefined): boolean {
  if (!roleName) return false;
  return (SALES_TAX_RESTATEMENT_DEFAULT_ROLES as readonly string[]).includes(
    roleName.trim().toLowerCase(),
  );
}

/** Manager/Accountant seed helpers must grant; Cashier/Waiter must deny. */
export function evaluateTaxRestatementSeedProfile(): {
  manager: boolean;
  accountant: boolean;
  cashier: boolean;
  waiter: boolean;
} {
  return {
    manager: isSystemManagerPermission(PERM),
    accountant: isSystemAccountantPermission(PERM),
    cashier: isSystemCashierPermission(PERM),
    waiter: isSystemWaiterPermission(PERM),
  };
}

/**
 * Legacy users.role column (ADMIN/MANAGER/CASHIER/STAFF) fallback —
 * only when session permission set is empty (RBAC transition).
 * Manager may restate; cashiers and staff walkers may not.
 */
export function legacyUserRoleGrantsTaxRestatement(
  role: string | null | undefined,
): boolean {
  if (!role) return false;
  const r = role.trim().toUpperCase();
  return r === 'ADMIN' || r === 'MANAGER';
}
