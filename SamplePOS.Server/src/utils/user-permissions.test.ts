/**
 * User Permissions Tests (Backend)
 * 
 * Tests for RBAC role-permission mapping.
 */

import {
    getUserPermissions,
    hasPermission,
    ROLE_PERMISSIONS,
    type User,
    type UserRole,
} from '../../../shared/types/user.js';

function makeUser(role: UserRole): User {
    return {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@test.com',
        fullName: 'Test User',
        role,
        isActive: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
    };
}

describe('ROLE_PERMISSIONS', () => {
    it('should define all four roles', () => {
        const roles: UserRole[] = ['ADMIN', 'MANAGER', 'CASHIER', 'STAFF'];
        for (const role of roles) {
            expect(ROLE_PERMISSIONS[role]).toBeDefined();
        }
    });

    it('ADMIN should have all permissions enabled', () => {
        const perms = ROLE_PERMISSIONS.ADMIN;
        const allEnabled = Object.values(perms).every(v => v === true);
        expect(allEnabled).toBe(true);
    });

    it('MANAGER should not manage users or access admin panel', () => {
        const perms = ROLE_PERMISSIONS.MANAGER;
        expect(perms.canManageUsers).toBe(false);
        expect(perms.canAccessAdminPanel).toBe(false);
    });

    it('CASHIER should view sales but not manage inventory', () => {
        const perms = ROLE_PERMISSIONS.CASHIER;
        expect(perms.canViewSales).toBe(true);
        expect(perms.canCreateSales).toBe(true);
        expect(perms.canManageInventory).toBe(false);
    });

    it('STAFF should only view inventory', () => {
        const perms = ROLE_PERMISSIONS.STAFF;
        expect(perms.canViewInventory).toBe(true);
        const otherPerms = { ...perms };
        delete (otherPerms as Record<string, boolean>).canViewInventory;
        const allFalse = Object.values(otherPerms).every(v => v === false);
        expect(allFalse).toBe(true);
    });
});

describe('getUserPermissions', () => {
    it('should return permissions for a valid role', () => {
        const perms = getUserPermissions('ADMIN');
        expect(perms).toHaveProperty('canViewSales');
        expect(perms).toHaveProperty('canManageUsers');
    });
});

describe('hasPermission', () => {
    it('should return true for ADMIN with any permission', () => {
        const admin = makeUser('ADMIN');
        expect(hasPermission(admin, 'canManageUsers')).toBe(true);
        expect(hasPermission(admin, 'canDeleteSales')).toBe(true);
    });

    it('should return false for CASHIER managing users', () => {
        const cashier = makeUser('CASHIER');
        expect(hasPermission(cashier, 'canManageUsers')).toBe(false);
    });

    it('should return true for CASHIER viewing customers', () => {
        const cashier = makeUser('CASHIER');
        expect(hasPermission(cashier, 'canViewCustomers')).toBe(true);
    });

    it('should return false for STAFF viewing sales', () => {
        const staff = makeUser('STAFF');
        expect(hasPermission(staff, 'canViewSales')).toBe(false);
    });
});
