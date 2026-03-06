// Phase 7: User Type Definitions
// File: shared/types/user.ts

export type UserRole = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  passwordHash?: string; // Only included in database queries, never in API responses
  /** @deprecated Use fullName instead - kept for backward compat */
  username?: string;
  /** @deprecated Use fullName instead */
  firstName?: string;
  /** @deprecated Use fullName instead */
  lastName?: string;
  /** @deprecated Not in users table */
  lastLoginAt?: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  /** @deprecated Use fullName */
  username?: string;
  /** @deprecated Use fullName */
  firstName?: string;
  /** @deprecated Use fullName */
  lastName?: string;
}

export interface UpdateUserRequest {
  email?: string;
  fullName?: string;
  role?: UserRole;
  isActive?: boolean;
  /** @deprecated Use fullName */
  firstName?: string;
  /** @deprecated Use fullName */
  lastName?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UserPermissions {
  canViewSales: boolean;
  canCreateSales: boolean;
  canEditSales: boolean;
  canDeleteSales: boolean;
  canViewInventory: boolean;
  canManageInventory: boolean;
  canViewPurchaseOrders: boolean;
  canManagePurchaseOrders: boolean;
  canViewCustomers: boolean;
  canManageCustomers: boolean;
  canViewReports: boolean;
  canManageUsers: boolean;
  canViewAuditLog: boolean;
  canAccessAdminPanel: boolean;
}

// Role-based permission mapping
export const ROLE_PERMISSIONS: Record<UserRole, UserPermissions> = {
  ADMIN: {
    canViewSales: true,
    canCreateSales: true,
    canEditSales: true,
    canDeleteSales: true,
    canViewInventory: true,
    canManageInventory: true,
    canViewPurchaseOrders: true,
    canManagePurchaseOrders: true,
    canViewCustomers: true,
    canManageCustomers: true,
    canViewReports: true,
    canManageUsers: true,
    canViewAuditLog: true,
    canAccessAdminPanel: true,
  },
  MANAGER: {
    canViewSales: true,
    canCreateSales: true,
    canEditSales: true,
    canDeleteSales: true,
    canViewInventory: true,
    canManageInventory: true,
    canViewPurchaseOrders: true,
    canManagePurchaseOrders: true,
    canViewCustomers: true,
    canManageCustomers: true,
    canViewReports: true,
    canManageUsers: false,
    canViewAuditLog: true,
    canAccessAdminPanel: false,
  },
  CASHIER: {
    canViewSales: true,
    canCreateSales: true,
    canEditSales: false,
    canDeleteSales: false,
    canViewInventory: true,
    canManageInventory: false,
    canViewPurchaseOrders: false,
    canManagePurchaseOrders: false,
    canViewCustomers: true,
    canManageCustomers: false,
    canViewReports: false,
    canManageUsers: false,
    canViewAuditLog: false,
    canAccessAdminPanel: false,
  },
  STAFF: {
    canViewSales: false,
    canCreateSales: false,
    canEditSales: false,
    canDeleteSales: false,
    canViewInventory: true,
    canManageInventory: false,
    canViewPurchaseOrders: false,
    canManagePurchaseOrders: false,
    canViewCustomers: false,
    canManageCustomers: false,
    canViewReports: false,
    canManageUsers: false,
    canViewAuditLog: false,
    canAccessAdminPanel: false,
  },
};

export function getUserPermissions(role: UserRole): UserPermissions {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(user: User, permission: keyof UserPermissions): boolean {
  const permissions = getUserPermissions(user.role);
  return permissions[permission];
}