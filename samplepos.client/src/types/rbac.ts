/**
 * RBAC (Role-Based Access Control) Types
 * Frontend type definitions for the RBAC system
 */

// Permission Module Types
export type PermissionModule =
  | 'sales'
  | 'inventory'
  | 'accounting'
  | 'admin'
  | 'pos'
  | 'purchasing'
  | 'customers'
  | 'suppliers'
  | 'reports'
  | 'system';

// Permission Action Types
export type PermissionAction =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'approve'
  | 'void'
  | 'export'
  | 'import'
  | 'post';

// Scope Types for multi-tenant permissions
export type ScopeType = 'global' | 'organization' | 'branch' | 'warehouse';

// Permission from catalog
export interface Permission {
  key: string;
  module: PermissionModule;
  action: PermissionAction | string;
  description: string;
}

// Role entity
export interface Role {
  id: string;
  name: string;
  description: string;
  version: number;
  isSystemRole: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  permissionCount?: number;
  permissions?: string[];
}

// User role assignment
export interface UserRole {
  id: string;
  userId: string;
  roleId: string;
  roleName?: string;
  scopeType: ScopeType | null;
  scopeId: string | null;
  assignedAt: string;
  assignedBy: string;
  expiresAt: string | null;
  isActive: boolean;
}

// Effective permission for a user
export interface EffectivePermission {
  permissionKey: string;
  roleId: string;
  roleName: string;
  scopeType: ScopeType | null;
  scopeId: string | null;
}

// Audit log entry
export interface RbacAuditLog {
  id: string;
  actorUserId: string;
  targetUserId: string | null;
  targetRoleId: string | null;
  action: RbacAuditAction;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: string;
}

export type RbacAuditAction =
  | 'role_created'
  | 'role_updated'
  | 'role_deleted'
  | 'role_permissions_updated'
  | 'user_role_assigned'
  | 'user_role_removed'
  | 'permission_denied';

// API Input Types
export interface CreateRoleInput {
  name: string;
  description: string;
  permissionKeys: string[];
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
  permissionKeys?: string[];
}

export interface AssignUserRoleInput {
  userId: string;
  roleId: string;
  scopeType?: ScopeType;
  scopeId?: string;
  expiresAt?: string;
}

export interface RemoveUserRoleInput {
  userId: string;
  roleId: string;
  scopeType?: ScopeType;
  scopeId?: string;
}

// User with RBAC info
export interface UserWithRoles {
  id: string;
  email: string;
  name: string;
  role: string; // Legacy role field
  isActive: boolean;
  roles: UserRole[];
  permissions?: EffectivePermission[];
}
