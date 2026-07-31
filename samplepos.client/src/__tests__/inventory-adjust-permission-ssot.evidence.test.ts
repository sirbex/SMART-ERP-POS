/**
 * Evidence: stock adjustment accepts inventory.adjust OR inventory.approve.
 * Fixes accountant Role UI ticks that grant approve while the page required adjust (and vice versa).
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  INVENTORY_STOCK_ADJUST_PERMISSIONS,
  isInventoryStockAdjustPermission,
} from '../../../shared/authorization/inventoryAdjustPermissions';

const here = dirname(fileURLToPath(import.meta.url));

describe('inventory adjust ↔ approve permission SSOT', () => {
  it('SSOT lists both adjust and approve', () => {
    expect(INVENTORY_STOCK_ADJUST_PERMISSIONS).toContain('inventory.adjust');
    expect(INVENTORY_STOCK_ADJUST_PERMISSIONS).toContain('inventory.approve');
    expect(isInventoryStockAdjustPermission('inventory.approve')).toBe(true);
    expect(isInventoryStockAdjustPermission('inventory.read')).toBe(false);
  });

  it('server adjust routes use requireAnyPermission with SSOT', () => {
    const routes = readFileSync(
      resolve(here, '../../../SamplePOS.Server/src/modules/inventory/inventoryRoutes.ts'),
      'utf8',
    );
    expect(routes).toMatch(/INVENTORY_STOCK_ADJUST_PERMISSIONS/);
    expect(routes).toMatch(/requireAnyPermission\(\[\.\.\.INVENTORY_STOCK_ADJUST_PERMISSIONS\]\)/);
    expect(routes).not.toMatch(
      /\/adjust'[\s\S]{0,120}requirePermission\('inventory\.approve'\)/,
    );
  });

  it('client adjustments route + page accept either key', () => {
    const app = readFileSync(join(here, '../App.tsx'), 'utf8');
    expect(app).toMatch(/path="\/inventory\/adjustments"/);
    expect(app).toMatch(/inventory\.adjust['"],\s*['"]inventory\.approve/);

    const page = readFileSync(join(here, '../pages/inventory/InventoryAdjustmentsPage.tsx'), 'utf8');
    expect(page).toMatch(/INVENTORY_STOCK_ADJUST_PERMISSIONS/);
    expect(page).toMatch(/useHasAnyPermission/);
  });
});
