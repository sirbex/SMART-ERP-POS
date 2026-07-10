/**
 * Pure permission evaluation — no I/O.
 * Server and client both use these helpers for consistent decisions.
 */

import { legacyRoleGrantsPermission } from './legacyRoleFallback.js';
import type { AuthorizationResult, AuthorizeInput, AuthorizationSubject } from './types.js';

export function hasPermissionInSet(
  permissions: ReadonlySet<string>,
  permissionKey: string
): boolean {
  return permissions.has(permissionKey);
}

/**
 * Evaluate permission from an in-memory set, with optional legacy role fallback.
 * @param useLegacyFallback — true when subject has no RBAC role assignments
 *
 * Legacy ADMIN always allows (product absolute admin), even when a narrower
 * RBAC role like "Administrator" is also assigned.
 */
export function evaluatePermission(
  subject: AuthorizationSubject,
  permissionKey: string,
  permissions: ReadonlySet<string>,
  options?: { useLegacyFallback?: boolean }
): AuthorizationResult {
  if (hasPermissionInSet(permissions, permissionKey)) {
    return { allowed: true, permission: permissionKey };
  }

  const legacyRole = subject.legacyRole?.toUpperCase();
  if (legacyRole === 'ADMIN') {
    return { allowed: true, permission: permissionKey };
  }

  if (options?.useLegacyFallback && legacyRoleGrantsPermission(subject.legacyRole, permissionKey)) {
    return { allowed: true, permission: permissionKey };
  }

  return {
    allowed: false,
    permission: permissionKey,
    reason: 'PERMISSION_DENIED',
    message: `Missing permission: ${permissionKey}`,
  };
}

export type PolicyEvaluator = (
  subject: AuthorizationSubject,
  input: AuthorizeInput
) => AuthorizationResult | null;

/**
 * Full authorize: permission check then optional policy chain.
 * Policy evaluators return null when they do not apply to the request.
 */
export function authorizeFromContext(
  subject: AuthorizationSubject,
  input: AuthorizeInput,
  permissions: ReadonlySet<string>,
  policyEvaluators: PolicyEvaluator[],
  options?: { useLegacyFallback?: boolean }
): AuthorizationResult {
  const permResult = evaluatePermission(subject, input.permission, permissions, options);
  if (!permResult.allowed) {
    return permResult;
  }

  if (!input.context && !policyEvaluators.length) {
    return permResult;
  }

  for (const evaluator of policyEvaluators) {
    const policyResult = evaluator(subject, input);
    if (policyResult && !policyResult.allowed) {
      return policyResult;
    }
  }

  return permResult;
}

/** Build human-readable denial message for API/UI surfaces */
export function formatDeniedReason(result: AuthorizationResult): string {
  if (result.allowed) return '';
  switch (result.reason) {
    case 'NOT_AUTHENTICATED':
      return 'Authentication required';
    case 'POLICY_DENIED':
      return result.message ?? 'Policy denied this action';
    case 'INVALID_PERMISSION':
      return result.message ?? 'Invalid permission key';
    case 'PERMISSION_DENIED':
    default:
      return result.message ?? `Missing permission: ${result.permission}`;
  }
}

/** Store-scoped policy: user must have warehouse scope access when scopeId is set */
export function evaluateStoreAccessPolicy(
  _subject: AuthorizationSubject,
  input: AuthorizeInput
): AuthorizationResult | null {
  const storeId = input.context?.facts?.storeId as string | undefined;
  const allowedStoreIds = input.context?.facts?.allowedStoreIds as string[] | undefined;

  if (!storeId || !allowedStoreIds) return null;

  if (!allowedStoreIds.includes(storeId)) {
    return {
      allowed: false,
      permission: input.permission,
      reason: 'POLICY_DENIED',
      message: 'No access to the requested store',
    };
  }

  return null;
}

/** Transfer policy: source and destination stores must be in user's allowed set */
export function evaluateTransferStorePolicy(
  _subject: AuthorizationSubject,
  input: AuthorizeInput
): AuthorizationResult | null {
  const sourceStoreId = input.context?.facts?.sourceStoreId as string | undefined;
  const destStoreId = input.context?.facts?.destinationStoreId as string | undefined;
  const allowedStoreIds = input.context?.facts?.allowedStoreIds as string[] | undefined;

  if (!allowedStoreIds) return null;

  if (sourceStoreId && !allowedStoreIds.includes(sourceStoreId)) {
    return {
      allowed: false,
      permission: input.permission,
      reason: 'POLICY_DENIED',
      message: 'No access to source store',
    };
  }

  if (destStoreId && !allowedStoreIds.includes(destStoreId)) {
    return {
      allowed: false,
      permission: input.permission,
      reason: 'POLICY_DENIED',
      message: 'No access to destination store',
    };
  }

  return null;
}

export const DEFAULT_POLICY_EVALUATORS = [
  evaluateStoreAccessPolicy,
  evaluateTransferStorePolicy,
] as const;
