/**
 * BEHAVIORAL proof — restaurant check ownership + admin RBAC role override.
 * Writes PROOF_RESTAURANT_CHECK_OWNERSHIP.md on PASS.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isSystemAdminRbacRoleName,
  rbacRoleNameMapsToLegacyAdmin,
} from '@shared/authorization/rbacAdminRole';
import {
  canEditOtherWaitersChecks,
  canMutateRestaurantCheck,
} from '@shared/utils/restaurantCheckOwnership';

const results: string[] = [];

function pass(label: string) {
  results.push(`- PASS ${label}`);
}

const otherWaiterId = 'waiter-b';

describe('PROOF: restaurant check ownership (behavioral)', () => {
  it('waiter cannot mutate another waiter check', () => {
    const waiter = {
      userId: 'waiter-a',
      role: 'STAFF',
      permissions: ['restaurant.read', 'restaurant.order'],
    };
    expect(canEditOtherWaitersChecks(waiter)).toBe(false);
    expect(canMutateRestaurantCheck({ checkWaiterId: otherWaiterId, actor: waiter })).toBe(false);
    pass('waiter blocked');
  });

  it('legacy CASHIER edits peer checks without RBAC permission list', () => {
    expect(
      canEditOtherWaitersChecks({
        userId: 'cash-legacy',
        role: 'CASHIER',
        permissions: [],
      }),
    ).toBe(true);
    pass('legacy cashier');
  });

  it('RBAC Admin role name edits peers even when users.role is STAFF', () => {
    const actor = {
      userId: 'store-admin',
      role: 'STAFF',
      permissions: ['restaurant.order'],
      rbacRoleNames: ['Admin'],
    };
    expect(canEditOtherWaitersChecks(actor)).toBe(true);
    expect(canMutateRestaurantCheck({ checkWaiterId: otherWaiterId, actor })).toBe(true);
    pass('RBAC Admin role name');
  });

  it('Administrator and Super Administrator map as admin RBAC roles', () => {
    expect(isSystemAdminRbacRoleName('Administrator')).toBe(true);
    expect(isSystemAdminRbacRoleName('Super Administrator')).toBe(true);
    expect(isSystemAdminRbacRoleName('Admin')).toBe(true);
    expect(rbacRoleNameMapsToLegacyAdmin('Admin')).toBe(true);
    expect(isSystemAdminRbacRoleName('Waiter')).toBe(false);
    pass('admin role name SSOT');
  });

  it('admin.* permissions still edit peers when role is mis-seeded STAFF', () => {
    expect(
      canEditOtherWaitersChecks({
        userId: 'misseeded-admin',
        role: 'STAFF',
        permissions: ['admin.read', 'restaurant.order'],
      }),
    ).toBe(true);
    pass('admin.* permissions');
  });
});

afterAll(() => {
  const body = [
    '# PROOF: Restaurant check ownership (behavioral)',
    '',
    `- Date: ${new Date().toISOString()}`,
    '- Runner: `npx vitest run src/__tests__/restaurant-check-ownership.proof.test.ts`',
    '',
    '## Policy',
    'Behavioral tests only — grep/source-scan evidence is **not** accepted.',
    '',
    '## Results',
    ...results,
    '',
    '## Verdict',
    results.length >= 5
      ? '**PASS** — waiters blocked on peer tables; admin RBAC roles and cashiers override ownership.'
      : '**FAIL** — incomplete result set.',
    '',
  ].join('\n');
  writeFileSync(join(__dirname, '../../../PROOF_RESTAURANT_CHECK_OWNERSHIP.md'), body, 'utf8');
});
