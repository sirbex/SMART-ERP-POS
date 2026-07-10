/**
 * Client-side authorization engine — mirrors server AuthorizationService (sync).
 * Uses permission set from AuthContext; legacy role fallback only when permissions are empty.
 */

import {
  authorizeFromContext,
  evaluatePermission,
  formatDeniedReason,
  DEFAULT_POLICY_EVALUATORS,
  type PolicyEvaluator,
} from '@shared/authorization/permissionEvaluation';
import type {
  AuthorizationResult,
  AuthorizationSubject,
  AuthorizeInput,
} from '@shared/authorization/types';

export interface ClientAuthorizationState {
  permissions: ReadonlySet<string>;
  /** True when user has RBAC assignments loaded (permissions non-empty) */
  hasRbacAssignments: boolean;
}

export class ClientAuthorizationService {
  constructor(
    private readonly state: ClientAuthorizationState,
    private readonly subject: AuthorizationSubject,
    private readonly policyEvaluators: PolicyEvaluator[] = [...DEFAULT_POLICY_EVALUATORS]
  ) {}

  hasPermission(permissionKey: string): boolean {
    return this.authorizeResult({ permission: permissionKey }).allowed;
  }

  authorizeResult(input: AuthorizeInput): AuthorizationResult {
    const useLegacyFallback = !this.state.hasRbacAssignments;
    return authorizeFromContext(
      this.subject,
      input,
      this.state.permissions,
      this.policyEvaluators,
      { useLegacyFallback }
    );
  }

  authorize(input: AuthorizeInput): boolean {
    return this.authorizeResult(input).allowed;
  }

  getDeniedReason(result: AuthorizationResult): string {
    return formatDeniedReason(result);
  }

  getEffectivePermissions(): ReadonlySet<string> {
    return this.state.permissions;
  }

  /** Direct evaluation without policy chain */
  evaluatePermission(permissionKey: string): AuthorizationResult {
    const useLegacyFallback = !this.state.hasRbacAssignments;
    return evaluatePermission(this.subject, permissionKey, this.state.permissions, {
      useLegacyFallback,
    });
  }
}

export function createClientAuthorization(
  user: { id: string; role?: string } | null | undefined,
  permissions: ReadonlySet<string>
): ClientAuthorizationService | null {
  if (!user?.id) return null;
  return new ClientAuthorizationService(
    {
      permissions,
      hasRbacAssignments: permissions.size > 0,
    },
    { id: user.id, legacyRole: user.role }
  );
}
