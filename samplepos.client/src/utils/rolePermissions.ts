/**
 * Centralized Role Permission Definitions
 * Single source of truth for all role-based permissions
 * Ensures consistency across frontend and backend
 */

import { UserRole } from '../types';

/**
 * Permission keys for all system features
 */
export enum Permission {
    // Sales
    VIEW_SALES = 'VIEW_SALES',
    CREATE_SALES = 'CREATE_SALES',
    EDIT_SALES = 'EDIT_SALES',
    DELETE_SALES = 'DELETE_SALES',
    VOID_SALES = 'VOID_SALES',

    // Inventory
    VIEW_INVENTORY = 'VIEW_INVENTORY',
    MANAGE_INVENTORY = 'MANAGE_INVENTORY',
    ADJUST_STOCK = 'ADJUST_STOCK',
    VIEW_STOCK_MOVEMENTS = 'VIEW_STOCK_MOVEMENTS',

    // Purchase Orders
    VIEW_PURCHASE_ORDERS = 'VIEW_PURCHASE_ORDERS',
    CREATE_PURCHASE_ORDERS = 'CREATE_PURCHASE_ORDERS',
    APPROVE_PURCHASE_ORDERS = 'APPROVE_PURCHASE_ORDERS',
    RECEIVE_GOODS = 'RECEIVE_GOODS',

    // Customers
    VIEW_CUSTOMERS = 'VIEW_CUSTOMERS',
    MANAGE_CUSTOMERS = 'MANAGE_CUSTOMERS',
    MANAGE_CUSTOMER_GROUPS = 'MANAGE_CUSTOMER_GROUPS',

    // Suppliers
    VIEW_SUPPLIERS = 'VIEW_SUPPLIERS',
    MANAGE_SUPPLIERS = 'MANAGE_SUPPLIERS',

    // Reports
    VIEW_REPORTS = 'VIEW_REPORTS',
    VIEW_FINANCIAL_REPORTS = 'VIEW_FINANCIAL_REPORTS',
    EXPORT_REPORTS = 'EXPORT_REPORTS',

    // Users & Settings
    MANAGE_USERS = 'MANAGE_USERS',
    MANAGE_ROLES = 'MANAGE_ROLES',
    VIEW_AUDIT_LOG = 'VIEW_AUDIT_LOG',
    MANAGE_SETTINGS = 'MANAGE_SETTINGS',

    // Accounting
    VIEW_ACCOUNTING = 'VIEW_ACCOUNTING',
    MANAGE_CHART_OF_ACCOUNTS = 'MANAGE_CHART_OF_ACCOUNTS',
    POST_JOURNAL_ENTRIES = 'POST_JOURNAL_ENTRIES',
    VIEW_GENERAL_LEDGER = 'VIEW_GENERAL_LEDGER',

    // Expenses
    VIEW_EXPENSES = 'VIEW_EXPENSES',
    CREATE_EXPENSES = 'CREATE_EXPENSES',
    APPROVE_EXPENSES = 'APPROVE_EXPENSES',

    // Quotations
    VIEW_QUOTATIONS = 'VIEW_QUOTATIONS',
    CREATE_QUOTATIONS = 'CREATE_QUOTATIONS',
    CONVERT_QUOTATIONS = 'CONVERT_QUOTATIONS',

    // Admin Panel
    ACCESS_ADMIN_PANEL = 'ACCESS_ADMIN_PANEL',
    SYSTEM_CONFIGURATION = 'SYSTEM_CONFIGURATION',
}

