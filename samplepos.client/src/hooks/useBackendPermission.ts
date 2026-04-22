/**
 * Hook to check if the current user has a specific backend permission.
 *
 * Uses the session-embedded permissions from AuthContext (ERP pattern).
 * Falls back to the legacy hardcoded role-permission mapping only if
 * the session permissions are empty (not yet loaded).
 *
 * Usage:
 *   const canVoid = useBackendPermission('sales.void');
 *   const canRefund = useBackendPermission('sales.refund');
 */

import { useAuth } from './useAuth';
import { hasPermission, Permission } from '../utils/rolePermissions';
import type { UserRole } from '../types';

/**
 * Maps backend permission keys (e.g. 'sales.void') to the legacy frontend
 * Permission enum values so the fallback path works correctly.
 */
const BACKEND_TO_LEGACY: Record<string, Permission> = {
    // Sales
    'sales.read': Permission.VIEW_SALES,
    'sales.create': Permission.CREATE_SALES,
    'sales.update': Permission.EDIT_SALES,
    'sales.delete': Permission.DELETE_SALES,
    'sales.void': Permission.VOID_SALES,
    'sales.refund': Permission.REFUND_SALES,
    'sales.reprint': Permission.REPRINT_RECEIPT,
    // Inventory
    'inventory.read': Permission.VIEW_INVENTORY,
    'inventory.create': Permission.CREATE_INVENTORY,
    'inventory.update': Permission.EDIT_INVENTORY,
    'inventory.delete': Permission.DELETE_INVENTORY,
    'inventory.manage': Permission.MANAGE_INVENTORY,
    'inventory.adjust': Permission.ADJUST_STOCK,
    // Purchasing
    'purchasing.read': Permission.VIEW_PURCHASE_ORDERS,
    'purchasing.create': Permission.CREATE_PURCHASE_ORDERS,
    'purchasing.update': Permission.EDIT_PURCHASE_ORDERS,
    'purchasing.approve': Permission.APPROVE_PURCHASE_ORDERS,
    'purchasing.post': Permission.RECEIVE_GOODS,
    // Customers (granular: create ≠ update/delete)
    'customers.read': Permission.VIEW_CUSTOMERS,
    'customers.create': Permission.CREATE_CUSTOMERS,
    'customers.update': Permission.MANAGE_CUSTOMERS,
    'customers.delete': Permission.MANAGE_CUSTOMERS,
    // Suppliers (granular: create ≠ update/delete)
    'suppliers.read': Permission.VIEW_SUPPLIERS,
    'suppliers.create': Permission.CREATE_SUPPLIERS,
    'suppliers.update': Permission.MANAGE_SUPPLIERS,
    'suppliers.delete': Permission.MANAGE_SUPPLIERS,
    // Reports
    'reports.read': Permission.VIEW_REPORTS,
    'reports.financial_view': Permission.VIEW_FINANCIAL_REPORTS,
    'reports.export': Permission.EXPORT_REPORTS,
    // Accounting
    'accounting.read': Permission.VIEW_ACCOUNTING,
    'accounting.post': Permission.POST_JOURNAL_ENTRIES,
    'accounting.chart_manage': Permission.MANAGE_CHART_OF_ACCOUNTS,
    'accounting.manage': Permission.MANAGE_ACCOUNTING,
    // POS
    'pos.read': Permission.VIEW_POS,
    'pos.create': Permission.USE_POS,
    'pos.void': Permission.VOID_POS,
    'pos.approve': Permission.APPROVE_POS,
    // Orders
    'orders.read': Permission.VIEW_ORDERS,
    'orders.create': Permission.CREATE_ORDERS,
    'orders.pay': Permission.PAY_ORDERS,
    'orders.cancel': Permission.CANCEL_ORDERS,
    // Distribution
    'distribution.read': Permission.VIEW_DISTRIBUTION,
    'distribution.create': Permission.CREATE_DISTRIBUTION,
    'distribution.update': Permission.EDIT_DISTRIBUTION,
    'distribution.approve': Permission.APPROVE_DISTRIBUTION,
    // Delivery
    'delivery.read': Permission.VIEW_DELIVERY,
    'delivery.create': Permission.CREATE_DELIVERY,
    // Banking
    'banking.read': Permission.VIEW_BANKING,
    'banking.create': Permission.MANAGE_BANKING,
    'banking.update': Permission.MANAGE_BANKING,
    // Expenses
    'expenses.read': Permission.VIEW_EXPENSES,
    'expenses.create': Permission.CREATE_EXPENSES,
    'expenses.approve': Permission.APPROVE_EXPENSES,
    // CRM
    'crm.read': Permission.VIEW_CRM,
    'crm.create': Permission.MANAGE_CRM,
    'crm.update': Permission.MANAGE_CRM,
    // HR
    'hr.read': Permission.VIEW_HR,
    'hr.create': Permission.MANAGE_HR,
    'hr.update': Permission.MANAGE_HR,
    // Quotations
    'quotations.read': Permission.VIEW_QUOTATIONS,
    'quotations.create': Permission.CREATE_QUOTATIONS,
    // Settings (read ≠ update)
    'settings.read': Permission.VIEW_SETTINGS,
    'settings.update': Permission.MANAGE_SETTINGS,
    // System / Admin
    'system.audit_read': Permission.VIEW_AUDIT_LOG,
    'admin.read': Permission.ACCESS_ADMIN_PANEL,
    'system.users_read': Permission.MANAGE_USERS,
    'system.users_create': Permission.MANAGE_USERS,
    'system.roles_read': Permission.MANAGE_ROLES,
};

/**
 * Check if current user has a backend permission key.
 * Returns `true | false` – never undefined.
 *
 * Priority:
 *  1. If session permissions loaded → check `permissionKey` in Set
 *  2. If session permissions empty → fall back to legacy role-based check
 */
export function useBackendPermission(permissionKey: string): boolean {
    const { user, permissions } = useAuth();

    // Session-embedded permissions available — use as source of truth
    if (permissions.size > 0) {
        return permissions.has(permissionKey);
    }

    // Fallback: map to legacy enum and check against hardcoded role mapping
    if (!user?.role) return false;
    const legacyPerm = BACKEND_TO_LEGACY[permissionKey];
    if (!legacyPerm) return false;
    return hasPermission(user.role as UserRole, legacyPerm);
}
