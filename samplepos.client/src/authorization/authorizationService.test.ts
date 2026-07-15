import { describe, it, expect } from 'vitest';
import { createClientAuthorization } from './authorizationService';
import { legacyRoleGrantsPermission } from '@shared/authorization/legacyRoleFallback';

describe('ClientAuthorizationService', () => {
  it('grants access from RBAC permission set regardless of role name', () => {
    const authz = createClientAuthorization(
      { id: 'u1', role: 'STAFF' },
      new Set(['inventory.adjust'])
    )!;
    expect(authz.hasPermission('inventory.adjust')).toBe(true);
    expect(authz.hasPermission('inventory.delete')).toBe(false);
  });

  it('uses legacy fallback only when no RBAC permissions loaded', () => {
    const authz = createClientAuthorization(
      { id: 'u1', role: 'CASHIER' },
      new Set()
    )!;
    expect(authz.hasPermission('orders.read')).toBe(true);
    expect(authz.hasPermission('inventory.adjust')).toBe(false);
  });

  it('ADMIN is allowed even when RBAC set is incomplete (missing orders.*)', () => {
    const authz = createClientAuthorization(
      { id: 'u1', role: 'ADMIN' },
      new Set(['pos.read', 'sales.read', 'admin.update'])
    )!;
    expect(authz.hasPermission('orders.read')).toBe(true);
    expect(authz.hasPermission('orders.pay')).toBe(true);
  });

  it('renamed role with permissions does not need role name match', () => {
    // "Front Desk" is not a legacy role — but permissions drive access
    const authz = createClientAuthorization(
      { id: 'u1', role: 'STAFF' },
      new Set(['orders.read', 'orders.pay', 'sales.refund'])
    )!;
    expect(authz.hasPermission('sales.refund')).toBe(true);
    expect(legacyRoleGrantsPermission('STAFF', 'sales.refund')).toBe(false);
  });

  it('denies transfer when destination store not in policy', () => {
    const authz = createClientAuthorization(
      { id: 'u1', role: 'MANAGER' },
      new Set(['inventory.transfer.create'])
    )!;
    const result = authz.authorizeResult({
      permission: 'inventory.transfer.create',
      context: {
        facts: {
          sourceStoreId: 'a',
          destinationStoreId: 'b',
          allowedStoreIds: ['a'],
        },
      },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('POLICY_DENIED');
  });
});