/**
 * Role-Permission Mapping
 * Defines what each role can do
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
    ADMIN: [
        // All permissions
        ...Object.values(Permission)
    ],

    MANAGER: [
        // Sales
        Permission.VIEW_SALES,
        Permission.CREATE_SALES,
        Permission.EDIT_SALES,
        Permission.DELETE_SALES,
        Permission.VOID_SALES,

        // Inventory
        Permission.VIEW_INVENTORY,
        Permission.MANAGE_INVENTORY,
        Permission.ADJUST_STOCK,
        Permission.VIEW_STOCK_MOVEMENTS,

        // Purchase Orders
        Permission.VIEW_PURCHASE_ORDERS,
        Permission.CREATE_PURCHASE_ORDERS,
        Permission.APPROVE_PURCHASE_ORDERS,
        Permission.RECEIVE_GOODS,

        // Customers & Suppliers
        Permission.VIEW_CUSTOMERS,
        Permission.MANAGE_CUSTOMERS,
        Permission.MANAGE_CUSTOMER_GROUPS,
        Permission.VIEW_SUPPLIERS,
        Permission.MANAGE_SUPPLIERS,

        // Reports
        Permission.VIEW_REPORTS,
        Permission.VIEW_FINANCIAL_REPORTS,
        Permission.EXPORT_REPORTS,

        // Accounting
        Permission.VIEW_ACCOUNTING,
        Permission.VIEW_GENERAL_LEDGER,

        // Expenses
        Permission.VIEW_EXPENSES,
        Permission.CREATE_EXPENSES,
        Permission.APPROVE_EXPENSES,

        // Quotations
        Permission.VIEW_QUOTATIONS,
        Permission.CREATE_QUOTATIONS,
        Permission.CONVERT_QUOTATIONS,

        // Audit
        Permission.VIEW_AUDIT_LOG,
    ],

    CASHIER: [
        // Sales
        Permission.VIEW_SALES,
        Permission.CREATE_SALES,

        // Inventory (view only)
        Permission.VIEW_INVENTORY,

        // Customers (view only)
        Permission.VIEW_CUSTOMERS,

        // Quotations
        Permission.VIEW_QUOTATIONS,
        Permission.CREATE_QUOTATIONS,
        Permission.CONVERT_QUOTATIONS,
    ],

    STAFF: [
        // Inventory (view only)
        Permission.VIEW_INVENTORY,
        Permission.VIEW_STOCK_MOVEMENTS,

        // Suppliers (view only)
        Permission.VIEW_SUPPLIERS,
    ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
    return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Check if a role has ANY of the specified permissions
 */
export function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
    return permissions.some(p => hasPermission(role, p));
}

/**
 * Check if a role has ALL of the specified permissions
 */
export function hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
    return permissions.every(p => hasPermission(role, p));
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: UserRole): Permission[] {
    return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Get roles that have a specific permission
 */
export function getRolesWithPermission(permission: Permission): UserRole[] {
    return (Object.entries(ROLE_PERMISSIONS) as [UserRole, Permission[]][])
        .filter(([_, permissions]) => permissions.includes(permission))
        .map(([role]) => role);
}

/**
 * Check if a user can access a route based on their role
 */
export function canAccessRoute(userRole: UserRole, routePath: string): boolean {
    // Route-to-permission mapping
    const routePermissions: Record<string, Permission[]> = {
        '/admin': [Permission.ACCESS_ADMIN_PANEL],
        '/settings': [Permission.MANAGE_SETTINGS],
        '/users': [Permission.MANAGE_USERS],
        '/accounting': [Permission.VIEW_ACCOUNTING],
        '/accounting/chart-of-accounts': [Permission.MANAGE_CHART_OF_ACCOUNTS],
        '/reports': [Permission.VIEW_REPORTS],
        '/suppliers': [Permission.VIEW_SUPPLIERS],
        '/purchase-orders': [Permission.VIEW_PURCHASE_ORDERS],
        '/inventory': [Permission.VIEW_INVENTORY],
        '/customers': [Permission.VIEW_CUSTOMERS],
        '/sales': [Permission.VIEW_SALES],
        '/pos': [Permission.CREATE_SALES],
        '/quotations': [Permission.VIEW_QUOTATIONS],
    };

    const requiredPermissions = routePermissions[routePath];
    if (!requiredPermissions) return true; // No specific permission required

    return hasAnyPermission(userRole, requiredPermissions);
}
