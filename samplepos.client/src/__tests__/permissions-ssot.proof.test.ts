/**
 * PROOF: Permissions SSOT
 * - Inventory stock adjust accepts inventory.adjust OR inventory.approve
 * - Service lanes (TA/DL/QK) are cashiers/managers only — waiters use dining tables
 */
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INVENTORY_STOCK_ADJUST_PERMISSIONS,
  isInventoryStockAdjustPermission,
} from '../../../shared/authorization/inventoryAdjustPermissions';
import {
  SYSTEM_WAITER_PERMISSION_KEYS,
  isSystemWaiterPermission,
} from '../../../shared/authorization/systemRoleGrants';
import {
  canAccessRestaurantServiceLane,
  canMutateRestaurantCheck,
} from '../../../shared/utils/restaurantCheckOwnership';

const here = dirname(fileURLToPath(import.meta.url));
const results: string[] = [];

function pass(label: string) {
  results.push(`- PASS ${label}`);
}

function readClient(rel: string): string {
  return readFileSync(join(here, '..', rel), 'utf8');
}

function readRepo(rel: string): string {
  return readFileSync(resolve(here, '../../..', rel), 'utf8');
}

describe('PROOF: Inventory adjust/approve SSOT', () => {
  it('shared SSOT lists both keys', () => {
    expect(INVENTORY_STOCK_ADJUST_PERMISSIONS).toEqual([
      'inventory.adjust',
      'inventory.approve',
    ]);
    expect(isInventoryStockAdjustPermission('inventory.approve')).toBe(true);
    expect(isInventoryStockAdjustPermission('inventory.read')).toBe(false);
    pass('inventory adjust SSOT keys');
  });

  it('server + client consume SSOT (not one-sided keys)', () => {
    const routes = readRepo('SamplePOS.Server/src/modules/inventory/inventoryRoutes.ts');
    expect(routes).toMatch(/INVENTORY_STOCK_ADJUST_PERMISSIONS/);
    expect(routes).toMatch(/requireAnyPermission\(\[\.\.\.INVENTORY_STOCK_ADJUST_PERMISSIONS\]\)/);

    const app = readClient('App.tsx');
    expect(app).toMatch(/inventory\.adjust['"],\s*['"]inventory\.approve/);

    const page = readClient('pages/inventory/InventoryAdjustmentsPage.tsx');
    expect(page).toMatch(/INVENTORY_STOCK_ADJUST_PERMISSIONS/);
    expect(page).toMatch(/useHasAnyPermission/);
    pass('inventory adjust wiring');
  });
});

describe('PROOF: Service lanes restricted from waiters', () => {
  it('waiter grants exclude pay/manage (cannot access service lanes)', () => {
    expect(SYSTEM_WAITER_PERMISSION_KEYS).toContain('restaurant.order');
    expect(SYSTEM_WAITER_PERMISSION_KEYS).toContain('restaurant.read');
    expect(SYSTEM_WAITER_PERMISSION_KEYS).not.toContain('restaurant.pay');
    expect(SYSTEM_WAITER_PERMISSION_KEYS).not.toContain('restaurant.manage');
    expect(
      isSystemWaiterPermission({ key: 'restaurant.order', module: 'restaurant' }),
    ).toBe(true);
    expect(
      isSystemWaiterPermission({ key: 'restaurant.manage', module: 'restaurant' }),
    ).toBe(false);

    const waiterActor = {
      userId: 'w1',
      role: 'STAFF',
      permissions: SYSTEM_WAITER_PERMISSION_KEYS,
    };
    expect(canAccessRestaurantServiceLane(waiterActor)).toBe(false);
    expect(
      canMutateRestaurantCheck({
        checkWaiterId: null,
        actor: waiterActor,
        sharedServiceCounter: true,
      }),
    ).toBe(false);

    const managerActor = {
      userId: 'm1',
      role: 'MANAGER',
      permissions: ['restaurant.manage', 'restaurant.order'],
    };
    const cashierActor = {
      userId: 'c1',
      role: 'CASHIER',
      permissions: ['restaurant.pay', 'restaurant.order'],
    };
    expect(canAccessRestaurantServiceLane(managerActor)).toBe(true);
    expect(canAccessRestaurantServiceLane(cashierActor)).toBe(true);
    pass('waiter vs manager/cashier service-lane access');
  });

  it('service-lanes/ensure requires manage or pay (not restaurant.order alone)', () => {
    const routes = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantRoutes.ts');
    expect(routes).toMatch(/\/service-lanes\/ensure/);
    expect(routes).toMatch(
      /requireAnyPermission\(\[\s*'restaurant\.manage',\s*'restaurant\.pay'\s*\]\)/,
    );

    const pos = readClient('pages/restaurant/RestaurantPosPage.tsx');
    expect(pos).toMatch(/canAccessServiceLanes/);
    expect(pos).toMatch(/openServiceLane/);
    const openFn = pos.slice(
      pos.indexOf('const openServiceLane'),
      pos.indexOf('const saveGuestMutation'),
    );
    expect(openFn).toMatch(/canAccessServiceLanes/);
    expect(pos).toMatch(/canManage \|\| canRestaurantPay/);
    pass('service lane ensure gated to manage/pay');
  });

  it('migration 578 still documents TA/DL/QK lane seed (lanes remain; access is RBAC)', () => {
    const sql = readRepo('shared/sql/578_rbac_inventory_adjust_and_waiter_service_lanes.sql');
    expect(sql).toContain("'TA'");
    expect(sql).toContain("'DL'");
    expect(sql).toContain("'QK'");
    pass('migration 578 service lane seed rows exist');
  });
});

afterAll(() => {
  const body = [
    '# PROOF: Permissions SSOT',
    '',
    `- Date: ${new Date().toISOString()}`,
    '- Runner: `npx vitest run src/__tests__/permissions-ssot.proof.test.ts`',
    '',
    '## Results',
    ...results,
    '',
    '## Verdict',
    results.length >= 5
      ? '**PASS** — inventory adjust SSOT + service lanes hidden from waiters (manage/pay only).'
      : '**FAIL** — incomplete.',
    '',
  ].join('\n');
  writeFileSync(resolve(here, '../../../PROOF_PERMISSIONS_SSOT.md'), body, 'utf8');
});
