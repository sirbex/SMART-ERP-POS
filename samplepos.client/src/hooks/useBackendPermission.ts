/**
 * Hook to check if the current user has a specific backend permission.
 *
 * Fetches effective permissions from the backend RBAC system (GET /rbac/me/permissions).
 * Falls back to the legacy hardcoded role-permission mapping only while loading or
 * if the RBAC endpoint is unavailable.
 *
 * Usage:
 *   const canVoid = useBackendPermission('sales.void');
 *   const canRefund = useBackendPermission('sales.refund');
 */

import { useMyPermissions } from './useRbac';
import { useAuth } from './useAuth';
import { hasPermission, Permission } from '../utils/rolePermissions';
import type { UserRole } from '../types';

/**
 * Maps backend permission keys (e.g. 'sales.void') to the legacy frontend
 * Permission enum values so the fallback path works correctly.
 */
const BACKEND_TO_LEGACY: Record<string, Permission> = {
    'sales.read': Permission.VIEW_SALES,
    'sales.create': Permission.CREATE_SALES,
    'sales.update': Permission.EDIT_SALES,
    'sales.delete': Permission.DELETE_SALES,
    'sales.void': Permission.VOID_SALES,
    'sales.refund': Permission.REFUND_SALES,
    'inventory.read': Permission.VIEW_INVENTORY,
    'inventory.manage': Permission.MANAGE_INVENTORY,
    'inventory.adjust': Permission.ADJUST_STOCK,
    'purchasing.read': Permission.VIEW_PURCHASE_ORDERS,
    'purchasing.create': Permission.CREATE_PURCHASE_ORDERS,
    'purchasing.approve': Permission.APPROVE_PURCHASE_ORDERS,
    'customers.read': Permission.VIEW_CUSTOMERS,
    'customers.manage': Permission.MANAGE_CUSTOMERS,
    'suppliers.read': Permission.VIEW_SUPPLIERS,
    'suppliers.manage': Permission.MANAGE_SUPPLIERS,
    'reports.read': Permission.VIEW_REPORTS,
    'reports.financial': Permission.VIEW_FINANCIAL_REPORTS,
    'accounting.read': Permission.VIEW_ACCOUNTING,
    'accounting.post': Permission.POST_JOURNAL_ENTRIES,
};

/**
 * Check if current user has a backend permission key.
 * Returns `true | false` – never undefined.
 *
 * Priority:
 *  1. If RBAC data is loaded → check `permissionKey` in effective permissions
 *  2. If RBAC is loading / errored → fall back to legacy role-based check
 */
export function useBackendPermission(permissionKey: string): boolean {
    const { user } = useAuth();
    const { data: permissions, isLoading, isError } = useMyPermissions();

    // RBAC data available — use it as the source of truth
    if (!isLoading && !isError && permissions && Array.isArray(permissions)) {
        return permissions.some((p) => p.permissionKey === permissionKey);
    }

    // Fallback: map to legacy enum and check against hardcoded role mapping
    if (!user?.role) return false;
    const legacyPerm = BACKEND_TO_LEGACY[permissionKey];
    if (!legacyPerm) return false;
    return hasPermission(user.role as UserRole, legacyPerm);
}
