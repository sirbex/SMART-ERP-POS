/**
 * Behavioral proof: restaurant permission grants must match enforcement.
 * Manager has orders.pay but not restaurant.pay → cannot settle FOH checks.
 * Void requires restaurant.order (orders.cancel alone is not enough).
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isSystemAccountantPermission,
  isSystemManagerPermission,
} from '@shared/authorization/systemRoleGrants.js';
import { legacyRoleGrantsPermission } from '@shared/authorization/legacyRoleFallback.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');

describe('restaurant RBAC grant ↔ enforce consistency', () => {
  it('system Manager never gets restaurant.pay; Cashier/Accountant do', () => {
    expect(
      isSystemManagerPermission({ key: 'restaurant.pay', module: 'restaurant', action: 'pay' }),
    ).toBe(false);
    expect(
      isSystemManagerPermission({ key: 'restaurant.order', module: 'restaurant', action: 'create' }),
    ).toBe(true);
    expect(
      isSystemAccountantPermission({ key: 'restaurant.pay', module: 'restaurant', action: 'pay' }),
    ).toBe(true);
    // Accountant covers full restaurant operate (order + kitchen + pay), not settle-only.
    expect(
      isSystemAccountantPermission({
        key: 'restaurant.order',
        module: 'restaurant',
        action: 'create',
      }),
    ).toBe(true);
    expect(
      isSystemAccountantPermission({
        key: 'restaurant.kitchen',
        module: 'restaurant',
        action: 'kitchen',
      }),
    ).toBe(true);

    expect(legacyRoleGrantsPermission('MANAGER', 'restaurant.pay')).toBe(false);
    expect(legacyRoleGrantsPermission('MANAGER', 'restaurant.order')).toBe(true);
    expect(legacyRoleGrantsPermission('CASHIER', 'restaurant.pay')).toBe(true);
    expect(legacyRoleGrantsPermission('STAFF', 'restaurant.pay')).toBe(false);
    expect(legacyRoleGrantsPermission('STAFF', 'restaurant.order')).toBe(true);
  });

  it('order complete enforces restaurant.pay for restaurant checks', () => {
    const routes = readFileSync(resolve(root, 'SamplePOS.Server/src/modules/orders/ordersRoutes.ts'), 'utf8');
    expect(routes).toContain("requireAnyPermission(['orders.pay', 'restaurant.pay'])");
    expect(routes).toContain('isRestaurantCheck');
    expect(routes).toContain("needed = isRestaurantCheck ? 'restaurant.pay' : 'orders.pay'");
  });

  it('restaurant void/cancel require restaurant.order only (no orders.cancel bypass)', () => {
    const routes = readFileSync(
      resolve(root, 'SamplePOS.Server/src/modules/restaurant/restaurantRoutes.ts'),
      'utf8',
    );
    expect(routes).toMatch(
      /router\.post\(\s*'\/checks\/:orderId\/void-items',\s*requirePermission\('restaurant\.order'\)/,
    );
    expect(routes).toMatch(
      /router\.post\(\s*'\/checks\/:orderId\/cancel',\s*requirePermission\('restaurant\.order'\)/,
    );
    expect(routes).not.toMatch(/void-items[\s\S]{0,120}orders\.cancel/);
    expect(routes).not.toMatch(/checks\/:orderId\/cancel[\s\S]{0,120}orders\.cancel/);
  });

  it('FOH UI gates pay by restaurant.pay and floor ops by restaurant.order', () => {
    const pos = readFileSync(
      resolve(root, 'samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx'),
      'utf8',
    );
    expect(pos).toContain("useCanAccess(undefined, ['restaurant.pay'])");
    expect(pos).toContain("useCanAccess(undefined, ['restaurant.order'])");
    expect(pos).toContain('canOrder');
    expect(pos).toMatch(/disabled=\{!order \|\| busy \|\| !canOrder\}/);

    const payPage = readFileSync(
      resolve(root, 'samplepos.client/src/pages/orders/OrderPaymentPage.tsx'),
      'utf8',
    );
    expect(payPage).toContain('canSettleThisOrder');
    expect(payPage).toContain("returnToPath === '/restaurant' ? canRestaurantPay");
  });
});
