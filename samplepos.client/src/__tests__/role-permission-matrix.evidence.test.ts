/**
 * Role permission matrix — Cashier / Waiter / Accountant FOH + inventory integrity.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SYSTEM_ACCOUNTANT_EXTRA_KEYS,
  SYSTEM_CASHIER_PERMISSION_KEYS,
  SYSTEM_WAITER_PERMISSION_KEYS,
  isSystemCashierPermission,
  isSystemWaiterPermission,
} from '../../../shared/authorization/systemRoleGrants';
import { shouldLockSalesToBusinessDay } from '../../../shared/authorization/salesPolicy';
import { canEditOtherWaitersChecks } from '../../../shared/utils/restaurantCheckOwnership';

const here = dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(resolve(here, rel), 'utf8');
}

describe('Role grant SSOT', () => {
  it('cashier includes inventory.read and restaurant.pay; waiter never has pay', () => {
    expect(SYSTEM_CASHIER_PERMISSION_KEYS).toContain('inventory.read');
    expect(SYSTEM_CASHIER_PERMISSION_KEYS).toContain('restaurant.pay');
    expect(SYSTEM_CASHIER_PERMISSION_KEYS).toContain('restaurant.order');
    expect(SYSTEM_WAITER_PERMISSION_KEYS).not.toContain('restaurant.pay');
    expect(SYSTEM_WAITER_PERMISSION_KEYS).not.toContain('restaurant.kitchen');
    expect(isSystemCashierPermission({ key: 'inventory.read', module: 'inventory' })).toBe(true);
    expect(isSystemWaiterPermission({ key: 'restaurant.pay', module: 'restaurant' })).toBe(false);
  });

  it('accountant gets full restaurant operate + pay keys', () => {
    expect(SYSTEM_ACCOUNTANT_EXTRA_KEYS).toContain('restaurant.read');
    expect(SYSTEM_ACCOUNTANT_EXTRA_KEYS).toContain('restaurant.order');
    expect(SYSTEM_ACCOUNTANT_EXTRA_KEYS).toContain('restaurant.kitchen');
    expect(SYSTEM_ACCOUNTANT_EXTRA_KEYS).toContain('restaurant.pay');
  });

  it('migration 575 aligns cashier inventory + accountant restaurant.order', () => {
    const sql = readFileSync(
      resolve(here, '../../../shared/sql/575_rbac_cashier_accountant_waiter_align.sql'),
      'utf8',
    );
    expect(sql).toContain("'inventory.read'");
    expect(sql).toContain("'restaurant.order'");
    expect(sql).toContain("name = 'Waiter'");
    expect(sql).toContain("'restaurant.pay'");
  });
});

describe('FOH + sales day policy', () => {
  it('cashiers with restaurant.pay see all tables; waiters do not', () => {
    expect(
      canEditOtherWaitersChecks({
        userId: 'c1',
        role: 'CASHIER',
        permissions: ['restaurant.pay', 'restaurant.order'],
      }),
    ).toBe(true);
    expect(
      canEditOtherWaitersChecks({
        userId: 'w1',
        role: 'WAITER',
        permissions: ['restaurant.order', 'restaurant.read'],
      }),
    ).toBe(false);
  });

  it('cashiers lock sales to business day', () => {
    expect(shouldLockSalesToBusinessDay(['sales.read', 'pos.create'], 'CASHIER')).toBe(true);
    expect(shouldLockSalesToBusinessDay(['accounting.read', 'sales.read'], 'ACCOUNTANT')).toBe(false);
  });

  it('RestaurantPosPage gates Pay on restaurant.pay; SalesPage locks cashier day', () => {
    const foh = read('../pages/restaurant/RestaurantPosPage.tsx');
    const sales = read('../pages/SalesPage.tsx');
    const offline = read('../contexts/OfflineContext.tsx');
    expect(foh).toContain("useCanAccess(undefined, ['restaurant.pay'])");
    expect(foh).toContain('canRestaurantPay ? (');
    expect(foh).toContain('data-pos-primary="pay"');
    expect(sales).toContain('shouldLockSalesToBusinessDay');
    expect(sales).toContain('data-sales-day-lock="true"');
    expect(offline).toContain('canSyncInventoryReadFromCache');
    expect(offline).toContain('inventory.read');
  });
});
