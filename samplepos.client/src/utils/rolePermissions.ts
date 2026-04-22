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
    REFUND_SALES = 'REFUND_SALES',
    REPRINT_RECEIPT = 'REPRINT_RECEIPT',

    // Inventory
    VIEW_INVENTORY = 'VIEW_INVENTORY',
    CREATE_INVENTORY = 'CREATE_INVENTORY',
    EDIT_INVENTORY = 'EDIT_INVENTORY',
    DELETE_INVENTORY = 'DELETE_INVENTORY',
    MANAGE_INVENTORY = 'MANAGE_INVENTORY',
    ADJUST_STOCK = 'ADJUST_STOCK',
    VIEW_STOCK_MOVEMENTS = 'VIEW_STOCK_MOVEMENTS',

    // Purchase Orders
    VIEW_PURCHASE_ORDERS = 'VIEW_PURCHASE_ORDERS',
    CREATE_PURCHASE_ORDERS = 'CREATE_PURCHASE_ORDERS',
    EDIT_PURCHASE_ORDERS = 'EDIT_PURCHASE_ORDERS',
    APPROVE_PURCHASE_ORDERS = 'APPROVE_PURCHASE_ORDERS',
    RECEIVE_GOODS = 'RECEIVE_GOODS',

    // Customers
    VIEW_CUSTOMERS = 'VIEW_CUSTOMERS',
    CREATE_CUSTOMERS = 'CREATE_CUSTOMERS',
    MANAGE_CUSTOMERS = 'MANAGE_CUSTOMERS',
    MANAGE_CUSTOMER_GROUPS = 'MANAGE_CUSTOMER_GROUPS',

    // Suppliers
    VIEW_SUPPLIERS = 'VIEW_SUPPLIERS',
    CREATE_SUPPLIERS = 'CREATE_SUPPLIERS',
    MANAGE_SUPPLIERS = 'MANAGE_SUPPLIERS',

    // Reports
    VIEW_REPORTS = 'VIEW_REPORTS',
    VIEW_FINANCIAL_REPORTS = 'VIEW_FINANCIAL_REPORTS',
    EXPORT_REPORTS = 'EXPORT_REPORTS',

    // Users & Settings
    MANAGE_USERS = 'MANAGE_USERS',
    MANAGE_ROLES = 'MANAGE_ROLES',
    VIEW_AUDIT_LOG = 'VIEW_AUDIT_LOG',
    VIEW_SETTINGS = 'VIEW_SETTINGS',
    MANAGE_SETTINGS = 'MANAGE_SETTINGS',

    // Accounting
    VIEW_ACCOUNTING = 'VIEW_ACCOUNTING',
    MANAGE_ACCOUNTING = 'MANAGE_ACCOUNTING',
    MANAGE_CHART_OF_ACCOUNTS = 'MANAGE_CHART_OF_ACCOUNTS',
    POST_JOURNAL_ENTRIES = 'POST_JOURNAL_ENTRIES',
    VIEW_GENERAL_LEDGER = 'VIEW_GENERAL_LEDGER',

    // Expenses
    VIEW_EXPENSES = 'VIEW_EXPENSES',
    CREATE_EXPENSES = 'CREATE_EXPENSES',
    APPROVE_EXPENSES = 'APPROVE_EXPENSES',

    // POS
    VIEW_POS = 'VIEW_POS',
    USE_POS = 'USE_POS',
    VOID_POS = 'VOID_POS',
    APPROVE_POS = 'APPROVE_POS',

    // Orders (POS order queue)
    VIEW_ORDERS = 'VIEW_ORDERS',
    CREATE_ORDERS = 'CREATE_ORDERS',
    PAY_ORDERS = 'PAY_ORDERS',
    CANCEL_ORDERS = 'CANCEL_ORDERS',

    // Quotations
    VIEW_QUOTATIONS = 'VIEW_QUOTATIONS',
    CREATE_QUOTATIONS = 'CREATE_QUOTATIONS',
    CONVERT_QUOTATIONS = 'CONVERT_QUOTATIONS',

    // Distribution / Sales Orders
    VIEW_DISTRIBUTION = 'VIEW_DISTRIBUTION',
    CREATE_DISTRIBUTION = 'CREATE_DISTRIBUTION',
    EDIT_DISTRIBUTION = 'EDIT_DISTRIBUTION',
    APPROVE_DISTRIBUTION = 'APPROVE_DISTRIBUTION',

    // Delivery
    VIEW_DELIVERY = 'VIEW_DELIVERY',
    CREATE_DELIVERY = 'CREATE_DELIVERY',

    // Banking
    VIEW_BANKING = 'VIEW_BANKING',
    MANAGE_BANKING = 'MANAGE_BANKING',

    // CRM
    VIEW_CRM = 'VIEW_CRM',
    MANAGE_CRM = 'MANAGE_CRM',

    // HR & Payroll
    VIEW_HR = 'VIEW_HR',
    MANAGE_HR = 'MANAGE_HR',

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
        Permission.REFUND_SALES,
        Permission.REPRINT_RECEIPT,

        // Inventory (full CRUD + manage)
        Permission.VIEW_INVENTORY,
        Permission.CREATE_INVENTORY,
        Permission.EDIT_INVENTORY,
        Permission.DELETE_INVENTORY,
        Permission.MANAGE_INVENTORY,
        Permission.ADJUST_STOCK,
        Permission.VIEW_STOCK_MOVEMENTS,

        // Purchase Orders
        Permission.VIEW_PURCHASE_ORDERS,
        Permission.CREATE_PURCHASE_ORDERS,
        Permission.EDIT_PURCHASE_ORDERS,
        Permission.APPROVE_PURCHASE_ORDERS,
        Permission.RECEIVE_GOODS,

        // Customers & Suppliers
        Permission.VIEW_CUSTOMERS,
        Permission.CREATE_CUSTOMERS,
        Permission.MANAGE_CUSTOMERS,
        Permission.MANAGE_CUSTOMER_GROUPS,
        Permission.VIEW_SUPPLIERS,
        Permission.CREATE_SUPPLIERS,
        Permission.MANAGE_SUPPLIERS,

        // Reports
        Permission.VIEW_REPORTS,
        Permission.VIEW_FINANCIAL_REPORTS,
        Permission.EXPORT_REPORTS,

        // Accounting (full access except admin-level)
        Permission.VIEW_ACCOUNTING,
        Permission.VIEW_GENERAL_LEDGER,
        Permission.MANAGE_ACCOUNTING,
        Permission.MANAGE_CHART_OF_ACCOUNTS,
        Permission.POST_JOURNAL_ENTRIES,

        // Expenses
        Permission.VIEW_EXPENSES,
        Permission.CREATE_EXPENSES,
        Permission.APPROVE_EXPENSES,

        // Quotations
        Permission.VIEW_QUOTATIONS,
        Permission.CREATE_QUOTATIONS,
        Permission.CONVERT_QUOTATIONS,

        // Distribution (including approve)
        Permission.VIEW_DISTRIBUTION,
        Permission.CREATE_DISTRIBUTION,
        Permission.EDIT_DISTRIBUTION,
        Permission.APPROVE_DISTRIBUTION,

        // POS
        Permission.VIEW_POS,
        Permission.USE_POS,
        Permission.VOID_POS,
        Permission.APPROVE_POS,

        // Orders
        Permission.VIEW_ORDERS,
        Permission.CREATE_ORDERS,
        Permission.PAY_ORDERS,
        Permission.CANCEL_ORDERS,

        // Delivery
        Permission.VIEW_DELIVERY,
        Permission.CREATE_DELIVERY,

        // Banking
        Permission.VIEW_BANKING,
        Permission.MANAGE_BANKING,

        // CRM
        Permission.VIEW_CRM,
        Permission.MANAGE_CRM,

        // HR
        Permission.VIEW_HR,
        Permission.MANAGE_HR,

        // Settings
        Permission.VIEW_SETTINGS,
        Permission.MANAGE_SETTINGS,

        // Audit
        Permission.VIEW_AUDIT_LOG,
    ],

    CASHIER: [
        // Sales
        Permission.VIEW_SALES,
        Permission.CREATE_SALES,
        Permission.REPRINT_RECEIPT,

        // POS
        Permission.VIEW_POS,
        Permission.USE_POS,

        // Inventory (view only)
        Permission.VIEW_INVENTORY,

        // Customers (view + create only — no edit/delete)
        Permission.VIEW_CUSTOMERS,
        Permission.CREATE_CUSTOMERS,

        // Suppliers (view only)
        Permission.VIEW_SUPPLIERS,

        // Delivery (view only)
        Permission.VIEW_DELIVERY,

        // Settings (view only)
        Permission.VIEW_SETTINGS,

        // Quotations
        Permission.VIEW_QUOTATIONS,
        Permission.CREATE_QUOTATIONS,
        Permission.CONVERT_QUOTATIONS,

        // Orders
        Permission.VIEW_ORDERS,
        Permission.CREATE_ORDERS,
        Permission.PAY_ORDERS,
        Permission.CANCEL_ORDERS,

        // Distribution
        Permission.VIEW_DISTRIBUTION,
        Permission.CREATE_DISTRIBUTION,
    ],

    STAFF: [
        // All read permissions (matches backend: any key.endsWith('.read') = true)
        Permission.VIEW_SALES,
        Permission.VIEW_INVENTORY,
        Permission.VIEW_STOCK_MOVEMENTS,
        Permission.VIEW_PURCHASE_ORDERS,
        Permission.VIEW_CUSTOMERS,
        Permission.VIEW_SUPPLIERS,
        Permission.VIEW_REPORTS,
        Permission.VIEW_FINANCIAL_REPORTS,
        Permission.VIEW_ACCOUNTING,
        Permission.VIEW_GENERAL_LEDGER,
        Permission.VIEW_EXPENSES,
        Permission.VIEW_QUOTATIONS,
        Permission.VIEW_DISTRIBUTION,
        Permission.VIEW_DELIVERY,
        Permission.VIEW_BANKING,
        Permission.VIEW_CRM,
        Permission.VIEW_HR,
        Permission.VIEW_POS,
        Permission.VIEW_ORDERS,
        Permission.VIEW_SETTINGS,

        // POS create + Orders create (dispenser workflow)
        Permission.USE_POS,
        Permission.CREATE_ORDERS,
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
