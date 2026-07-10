/**
 * Shared authorization types — used by server AuthorizationService and client hooks.
 * Roles are permission containers; runtime decisions use permissions + policies.
 */

export type LegacyUserRole = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF';

export interface AuthorizationSubject {
  id: string;
  /** Legacy users.role column — used only for transition fallback when no RBAC assignments exist */
  legacyRole?: string | null;
}

export type ScopeType = 'global' | 'organization' | 'branch' | 'warehouse';

export interface AuthorizationScope {
  scopeType?: ScopeType | null;
  scopeId?: string | null;
}

export interface PolicyContext {
  /** Arbitrary resource under evaluation (sale, transfer, store, etc.) */
  resource?: Record<string, unknown>;
  scope?: AuthorizationScope;
  /** Additional runtime facts (workflow state, ownership, etc.) */
  facts?: Record<string, unknown>;
}

export interface AuthorizeInput {
  permission: string;
  scope?: AuthorizationScope;
  context?: PolicyContext;
}

export type DeniedReasonCode =
  | 'NOT_AUTHENTICATED'
  | 'PERMISSION_DENIED'
  | 'POLICY_DENIED'
  | 'INVALID_PERMISSION';

export interface AuthorizationResult {
  allowed: boolean;
  permission: string;
  reason?: DeniedReasonCode;
  message?: string;
}

export interface EffectivePermissionEntry {
  permissionKey: string;
  scopeType: ScopeType | null;
  scopeId: string | null;
  roleId?: string;
  roleName?: string;
}
