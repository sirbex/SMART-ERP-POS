// Phase 7: User Type Definitions
// File: shared/types/user.ts

export type UserRole = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF';

export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  passwordHash?: string; // Only included in database queries, never in API responses
}

export interface CreateUserRequest {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface UpdateUserRequest {
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  isActive?: boolean;
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