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
    expect(src).toContain('modeOverride="compact"');
    expect(src).toContain('secondary={({ close })');
    expect(src).toContain('more={');
  });

  it('GoodsReceiptsPage uses AdaptivePage / Toolbar / Search — keeps GR hooks', () => {
    const src = read('../pages/inventory/GoodsReceiptsPage.tsx');
    expect(src).toContain('AdaptivePage');
    expect(src).toContain('AdaptiveToolbar');
    expect(src).toContain('AdaptiveSearch');
    expect(src).toContain('useGoodsReceipts');
    expect(src).toContain('data-gr-filters');
    expect(src).toContain('hideTitle={embedded}');
    expect(src).toContain('data-gr-filter-panel');
    expect(src).not.toContain('data-gr-date-filters');
    expect(src).not.toMatch(/\/api\/mobile/);
  });

  it('PurchaseOrdersPage uses AdaptivePage + toolbar Create/More — keeps PO hooks', () => {
    const src = read('../pages/inventory/PurchaseOrdersPage.tsx');
    expect(src).toContain('AdaptivePage');
    expect(src).toContain('AdaptiveKpiStrip');
    expect(src).toContain('usePurchaseOrders');
    expect(src).toContain('data-po-primary-cta');
    expect(src).toContain('more={');
    expect(src).toContain('ADAPTIVE_TOOLBAR_CARD_CLASS');
    expect(src).not.toContain('grid grid-cols-1 md:grid-cols-6');
  });

  it('SuppliersPage uses AdaptivePage / Search — keeps useSuppliers', () => {
    const src = read('../pages/SuppliersPage.tsx');
    expect(src).toContain('AdaptivePage');
    expect(src).toContain('AdaptiveSearch');
    expect(src).toContain('useSuppliers');
    expect(src).toContain('value={searchQuery}');
  });
});

describe('Receiving workbench + inventory hub density', () => {
  it('ReceivingWorkbench densifies chrome; tabs fill title row', () => {
    const src = read('../pages/inventory/ReceivingWorkbench.tsx');
    expect(src).toContain('data-receiving-workbench-chrome');
    expect(src).toContain('data-receiving-workbench-title-row');
    expect(src).toContain('data-receiving-workbench-tabs');
    expect(src).toContain('pt-2.5 sm:pt-3');
  });

  it('InventoryLayout densifies hub header on phone', () => {
    const src = read('../components/InventoryLayout.tsx');
    expect(src).toContain('data-inventory-hub-chrome');
    expect(src).toContain('px-3 py-2.5 sm:px-6 sm:py-4');
    expect(src).toContain('hidden sm:block text-sm text-gray-600');
  });

  it('InventoryAdjustmentsPage inherits AdaptivePage + DataGrid SSOT (no CTA tower)', () => {
    const src = read('../pages/inventory/InventoryAdjustmentsPage.tsx');
    expect(src).toContain('AdaptivePage');
    expect(src).toContain('AdaptiveDataGrid');
    expect(src).toContain('AdaptiveSearch');
    expect(src).toContain('AdaptiveKpiStrip');
    expect(src).toContain('data-adj-primary-cta');
    expect(src).toContain('more={');
    expect(src).not.toContain('flex w-full flex-col gap-2');
  });

  it('StockMovementsPage uses AdaptivePage + KpiStrip + toolbar Adjustments/Filters/More', () => {
    const src = read('../pages/inventory/StockMovementsPage.tsx');
    expect(src).toContain('AdaptivePage');
    expect(src).toContain('AdaptiveKpiStrip');
    expect(src).toContain('ADAPTIVE_PAGE_PAD_CLASS');
    expect(src).toContain('data-movements-filter-panel');
    expect(src).toContain('ADAPTIVE_WORKLIST_DENSITY');
    expect(src).toContain('data-movements-result-count');
    expect(src).toContain('data-movements-primary-cta');
    expect(src).toContain('more={');
    expect(src).toContain('actionsBeforeLeading');
    expect(src).not.toContain('flex-col gap-2 w-full min-w');
    expect(src).not.toContain('flex justify-between items-center mb-6');
    expect(src).not.toContain('grid grid-cols-1 md:grid-cols-4');
  });

  it('AdaptivePage + AdaptiveToolbar share AdaptiveMoreMenu SSOT', () => {
    const page = read('../components/adaptive/AdaptivePage.tsx');
    const toolbar = read('../components/adaptive/AdaptiveToolbar.tsx');
    const more = read('../components/adaptive/AdaptiveMoreMenu.tsx');
    expect(more).toContain('data-adaptive-more-menu');
    expect(more).toContain('data-adaptive-more-trigger');
    expect(more).toContain('Escape');
    expect(page).toContain('AdaptiveMoreMenu');
    expect(toolbar).toContain('AdaptiveMoreMenu');
    expect(toolbar).toContain('data-adaptive-toolbar-more');
    expect(page).toContain('data-adaptive-page-secondary');
  });

  it('BatchManagementPage uses AdaptivePage + KpiStrip', () => {
    const src = read('../pages/inventory/BatchManagementPage.tsx');
    expect(src).toContain('AdaptivePage');
    expect(src).toContain('AdaptiveKpiStrip');
    expect(src).toContain('ADAPTIVE_PAGE_PAD_CLASS');
    expect(src).not.toContain('grid grid-cols-1 md:grid-cols-5');
  });

  it('GoodsReceipts detail chrome stacks on phone (no Export/status side-by-side noise)', () => {
    const src = read('../pages/inventory/GoodsReceiptsPage.tsx');
    expect(src).toContain('data-gr-detail-chrome');
    expect(src).toContain('data-gr-gl-preview');
    expect(src).toContain('grid-cols-1 min-[480px]:grid-cols-2');
    expect(src).not.toMatch(
      /Export PDF[\s\S]{0,400}flex justify-between items-center/,
    );
  });

  it('AdaptiveDataGrid measures content pane (fills spare width)', () => {
    const grid = read('../components/adaptive/AdaptiveDataGrid.tsx');
    const policy = read('../lib/adaptiveDataGrid.ts');
    expect(grid).toContain('ResizeObserver');
    expect(grid).toContain('data-grid-content-width');
    expect(grid).toContain('contentWidthPx');
    expect(policy).toContain('contentWidthPx');
    expect(policy).toContain('GRID_CARD_MULTI_COL_MIN_PX');
  });
});
