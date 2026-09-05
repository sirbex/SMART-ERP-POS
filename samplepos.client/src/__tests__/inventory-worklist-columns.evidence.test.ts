/**
 * PROOF: Inventory worklist column visibility (user-chosen columns).
 * Invariant: Columns control lives ONLY inside AdaptiveToolbar `more` (presentation=menu).
 * npm test / vitest: src/__tests__/inventory-worklist-columns.evidence.test.ts
 */
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  catalogForWorklist,
  defaultsForWorklist,
  resolveVisibleColumnIds,
  isColumnVisible,
  inventoryColumnStorageKey,
  INVENTORY_WORKLIST_COLUMNS,
  type InventoryWorklistId,
} from '@shared/inventory/inventoryWorklistColumnsSsot';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = path.resolve(clientRoot, '..');

type Gate = { id: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string): void {
  gates.push({ id, ok, detail });
  if (!ok) expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
}

function readClient(rel: string): string {
  return readFileSync(path.join(clientRoot, 'src', rel), 'utf8');
}

const WORKLISTS: InventoryWorklistId[] = [
  'products',
  'adjustments',
  'stock-levels',
  'stock-movements',
  'goods-receipts',
  'purchase-orders',
  'supplier-returns',
  'batch-management',
];

const WORKLIST_PAGES: Array<{
  id: string;
  worklist: InventoryWorklistId;
  file: string;
}> = [
  { id: 'PRODUCTS', worklist: 'products', file: 'pages/inventory/ProductsPage.tsx' },
  { id: 'ADJUSTMENTS', worklist: 'adjustments', file: 'pages/inventory/InventoryAdjustmentsPage.tsx' },
  { id: 'STOCK_LEVELS', worklist: 'stock-levels', file: 'pages/inventory/StockLevelsPage.tsx' },
  { id: 'STOCK_MOVEMENTS', worklist: 'stock-movements', file: 'pages/inventory/StockMovementsPage.tsx' },
  { id: 'GOODS_RECEIPTS', worklist: 'goods-receipts', file: 'pages/inventory/GoodsReceiptsPage.tsx' },
  { id: 'PURCHASE_ORDERS', worklist: 'purchase-orders', file: 'pages/inventory/PurchaseOrdersPage.tsx' },
  { id: 'SUPPLIER_RETURNS', worklist: 'supplier-returns', file: 'pages/inventory/SupplierReturnsPage.tsx' },
  { id: 'BATCH_MGMT', worklist: 'batch-management', file: 'pages/inventory/BatchManagementPage.tsx' },
];

/** Extract every `more={...}` prop body (brace-balanced). */
function extractMoreBlocks(src: string): string[] {
  const blocks: string[] = [];
  let from = 0;
  while (from < src.length) {
    const start = src.indexOf('more={', from);
    if (start < 0) break;
    let depth = 1;
    let inStr: string | null = null;
    let i = start + 'more={'.length;
    for (; i < src.length; i++) {
      const ch = src[i];
      const prev = i > 0 ? src[i - 1] : '';
      if (inStr) {
        if (ch === inStr && prev !== '\\') inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inStr = ch;
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          blocks.push(src.slice(start, i + 1));
          from = i + 1;
          break;
        }
      }
    }
    if (depth !== 0) break;
  }
  return blocks;
}

function countPickerTags(src: string): number {
  return (src.match(/<InventoryColumnPicker\b/g) || []).length;
}

/**
 * Deploy integrity: React hooks must never run after isLoading/error early returns
 * and before the page's main return. Nested components later in the file are ignored.
 * This is the exact class of bug that crashed PurchaseOrdersPage in production.
 */
