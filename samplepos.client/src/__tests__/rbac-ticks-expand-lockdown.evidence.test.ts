/**
 * EVIDENCE: Role Management ticks expand access (SSOT).
 * Default Cashier/Waiter grant sets keep POS/FOH lockdown; any extra catalog key escapes it.
 *
 * Run: npx vitest run src/__tests__/rbac-ticks-expand-lockdown.evidence.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  SYSTEM_CASHIER_PERMISSION_KEYS,
  SYSTEM_WAITER_PERMISSION_KEYS,
} from '@shared/authorization/systemRoleGrants';
import {
  isCashierAllowedPath,
  isCashierLockdownActive,
  resolveCashierNavItems,
} from '../utils/cashierLockdown';
import { isRestaurantWaiterProfile } from '../utils/restaurantWaiterLockdown';

describe('EVIDENCE — RBAC ticks expand lockdown', () => {
  it('default cashier grants keep lockdown; accounting.read escapes', () => {
    expect(
      isCashierLockdownActive({
        role: 'CASHIER',
        permissions: SYSTEM_CASHIER_PERMISSION_KEYS,
      }),
    ).toBe(true);
    expect(
      isCashierLockdownActive({
        role: 'CASHIER',
        permissions: [...SYSTEM_CASHIER_PERMISSION_KEYS, 'accounting.read'],
      }),
    ).toBe(false);
  });

  it('default cashier paths include expenses/reports when those keys are granted', () => {
    expect(
      isCashierAllowedPath('/expenses', {
        permissions: SYSTEM_CASHIER_PERMISSION_KEYS,
      }),
    ).toBe(true);
    expect(
      isCashierAllowedPath('/reports', {
        permissions: SYSTEM_CASHIER_PERMISSION_KEYS,
      }),
    ).toBe(true);
    expect(
      resolveCashierNavItems(false, SYSTEM_CASHIER_PERMISSION_KEYS).some(
        (i) => i.path === '/expenses',
      ),
    ).toBe(true);
  });

  it('waiter profile escapes when kitchen (or any non-default) key is ticked', () => {
    expect(
      isRestaurantWaiterProfile({
        role: 'STAFF',
        permissions: SYSTEM_WAITER_PERMISSION_KEYS,
        restaurantEnabled: true,
      }),
    ).toBe(true);
    expect(
      isRestaurantWaiterProfile({
        role: 'STAFF',
        permissions: [...SYSTEM_WAITER_PERMISSION_KEYS, 'restaurant.kitchen'],
        restaurantEnabled: true,
      }),
    ).toBe(false);
    expect(
      isRestaurantWaiterProfile({
        role: 'STAFF',
        permissions: [...SYSTEM_WAITER_PERMISSION_KEYS, 'accounting.read'],
        restaurantEnabled: true,
      }),
    ).toBe(false);
  });
});
