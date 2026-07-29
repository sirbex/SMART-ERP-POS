/**
 * When restaurant mode is on, retail Point of Sale is hidden — tenant sells via Restaurant FOH.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldHideRetailPos } from '../utils/retailPosVisibility';
import {
  isCashierAllowedPath,
  resolveCashierHomePath,
  resolveCashierNavItems,
  resolvePostLoginPath,
} from '../utils/cashierLockdown';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

function readRepo(rel: string) {
  return readFileSync(resolve(repoRoot, rel), 'utf8');
}

describe('restaurant mode hides retail POS', () => {
  it('EVIDENCE: flag on → hide retail POS', () => {
    expect(shouldHideRetailPos(true)).toBe(true);
    expect(shouldHideRetailPos(false)).toBe(false);
  });

  it('EVIDENCE: cashier home and nav swap to Restaurant when mode on', () => {
    expect(resolveCashierHomePath(true)).toBe('/restaurant');
    expect(resolveCashierHomePath(false)).toBe('/pos');
    expect(resolveCashierNavItems(true).map((i) => i.path)).toContain('/restaurant');
    expect(resolveCashierNavItems(true).map((i) => i.path)).not.toContain('/pos');
    expect(isCashierAllowedPath('/pos', { restaurantEnabled: true })).toBe(false);
    expect(isCashierAllowedPath('/restaurant', { restaurantEnabled: true })).toBe(true);
    expect(resolvePostLoginPath({ role: 'CASHIER', restaurantEnabled: true })).toBe('/restaurant');
  });

  it('EVIDENCE gate: Layout + guard hide / redirect /pos when restaurant enabled', () => {
    const layout = readRepo('samplepos.client/src/components/Layout.tsx');
    expect(layout).toMatch(/shouldHideRetailPos\(restaurantEnabled\)/);
    expect(layout).toMatch(/item\.path === '\/pos'/);

    const guard = readRepo('samplepos.client/src/components/auth/CashierPathGuard.tsx');
    expect(guard).toMatch(/shouldHideRetailPos\(restaurantEnabled\)/);
    expect(guard).toMatch(/Navigate to="\/restaurant"/);
  });
});
