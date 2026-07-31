/**
 * PROOF: Permissions SSOT
 * - Inventory stock adjust accepts inventory.adjust OR inventory.approve
 * - Waiter can take takeaway (restaurant.order + ensureServiceLanes, not restaurant.manage)
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

describe('PROOF: Waiter takeaway SSOT', () => {
  it('waiter grants include restaurant.order + customers (not pay/manage/kitchen)', () => {
    expect(SYSTEM_WAITER_PERMISSION_KEYS).toContain('restaurant.order');
    expect(SYSTEM_WAITER_PERMISSION_KEYS).toContain('restaurant.read');
    expect(SYSTEM_WAITER_PERMISSION_KEYS).toContain('customers.create');
    expect(SYSTEM_WAITER_PERMISSION_KEYS).not.toContain('restaurant.pay');
    expect(SYSTEM_WAITER_PERMISSION_KEYS).not.toContain('restaurant.manage');
    expect(SYSTEM_WAITER_PERMISSION_KEYS).not.toContain('restaurant.kitchen');
    expect(
      isSystemWaiterPermission({ key: 'restaurant.order', module: 'restaurant' }),
    ).toBe(true);
    expect(
      isSystemWaiterPermission({ key: 'restaurant.manage', module: 'restaurant' }),
    ).toBe(false);
    pass('waiter grant matrix');
  });

  it('service-lanes/ensure is gated by restaurant.order (waiters can create TA/DL/QK)', () => {
    const routes = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantRoutes.ts');
    expect(routes).toMatch(/\/service-lanes\/ensure/);
    expect(routes).toMatch(/requirePermission\('restaurant\.order'\)/);

    const svc = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantService.ts');
    expect(svc).toMatch(/async ensureServiceLanes/);
    expect(svc).toMatch(/code: 'TA'/);
    expect(svc).toMatch(/code: 'DL'/);
    expect(svc).toMatch(/code: 'QK'/);

    const pos = readClient('pages/restaurant/RestaurantPosPage.tsx');
    expect(pos).toMatch(/ensureServiceLanes/);
    expect(pos).toMatch(/openServiceLane/);
    // Must NOT require restaurant.manage to open missing takeaway lane
    const openFn = pos.slice(pos.indexOf('const openServiceLane'), pos.indexOf('const saveGuestMutation'));
    expect(openFn).toMatch(/canOrder/);
    expect(openFn).not.toMatch(/canManage/);
    pass('waiter takeaway ensureServiceLanes');
  });

  it('migration 578 seeds lanes + inventory.adjust catalog + waiter grants', () => {
    const sql = readRepo('shared/sql/578_rbac_inventory_adjust_and_waiter_service_lanes.sql');
    expect(sql).toContain("'inventory.adjust'");
    expect(sql).toContain("'TA'");
    expect(sql).toContain("'DL'");
    expect(sql).toContain("'QK'");
    expect(sql).toContain("lower(name) = 'waiter'");
    expect(sql).toContain("'restaurant.order'");
    expect(sql).toMatch(/schema_version[\s\S]*578/);
    const ver = readRepo('SamplePOS.Server/src/constants/schemaVersion.ts');
    expect(ver).toMatch(/CURRENT_SCHEMA_VERSION\s*=\s*578/);
    pass('migration 578 heal');
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
      ? '**PASS** — inventory adjust/approve SSOT + waiter takeaway service lanes.'
      : '**FAIL** — incomplete.',
    '',
  ].join('\n');
  writeFileSync(resolve(here, '../../../PROOF_PERMISSIONS_SSOT.md'), body, 'utf8');
});
