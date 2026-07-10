import type { Pool } from 'pg';
import {
  authorizeFromContext,
  evaluatePermission,
  formatDeniedReason,
  DEFAULT_POLICY_EVALUATORS,
  type PolicyEvaluator,
} from '@shared/authorization/permissionEvaluation.js';
import { legacyRoleGrantsPermission } from '@shared/authorization/legacyRoleFallback.js';
import type {
  AuthorizationResult,
  AuthorizationSubject,
  AuthorizeInput,
  EffectivePermissionEntry,
} from '@shared/authorization/types.js';
import { RbacService } from '../rbac/service.js';
import { isValidPermissionKey } from '../rbac/permissions.js';
import type { AuthorizationContext } from '../rbac/types.js';

export class AuthorizationDeniedError extends Error {
  constructor(
    public readonly result: AuthorizationResult,
    public readonly statusCode = 403
  ) {
    super(formatDeniedReason(result));
    this.name = 'AuthorizationDeniedError';
  }
}

/**
 * Central authorization engine — single source of truth for server-side decisions.
 *
 * Runtime model: Permission + Policy evaluation.
 * Roles are permission containers (managed via RbacService); never checked by name here.
 */
export class AuthorizationService {
  private readonly policyEvaluators: PolicyEvaluator[];

  constructor(
    private readonly rbacService: RbacService,
    policyEvaluators: PolicyEvaluator[] = [...DEFAULT_POLICY_EVALUATORS]
  ) {
    this.policyEvaluators = policyEvaluators;
  }

  static fromPool(pool: Pool, policyEvaluators?: PolicyEvaluator[]): AuthorizationService {
    return new AuthorizationService(new RbacService(pool), policyEvaluators);
  }

  /** Build subject from Express req.user */
  subjectFromUser(user: { id: string; role?: string } | undefined): AuthorizationSubject | null {
    if (!user?.id) return null;
    return { id: user.id, legacyRole: user.role };
  }

  async getEffectivePermissions(userId: string): Promise<EffectivePermissionEntry[]> {
    const perms = await this.rbacService.getUserEffectivePermissions(userId);
    return perms.map((p) => ({
      permissionKey: p.permissionKey,
      scopeType: p.scopeType,
      scopeId: p.scopeId,
      roleId: p.roleId,
      roleName: p.roleName,
    }));
  }

  async buildContext(userId: string): Promise<AuthorizationContext> {
    return this.rbacService.buildAuthorizationContext(userId);
  }

  /**
   * Returns true when user has RBAC role assignments (not relying on legacy users.role).
   */
  async hasRbacAssignments(userId: string): Promise<boolean> {
    const roles = await this.rbacService.getUserRoles(userId);
    return roles.length > 0;
  }

  /**
   * Check a single permission. Legacy role fallback applies only when user has no RBAC assignments.
   */
  async hasPermission(
    subject: AuthorizationSubject,
    permissionKey: string,
    scopeType?: string | null,
    scopeId?: string | null
  ): Promise<boolean> {
    const result = await this.evaluatePermission(subject, permissionKey, scopeType, scopeId);
    return result.allowed;
  }

  async evaluatePermission(
    subject: AuthorizationSubject,
    permissionKey: string,
    scopeType?: string | null,
    scopeId?: string | null
  ): Promise<AuthorizationResult> {
    if (!isValidPermissionKey(permissionKey)) {
      return {
        allowed: false,
        permission: permissionKey,
        reason: 'INVALID_PERMISSION',
        message: `Unknown permission key: ${permissionKey}`,
      };
    }

    // Absolute admin (users.role = ADMIN) — never block on partial RBAC role grants
    if (subject.legacyRole?.toUpperCase() === 'ADMIN') {
      return { allowed: true, permission: permissionKey };
    }

    const rbacGranted = await this.rbacService.checkPermission(
      subject.id,
      permissionKey,
      scopeType,
      scopeId
    );

    if (rbacGranted) {
      return { allowed: true, permission: permissionKey };
    }

    const useLegacy = !(await this.hasRbacAssignments(subject.id));
    if (useLegacy && legacyRoleGrantsPermission(subject.legacyRole, permissionKey)) {
      return { allowed: true, permission: permissionKey };
    }

    return {
      allowed: false,
      permission: permissionKey,
      reason: 'PERMISSION_DENIED',
      message: `Missing permission: ${permissionKey}`,
    };
  }

  /**
   * Authorize an action: permission check + contextual policy evaluation.
   * Throws AuthorizationDeniedError when denied.
   */
  async authorize(subject: AuthorizationSubject, input: AuthorizeInput): Promise<AuthorizationResult> {
    const result = await this.authorizeResult(subject, input);
    if (!result.allowed) {
      throw new AuthorizationDeniedError(result);
    }
    return result;
  }

  async authorizeResult(subject: AuthorizationSubject, input: AuthorizeInput): Promise<AuthorizationResult> {
    const permResult = await this.evaluatePermission(
      subject,
      input.permission,
      input.scope?.scopeType,
      input.scope?.scopeId
    );

    if (!permResult.allowed) {
      return permResult;
    }

    const context = await this.buildContext(subject.id);
    const useLegacy = !(await this.hasRbacAssignments(subject.id));

    return authorizeFromContext(
      subject,
      input,
      context.permissions,
      this.policyEvaluators,
      { useLegacyFallback: useLegacy }
    );
  }

  /**
   * Policy-only evaluation when permission is already confirmed.
   */
  evaluatePolicy(subject: AuthorizationSubject, input: AuthorizeInput, permissions: ReadonlySet<string>): AuthorizationResult {
    return authorizeFromContext(subject, input, permissions, this.policyEvaluators, {
      useLegacyFallback: false,
    });
  }

  getDeniedReason(result: AuthorizationResult): string {
    return formatDeniedReason(result);
  }

  async logDenied(subject: AuthorizationSubject, permissionKey: string, req?: { ip?: string; headers?: Record<string, string | string[] | undefined> }): Promise<void> {
    const ipAddress = req?.ip;
    const userAgent = typeof req?.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;
    await this.rbacService.logPermissionDenied(subject.id, permissionKey, ipAddress, userAgent).catch(() => {});
  }
}
