/**
 * PROOF: Inventory Receiving adaptive density — no triple-hero stack on phone.
 *
 * Invariants (enterprise Fiori / Dynamics worklist pattern):
 *   - Inventory hub + Receiving workbench densify on small screens
 *   - Embedded Goods Receipts hides AdaptivePage title (workbench owns the name)
 *   - Date / status / billing filters live in AdaptiveToolbar secondary with close()
 *   - No always-on date filter card (data-gr-date-filters)
 *   - Pad-only className on AdaptivePage (no double space-y)
 *
 * npx vitest run src/__tests__/adaptive-inventory-receiving-density.evidence.test.ts
 */
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(here, '../..');
const repoRoot = resolve(clientRoot, '..');

type Gate = { id: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string): void {
  gates.push({ id, ok, detail });
  expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
}

function read(rel: string): string {
  return readFileSync(resolve(clientRoot, 'src', rel), 'utf8');
}

describe('PROOF: inventory receiving adaptive density', () => {
  it('AdaptivePage supports hideTitle + column dense header (no side-by-side dead space)', () => {
    const src = read('components/adaptive/AdaptivePage.tsx');
    gate(
      'HIDE_TITLE_PROP',
      src.includes('hideTitle') && src.includes('data-page-hide-title'),
      'AdaptivePage exposes hideTitle for embedded workbenches',
    );
    gate(
      'DENSE_HEADER_COLUMN',
      src.includes("density === 'dense'") &&
        src.includes("'flex flex-col gap-2'") &&
        !src.includes("'flex flex-row items-center justify-between gap-2'"),
      'dense header stacks title then actions (no empty column beside tall CTAs)',
    );
  });

  it('Inventory hub chrome densifies on phone', () => {
    const src = read('components/InventoryLayout.tsx');
    gate(
      'HUB_COMPACT_PAD',
      src.includes('data-inventory-hub-chrome') &&
        src.includes('px-3 py-2.5 sm:px-6 sm:py-4'),
      'Inventory hub uses tighter phone padding',
    );
    gate(
      'HUB_SUBTITLE_SM_ONLY',
      src.includes('hidden sm:block text-sm text-gray-600') &&
        src.includes('Products, stock, receipts, and warehouse network'),
      'hub subtitle hidden on phone',
    );
  });

  it('Receiving workbench densifies; title row uses tabs (no blank band)', () => {
    const src = read('pages/inventory/ReceivingWorkbench.tsx');
    gate(
      'WB_CHROME',
      src.includes('data-receiving-workbench-chrome') &&
        src.includes('pt-2.5 sm:pt-3') &&
        src.includes('text-xl sm:text-2xl'),
      'Receiving header compact on phone',
    );
    gate(
      'WB_TITLE_TABS_ROW',
      src.includes('data-receiving-workbench-title-row') &&
        src.includes('data-receiving-workbench-tabs') &&
        src.includes('sm:flex-row sm:items-end sm:justify-between') &&
        src.includes('Receive, bill, and clear returns from one desk.'),
      'Receipts/Returns tabs sit beside Receiving title — no empty header band',
    );
  });

  it('GoodsReceiptsPage embeds without third hero; filters in toolbar with close()', () => {
    const src = read('pages/inventory/GoodsReceiptsPage.tsx');
    gate(
      'EMBED_HIDE_TITLE',
      src.includes('hideTitle={embedded}') && src.includes('ADAPTIVE_PAGE_PAD_CLASS'),
      'embedded GR hides AdaptivePage title + uses pad-only SSOT',
    );
    gate(
      'NO_ALWAYS_ON_DATE_CARD',
      !src.includes('data-gr-date-filters'),
      'no permanent on-canvas date filter card',
    );
    gate(
      'FILTERS_CLOSE_API',
      src.includes('data-gr-filter-panel') &&
        src.includes('secondary={({ close })') &&
        src.includes('modeOverride="compact"') &&
        src.includes('presentationOverride="compact"') &&
        src.includes('data-gr-filters-done') &&
        src.includes('ADAPTIVE_WORKLIST_DENSITY') &&
        src.includes('actionsBeforeLeading'),
      'date/status/billing in AdaptiveToolbar secondary with close()/Done; dense create-first',
    );
    gate(
      'BILLING_FACETS_ON_FILTERS_ROW',
      src.includes('facets={') &&
        src.includes('AdaptiveFacetChips') &&
        !src.includes('grid-cols-2 sm:grid-cols-4') &&
        src.includes("label: 'All billing'"),
      'billing chips live on AdaptiveToolbar facets row beside Filters (no 2×2 tower)',
    );
    gate(
      'CARD_ACTIONS_INLINE',
      src.includes('data-gr-card-open') &&
        src.includes("appearance: 'link'") &&
        src.includes("renderGrActions(gr, 'stack')"),
      'GR card taps to open detail — Finalize only as text link when needed',
    );
    gate(
      'DETAIL_META_DENSE',
      src.includes('data-gr-detail-meta') &&
        src.includes('AdaptiveMetaGrid') &&
        src.includes('AdaptiveMetaItem'),
      'GR detail meta uses AdaptiveMetaGrid (label|value same line on phone)',
    );
    gate(
      'COST_BASELINE_MORE',
      src.includes('data-gr-cost-baseline') &&
        src.includes('more={') &&
        src.includes('data-gr-create-from-po') &&
        !src.includes('flex-col gap-2 w-full min-w-[12rem]'),
      'cost baseline under AdaptiveToolbar More; Create CTAs on Filters row',
    );
    gate(
      'PRIMARY_CTAS_COMPACT',
      src.includes('ManualGRButton') &&
        src.includes('data-gr-create-from-po') &&
        src.includes('+ From PO'),
      'primary actions densified: Manual GR + From PO (same toolbar row as facets)',
    );
  });

  it('AdaptiveToolbar + FacetChips SSOT for lane filters beside Filters', () => {
    const toolbar = read('components/adaptive/AdaptiveToolbar.tsx');
    const chips = read('components/adaptive/AdaptiveFacetChips.tsx');
    gate(
      'TOOLBAR_FACETS_SLOT',
      toolbar.includes('facets?: ReactNode') &&
        toolbar.includes('data-adaptive-toolbar-facets') &&
        toolbar.includes('data-toolbar-has-facets') &&
        toolbar.includes('{actions}') &&
        toolbar.includes('{facetsSlot}') &&
        toolbar.includes('{search}') &&
        !toolbar.includes('{facetsRow}'),
      'create-first: facets share primary row with CTAs/Search — never a second tower',
    );
    gate(
      'FACET_CHIPS_HORIZONTAL',
      chips.includes('data-adaptive-facet-chips') &&
        chips.includes('overflow-x-auto') &&
        chips.includes('w-max') &&
        !chips.includes('flex-1'),
      'AdaptiveFacetChips is content-sized horizontal scroll — never steals Search flex',
    );
  });

  it('SupplierReturnsPage inherits Adaptive receiving SSOT', () => {
    const src = read('pages/inventory/SupplierReturnsPage.tsx');
    gate(
      'RETURNS_EMBED_HIDE_TITLE',
      src.includes('hideTitle={embedded}') && src.includes('AdaptivePage'),
      'Returns embed uses hideTitle like Goods Receipts',
    );
    gate(
      'RETURNS_TOOLBAR_FACETS',
      src.includes('AdaptiveToolbar') &&
        src.includes('AdaptiveFacetChips') &&
        src.includes('AdaptiveSearch') &&
        src.includes('more={'),
      'Returns uses AdaptiveToolbar + facets + More',
    );
  });
});

