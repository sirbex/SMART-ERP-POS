import {
  evaluatePermission,
  authorizeFromContext,
  evaluateStoreAccessPolicy,
  evaluateTransferStorePolicy,
  formatDeniedReason,
} from '@shared/authorization/permissionEvaluation.js';
import { legacyRoleGrantsPermission, LEGACY_CASHIER_PERMISSIONS } from '@shared/authorization/legacyRoleFallback.js';

describe('shared authorization — legacyRoleFallback', () => {
  it('ADMIN legacy role grants any permission', () => {
    expect(legacyRoleGrantsPermission('ADMIN', 'sales.refund')).toBe(true);
    expect(legacyRoleGrantsPermission('ADMIN', 'accounting.post')).toBe(true);
  });

  it('MANAGER legacy role grants module-prefix permissions', () => {
    expect(legacyRoleGrantsPermission('MANAGER', 'inventory.transfer.create')).toBe(true);
    expect(legacyRoleGrantsPermission('MANAGER', 'admin.delete')).toBe(false);
  });

  it('CASHIER legacy role grants explicit keys only', () => {
    expect(legacyRoleGrantsPermission('CASHIER', 'orders.read')).toBe(true);
    expect(legacyRoleGrantsPermission('CASHIER', 'inventory.adjust')).toBe(false);
    for (const key of LEGACY_CASHIER_PERMISSIONS) {
      expect(legacyRoleGrantsPermission('CASHIER', key)).toBe(true);
    }
  });
});

describe('shared authorization — permissionEvaluation', () => {
  const subject = { id: 'user-1', legacyRole: 'CASHIER' };

  it('grants when permission is in set', () => {
    const perms = new Set(['orders.read']);
    expect(evaluatePermission(subject, 'orders.read', perms).allowed).toBe(true);
  });

  it('denies when permission missing and no legacy fallback', () => {
    const perms = new Set<string>();
    const result = evaluatePermission(subject, 'inventory.adjust', perms);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('PERMISSION_DENIED');
  });

  it('uses legacy fallback only when explicitly enabled', () => {
    const perms = new Set<string>();
    expect(
      evaluatePermission(subject, 'orders.read', perms, { useLegacyFallback: true }).allowed
    ).toBe(true);
    expect(
      evaluatePermission(subject, 'inventory.adjust', perms, { useLegacyFallback: true }).allowed
    ).toBe(false);
  });
});

describe('shared authorization — policy evaluation', () => {
  const subject = { id: 'user-1', legacyRole: 'MANAGER' };

  it('denies transfer when destination store not permitted', () => {
    const perms = new Set(['inventory.transfer.create']);
    const result = authorizeFromContext(
      subject,
      {
        permission: 'inventory.transfer.create',
        context: {
          facts: {
            sourceStoreId: 'store-a',
            destinationStoreId: 'store-b',
            allowedStoreIds: ['store-a'],
          },
        },
      },
      perms,
      [evaluateTransferStorePolicy]
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('POLICY_DENIED');
    expect(formatDeniedReason(result)).toContain('destination');
  });

  it('allows transfer when both stores permitted', () => {
    const perms = new Set(['inventory.transfer.create']);
    const result = authorizeFromContext(
      subject,
      {
        permission: 'inventory.transfer.create',
        context: {
          facts: {
            sourceStoreId: 'store-a',
            destinationStoreId: 'store-b',
            allowedStoreIds: ['store-a', 'store-b'],
          },
        },
      },
      perms,
      [evaluateTransferStorePolicy]
    );
    expect(result.allowed).toBe(true);
  });

  it('evaluateStoreAccessPolicy denies unknown store', () => {
    const result = evaluateStoreAccessPolicy(subject, {
      permission: 'inventory.read',
      context: { facts: { storeId: 'store-x', allowedStoreIds: ['store-a'] } },
    });
    expect(result?.allowed).toBe(false);
  });
});