function hasHookAfterEarlyReturn(src: string): boolean {
  const exportDefault = src.lastIndexOf('export default function');
  if (exportDefault < 0) return false;
  const body = src.slice(exportDefault);
  const loadMatch = body.match(/if\s*\(\s*isLoading\s*\)\s*\{[\s\S]*?\n\s*\}/);
  if (!loadMatch || loadMatch.index == null) return false;
  let rest = body.slice(loadMatch.index + loadMatch[0].length);
  for (;;) {
    const next = rest.match(/^\s*if\s*\([^)]+\)\s*\{[\s\S]*?\n\s*\}/);
    if (!next || !/\breturn\b/.test(next[0])) break;
    rest = rest.slice(next[0].length);
  }
  // Only the gap before this component's main JSX return (not nested helpers below).
  const mainReturn = rest.search(/\n  return\s*\(/);
  if (mainReturn < 0) return false;
  const between = rest.slice(0, mainReturn);
  return /\buse(Memo|Callback|Effect|State|Ref|LayoutEffect|ImperativeHandle)\s*\(/.test(between);
}

/** Every InventoryColumnPicker must sit inside a more={...} with presentation="menu". */
function assertColumnsOnlyInMore(src: string): { ok: boolean; detail: string } {
  const total = countPickerTags(src);
  if (total === 0) return { ok: false, detail: 'no InventoryColumnPicker' };
  if (src.includes('data-inventory-column-picker-presentation="button"')) {
    return { ok: false, detail: 'standalone button presentation marker present' };
  }
  const mores = extractMoreBlocks(src);
  if (mores.length === 0) return { ok: false, detail: 'no AdaptiveToolbar more={...}' };
  let inMore = 0;
  for (const block of mores) {
    const n = countPickerTags(block);
    inMore += n;
    if (n > 0 && !block.includes('presentation="menu"')) {
      return { ok: false, detail: 'picker in more without presentation="menu"' };
    }
  }
  if (inMore !== total) {
    return {
      ok: false,
      detail: `picker outside more (${inMore} in more / ${total} total)`,
    };
  }
  // Each picker opening tag's nearby props must be menu, never button.
  let idx = 0;
  while (true) {
    const i = src.indexOf('<InventoryColumnPicker', idx);
    if (i < 0) break;
    const slice = src.slice(i, i + 600);
    if (!/\bpresentation="menu"/.test(slice)) {
      return { ok: false, detail: 'InventoryColumnPicker missing presentation="menu"' };
    }
    if (/\bpresentation="button"/.test(slice)) {
      return { ok: false, detail: 'InventoryColumnPicker uses presentation="button"' };
    }
    idx = i + 1;
  }
  return { ok: true, detail: `${total} picker(s) only inside more (menu)` };
}

describe('PROOF: inventory worklist column prefs', () => {
  it('SSOT catalogs + resolve never empty / required stick', () => {
    for (const id of WORKLISTS) {
      const catalog = catalogForWorklist(id);
      gate(`CATALOG_${id}`, catalog.length >= 3, `${id} has column catalog`);
      const defaults = defaultsForWorklist(id);
      gate(`DEFAULTS_${id}`, defaults.length >= 2, `${id} defaults non-empty`);
      const healed = resolveVisibleColumnIds(id, []);
      gate(`EMPTY_HEAL_${id}`, healed.length === defaults.length, `${id} empty → defaults`);
      const required = catalog.filter((c) => c.required).map((c) => c.id);
      const stripped = resolveVisibleColumnIds(
        id,
        defaults.filter((d) => !required.includes(d)),
      );
      gate(
        `REQUIRED_${id}`,
        required.every((r) => stripped.includes(r)),
        `${id} required columns cannot be removed`,
      );
      gate(
        `STORAGE_KEY_${id}`,
        inventoryColumnStorageKey(id) === `inventory.worklist.columns.v2.${id}`,
        `${id} stable v2 storage key`,
      );
    }
    gate(
      'SSOT_KEYS',
      Object.keys(INVENTORY_WORKLIST_COLUMNS).length === WORKLISTS.length,
      'all worklist ids registered',
    );
  });

  it('resolve heals junk / preserves order / store filter', () => {
    const junk = resolveVisibleColumnIds('products', ['sku', 'nope', 'status', 'sku']);
    gate(
      'RESOLVE_DROP_UNKNOWN',
      junk.includes('sku') && junk.includes('status') && !junk.includes('nope'),
      'unknown column ids dropped',
    );
    gate(
      'RESOLVE_DEDUP',
      junk.filter((id) => id === 'sku').length === 1,
      'duplicate selected ids collapsed',
    );
    gate(
      'RESOLVE_CATALOG_ORDER',
      junk.indexOf('sku') < junk.indexOf('status') && junk.includes('product') && junk.includes('actions'),
      'catalog order + required (product/actions) forced in',
    );
    const noStore = catalogForWorklist('products', { includeStore: false });
    const withStore = catalogForWorklist('products', { includeStore: true });
    gate(
      'STORE_FILTER',
      !noStore.some((c) => c.id === 'store') && withStore.some((c) => c.id === 'store'),
      'includeStore:false omits Store from catalog',
    );
    const vis = resolveVisibleColumnIds('products', ['product', 'sku', 'actions']);
    gate(
      'IS_VISIBLE_HELPER',
      isColumnVisible(vis, 'sku') && !isColumnVisible(vis, 'margin'),
      'isColumnVisible matches resolved set',
    );
  });

  it('picker menu SSOT: stopPropagation + no inventory standalone button', () => {
    const picker = readClient('components/inventory/InventoryColumnPicker.tsx');
    const hook = readClient('hooks/useInventoryColumnPrefs.ts');
    gate(
      'PICKER_UI',
      picker.includes('data-inventory-column-picker') &&
        (picker.includes('Choose columns to show') || picker.includes('Columns (')),
      'InventoryColumnPicker column checklist UI',
    );
    gate(
      'PICKER_MENU_PRESENTATION',
      picker.includes("presentation === 'menu'") &&
        picker.includes('data-inventory-column-picker-presentation="menu"'),
      'InventoryColumnPicker supports presentation=menu for AdaptiveToolbar More',
    );
    gate(
      'PICKER_MENU_STOP_PROPAGATION',
      picker.includes("presentation === 'menu'") &&
        picker.includes('e.stopPropagation()') &&
        picker.includes('onMouseDown={(e) => e.stopPropagation()}'),
      'menu Columns ticks do not close More (stopPropagation)',
    );
    gate(
      'HOOK_PERSIST',
      hook.includes('inventoryColumnStorageKey') && hook.includes('persistLocalStorage'),
      'prefs persist per worklist in localStorage',
    );
    gate(
      'HOOK_REQUIRED_NO_TOGGLE',
      hook.includes('if (def?.required) return'),
      'hook refuses toggling required columns off',
    );
    gate(
      'TABLE_FILL_SSOT',
      (() => {
        const dash = readClient('lib/adaptiveDashboard.ts');
        const tableClass =
          dash.includes("INVENTORY_WORKLIST_TABLE_CLASS =\n  'w-full min-w-0 divide-y divide-gray-200'") ||
          (dash.includes('INVENTORY_WORKLIST_TABLE_CLASS') && !dash.includes('table-fixed divide-y'));
        const fitOk =
          dash.includes("INVENTORY_COL_FIT_CLASS = 'whitespace-nowrap'") ||
          (dash.includes('INVENTORY_COL_FIT_CLASS') && !dash.includes("INVENTORY_COL_FIT_CLASS = 'w-[1%]"));
        return tableClass && fitOk;
      })(),
      'worklist tables use natural auto layout (no table-fixed+1% collapse bug)',
    );
    gate(
      'GRID_TABLE_FILL',
      readClient('components/adaptive/AdaptiveDataGrid.tsx').includes('data-inventory-worklist-table') &&
        !readClient('components/adaptive/AdaptiveDataGrid.tsx').includes('table-fixed'),
      'AdaptiveDataGrid uses natural column sizing (no table-fixed collapse)',
    );
  });

  it('ALL 8 inventory worklists: Columns ONLY inside More (menu)', () => {
    for (const p of WORKLIST_PAGES) {
      const src = readClient(p.file);
      const usesFillLayout =
        src.includes('INVENTORY_WORKLIST_TABLE_CLASS') ||
        // Adjustments uses AdaptiveDataGrid (SSOT table class inside the grid).
        (src.includes('AdaptiveDataGrid') && src.includes('showCol'));
      gate(
        `${p.id}_WIRED`,
        src.includes('InventoryColumnPicker') &&
          src.includes(`useInventoryColumnPrefs('${p.worklist}'`) &&
          usesFillLayout,
        `${p.file} hooks prefs + fill layout for ${p.worklist}`,
      );
      const placement = assertColumnsOnlyInMore(src);
      gate(`${p.id}_COLUMNS_IN_MORE`, placement.ok, `${p.file}: ${placement.detail}`);
    }

    const products = readClient('pages/inventory/ProductsPage.tsx');
    gate(
      'PRODUCTS_EXPIRY',
      products.includes("showCol('expiry')") && products.includes('nearestExpiryByProductId'),
      'Products Columns includes Expiry (nearest batch date)',
    );
    const adj = readClient('pages/inventory/InventoryAdjustmentsPage.tsx');
    gate(
      'ADJUSTMENTS_FILTER',
      adj.includes('all.filter((c) => showCol(c.id))'),
      'Adjustments filters AdaptiveDataGrid columns by prefs',
    );
    // Permanent: every worklist — zero hooks after isLoading early returns.
    for (const p of WORKLIST_PAGES) {
      const src = readClient(p.file);
      gate(
        `${p.id}_NO_HOOK_AFTER_EARLY_RETURN`,
        !hasHookAfterEarlyReturn(src),
        `${p.file}: no useMemo/useState/etc after isLoading early return`,
      );
    }

    // Global: no inventory page ships a standalone Columns button beside primary CTAs.
    let anyStandalone = false;
    for (const p of WORKLIST_PAGES) {
      const src = readClient(p.file);
      if (src.includes('data-inventory-column-picker-presentation="button"')) anyStandalone = true;
      if (/<InventoryColumnPicker\b[^>]*presentation="button"/.test(src)) anyStandalone = true;
    }
    gate(
      'NO_STANDALONE_COLUMNS_BUTTON',
      !anyStandalone,
      'zero inventory worklists use Columns as a primary toolbar button',
    );
    gate(
      'WORKLIST_PAGE_COUNT',
      WORKLIST_PAGES.length === WORKLISTS.length,
      'proof covers every registered worklist page',
    );
  });
});

afterAll(() => {
  const passed = gates.filter((g) => g.ok).length;
  const payload = {
    proof: 'INVENTORY_WORKLIST_COLUMNS',
    verdict: passed === gates.length ? 'PASS' : 'FAIL',
    passed,
    total: gates.length,
    invariant:
      'Columns control is ONLY inside AdaptiveToolbar more={...} with presentation="menu" on all 8 inventory worklists; prefs SSOT heals empty/required; no table-fixed collapse; no React hooks after isLoading early returns.',
    gates,
  };
  const json = JSON.stringify(payload, null, 2);
  const md = [
    '# PROOF_INVENTORY_WORKLIST_COLUMNS',
    '',
    `Verdict: **${payload.verdict}** (${passed}/${gates.length})`,
    '',
    payload.invariant,
    '',
    'Users choose which inventory table columns to show (SKU, Status, Expiry, …). Prefs persist per worklist. Columns lives under **More**, never as a standalone toolbar button.',
    '',
    ...gates.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} \`${g.id}\`: ${g.detail}`),
    '',
  ].join('\n');
  writeFileSync(path.join(repoRoot, 'PROOF_INVENTORY_WORKLIST_COLUMNS.json'), json);
  writeFileSync(path.join(repoRoot, 'PROOF_INVENTORY_WORKLIST_COLUMNS.md'), md);
  writeFileSync(path.join(clientRoot, 'PROOF_INVENTORY_WORKLIST_COLUMNS.json'), json);
  writeFileSync(path.join(clientRoot, 'PROOF_INVENTORY_WORKLIST_COLUMNS.md'), md);
});
