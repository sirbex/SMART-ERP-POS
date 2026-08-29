/**
 * PROOF: Prepared food + Buffet cover fields are restaurant-tenant only.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveRestaurantKitchenCatalogFlags,
  showRestaurantKitchenCatalogFields,
} from '@shared/utils/productTypeRules';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('PROOF: restaurant-only kitchen catalog fields', () => {
  it('SSOT: flags forced off when restaurant mode is disabled', () => {
    expect(showRestaurantKitchenCatalogFields(false)).toBe(false);
    expect(showRestaurantKitchenCatalogFields(true)).toBe(true);
    expect(
      resolveRestaurantKitchenCatalogFlags(false, { isPreparedFood: true, isBuffetCover: true }),
    ).toEqual({ isPreparedFood: false, isBuffetCover: false });
  });

  it('ProductForm gates prepared food + buffet cover with showKitchenCatalog', () => {
    const form = read('samplepos.client/src/components/products/ProductForm.tsx');
    expect(form).toContain('showRestaurantKitchenCatalogFields');
    expect(form).toMatch(/showKitchenCatalog\s*&&\s*sections\.showPreparedFood/);
    expect(form).toMatch(/showKitchenCatalog\s*&&\s*\(/);
    expect(form).toContain('is-prepared-food');
    expect(form).toContain('is-buffet-cover-inv');
    expect(form).toContain('is-buffet-cover-svc');
    // Inventory buffet block must not render ungated
    expect(form).not.toMatch(
      /\{sections\.showPreparedFood\s*&&\s*\(\s*<div className="mt-3 flex items-start gap-2">\s*<input\s+id="is-prepared-food"/,
    );
  });

  it('ProductsPage save uses resolveRestaurantKitchenCatalogFlags', () => {
    const page = read('samplepos.client/src/pages/inventory/ProductsPage.tsx');
    expect(page).toContain('useRestaurantEnabled');
    expect(page).toContain('resolveRestaurantKitchenCatalogFlags');
    expect(page).toMatch(/isPreparedFood:\s*kitchenFlags\.isPreparedFood/);
    expect(page).toMatch(/isBuffetCover:\s*kitchenFlags\.isBuffetCover/);
  });
});
