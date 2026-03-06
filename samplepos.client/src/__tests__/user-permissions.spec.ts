/**
 * User Permissions Tests
 * 
 * Tests for role-based permission mapping and permission checks.
 */

import { describe, it, expect } from 'vitest';
import {
    getUserPermissions,
    hasPermission,
    ROLE_PERMISSIONS,
    type User,
    type UserRole,
} from '@shared/types/user';

describe('User Permissions', () => {
    const makeUser = (role: UserRole): User => ({
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@test.com',
        fullName: 'Test User',
        role,
        isActive: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
    });

    // -------------------------------------------------------------------
    // ROLE_PERMISSIONS
    // -------------------------------------------------------------------
    describe('ROLE_PERMISSIONS', () => {
        it('should define permissions for all roles', () => {
            expect(ROLE_PERMISSIONS).toHaveProperty('ADMIN');
            expect(ROLE_PERMISSIONS).toHaveProperty('MANAGER');
            expect(ROLE_PERMISSIONS).toHaveProperty('CASHIER');
            expect(ROLE_PERMISSIONS).toHaveProperty('STAFF');
        });
    });

    // -------------------------------------------------------------------
    // ADMIN
    // -------------------------------------------------------------------
    describe('ADMIN role', () => {
        it('should have all permissions', () => {
            const perms = getUserPermissions('ADMIN');
            const allTrue = Object.values(perms).every(v => v === true);
            expect(allTrue).toBe(true);
        });
    });

    // -------------------------------------------------------------------
    // MANAGER
    // -------------------------------------------------------------------
    describe('MANAGER role', () => {
        it('should have most permissions', () => {
            const perms = getUserPermissions('MANAGER');
            expect(perms.canViewSales).toBe(true);
            expect(perms.canCreateSales).toBe(true);
            expect(perms.canEditSales).toBe(true);
            expect(perms.canViewReports).toBe(true);
            expect(perms.canManageInventory).toBe(true);
        });

        it('should NOT have admin-only permissions', () => {
            const perms = getUserPermissions('MANAGER');
            expect(perms.canManageUsers).toBe(false);
            expect(perms.canAccessAdminPanel).toBe(false);
        });
    });

    // -------------------------------------------------------------------
    // CASHIER
    // -------------------------------------------------------------------
    describe('CASHIER role', () => {
        it('should view and create sales', () => {
            const perms = getUserPermissions('CASHIER');
            expect(perms.canViewSales).toBe(true);
            expect(perms.canCreateSales).toBe(true);
        });

        it('should NOT edit/delete sales', () => {
            const perms = getUserPermissions('CASHIER');
            expect(perms.canEditSales).toBe(false);
            expect(perms.canDeleteSales).toBe(false);
        });

        it('should NOT manage inventory', () => {
            const perms = getUserPermissions('CASHIER');
            expect(perms.canManageInventory).toBe(false);
            expect(perms.canManagePurchaseOrders).toBe(false);
        });

        it('should view inventory and customers', () => {
            const perms = getUserPermissions('CASHIER');
            expect(perms.canViewInventory).toBe(true);
            expect(perms.canViewCustomers).toBe(true);
        });
    });

    // -------------------------------------------------------------------
    // STAFF
    // -------------------------------------------------------------------
    describe('STAFF role', () => {
        it('should only view inventory', () => {
            const perms = getUserPermissions('STAFF');
            expect(perms.canViewInventory).toBe(true);
        });

        it('should NOT have any other permissions', () => {
            const perms = getUserPermissions('STAFF');
            expect(perms.canViewSales).toBe(false);
            expect(perms.canCreateSales).toBe(false);
            expect(perms.canManageInventory).toBe(false);
            expect(perms.canManageUsers).toBe(false);
            expect(perms.canViewReports).toBe(false);
        });
    });

    // -------------------------------------------------------------------
    // hasPermission
    // -------------------------------------------------------------------
    describe('hasPermission', () => {
        it('should return true for admin with any permission', () => {
            const admin = makeUser('ADMIN');
            expect(hasPermission(admin, 'canManageUsers')).toBe(true);
            expect(hasPermission(admin, 'canAccessAdminPanel')).toBe(true);
        });

        it('should return false for cashier managing users', () => {
            const cashier = makeUser('CASHIER');
            expect(hasPermission(cashier, 'canManageUsers')).toBe(false);
        });

        it('should return true for cashier creating sales', () => {
            const cashier = makeUser('CASHIER');
            expect(hasPermission(cashier, 'canCreateSales')).toBe(true);
        });

        it('should return false for staff viewing sales', () => {
            const staff = makeUser('STAFF');
            expect(hasPermission(staff, 'canViewSales')).toBe(false);
        });
    });
});
