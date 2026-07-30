/**
 * Adaptive PWA Platform — Phase 5 evidence
 * Inventory + Purchasing floorplans + Restaurant KOT small-screen fix.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(resolve(here, rel), 'utf8');
}

describe('Restaurant KOT visibility on small screens', () => {
  it('caps menu height and keeps ticket primary actions sticky with min-h-0 lines', () => {
    const src = read('../pages/restaurant/RestaurantPosPage.tsx');
    expect(src).toContain('data-pos-primary="kot"');
    expect(src).toContain('data-ticket-primary-actions="true"');
    expect(src).toContain('max-h-[42%]');
    expect(src).toContain('sticky bottom-0');
    expect(src).toContain('data-ticket-lines="true"');
    // Must not force a large min-height that clips KOT on short phones
    expect(src).not.toMatch(/data-ticket-lines="true"[\s\S]{0,120}min-h-\[8rem\]/);
    expect(src).not.toContain('flex-[1.15]');
  });
});

describe('Phase 5 inventory + purchasing Adaptive floorplans', () => {
  it('StockLevelsPage uses AdaptivePage / Toolbar / Search — keeps offline stock hooks', () => {
    const src = read('../pages/inventory/StockLevelsPage.tsx');
    expect(src).toContain('AdaptivePage');
    expect(src).toContain('AdaptiveToolbar');
    expect(src).toContain('AdaptiveSearch');
    expect(src).toContain('useOfflineStockLevels');
    expect(src).toContain('value={searchTerm}');
  });

  it('GoodsReceiptsPage uses AdaptivePage / Toolbar / Search — keeps GR hooks', () => {
    const src = read('../pages/inventory/GoodsReceiptsPage.tsx');
    expect(src).toContain('AdaptivePage');
    expect(src).toContain('AdaptiveToolbar');
    expect(src).toContain('AdaptiveSearch');
    expect(src).toContain('useGoodsReceipts');
    expect(src).toContain('data-gr-filters');
    expect(src).not.toMatch(/\/api\/mobile/);
  });

  it('PurchaseOrdersPage uses AdaptivePage — keeps PO hooks', () => {
    const src = read('../pages/inventory/PurchaseOrdersPage.tsx');
    expect(src).toContain('AdaptivePage');
    expect(src).toContain('usePurchaseOrders');
    expect(src).toContain('Create PO');
  });

  it('SuppliersPage uses AdaptivePage / Search — keeps useSuppliers', () => {
    const src = read('../pages/SuppliersPage.tsx');
    expect(src).toContain('AdaptivePage');
    expect(src).toContain('AdaptiveSearch');
    expect(src).toContain('useSuppliers');
    expect(src).toContain('value={searchQuery}');
  });
});