afterAll(() => {
  const passed = gates.filter((g) => g.ok).length;
  const failed = gates.filter((g) => !g.ok);
  const payload = {
    proof: 'ADAPTIVE_INVENTORY_RECEIVING_DENSITY',
    verdict: failed.length === 0 ? 'PASS' : 'FAIL',
    generatedAt: new Date().toISOString(),
    passed,
    total: gates.length,
    gates,
    integrity:
      'Inventory Receiving phone density: densified hub + workbench, embedded hideTitle, AdaptiveToolbar Filters+billing facets, inline card actions, AdaptiveMetaGrid detail, AdaptivePage pad-only SSOT.',
  };
  const json = JSON.stringify(payload, null, 2);
  const md = `# PROOF — Adaptive inventory receiving density

**Verdict:** ${payload.verdict}
**Generated:** ${payload.generatedAt}
**Gates:** ${passed}/${gates.length}

${gates.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} \`${g.id}\` — ${g.detail}`).join('\n')}

## Integrity
${payload.integrity}
`;
  for (const dir of [clientRoot, repoRoot]) {
    writeFileSync(resolve(dir, 'PROOF_ADAPTIVE_INVENTORY_RECEIVING_DENSITY.json'), json);
    writeFileSync(resolve(dir, 'PROOF_ADAPTIVE_INVENTORY_RECEIVING_DENSITY.md'), md);
  }
});
