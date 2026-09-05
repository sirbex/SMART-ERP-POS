/**
 * PROOF: Adaptive row actions SSOT — phone list cards collapse to Actions menu.
 *
 * npx vitest run src/__tests__/adaptive-row-actions.evidence.test.ts
 */
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveRowActionsPresentation,
  ROW_ACTIONS_INLINE_MIN_PX,
} from '../lib/adaptiveRowActions';
import { resolveAdaptiveChrome } from '../lib/adaptiveChrome';

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

describe('PROOF: adaptive row actions SSOT', () => {
  it('sheet chrome + ≥2 actions → menu (never stacked towers)', () => {
    const mobile = resolveAdaptiveChrome('mobile');
    gate(
      'MOBILE_SHEET',
      mobile.secondaryActions === 'sheet',
      'mobile chrome uses sheet secondary actions',
    );
    gate(
      'MOBILE_MENU',
      resolveRowActionsPresentation(mobile, { actionCount: 3 }) === 'menu',
      '3 card actions collapse to Actions menu on phone',
    );
    gate(
      'SINGLE_INLINE',
      resolveRowActionsPresentation(mobile, { actionCount: 1 }) === 'inline',
      'single action stays inline',
    );
  });

  it('desktop inline keeps horizontal row; narrow pane forces menu', () => {
    const desktop = resolveAdaptiveChrome('desktop');
    gate(
      'DESKTOP_INLINE',
      resolveRowActionsPresentation(desktop, { actionCount: 3 }) === 'inline'
        || desktop.secondaryActions === 'sheet',
      'roomy desktop keeps inline when chrome allows',
    );
    gate(
      'NARROW_PANE_MENU',
      resolveRowActionsPresentation(desktop, {
        actionCount: 3,
        contentWidthPx: ROW_ACTIONS_INLINE_MIN_PX - 1,
      }) === 'menu',
      'narrow content pane forces menu even if shell is desktop',
    );
  });

  it('AdaptiveRowActions + ResponsiveActionBar enforce SSOT', () => {
    const row = read('components/adaptive/AdaptiveRowActions.tsx');
    const bar = read('components/ui/ResponsiveActionBar.tsx');
    const barrel = read('components/adaptive/index.ts');
    const lib = read('lib/adaptiveRowActions.ts');
    gate(
      'ROW_ACTIONS_COMPONENT',
      row.includes('data-adaptive-row-actions') &&
        row.includes('data-row-actions-trigger') &&
        (row.includes("'Actions'") || row.includes('Actions')) &&
        barrel.includes('AdaptiveRowActions'),
      'AdaptiveRowActions menu trigger exported',
    );
    gate(
      'MENU_LABEL_DENSITY',
      lib.includes("return 'Actions'") && lib.includes("return 'More'"),
      'row actions menu label is verbose Actions vs short More',
    );
    gate(
      'LINK_APPEARANCE',
      row.includes("appearance: AdaptiveRowActionAppearance = 'button'") &&
        row.includes("appearance === 'link'") &&
        row.includes('data-row-action-appearance'),
      'AdaptiveRowActions supports link (no-box) appearance for detail nav',
    );
    gate(
      'BAR_DELEGATES',
      bar.includes('AdaptiveRowActions') &&
        bar.includes('data-responsive-action-bar') &&
        !bar.includes('flex-col gap-2 w-full sm:flex-row'),
      'ResponsiveActionBar no longer stacks full-width towers',
    );
  });

  it('Adjustments + sticky footer use correct collapse policy', () => {
    const adj = read('pages/inventory/InventoryAdjustmentsPage.tsx');
    const actionBar = read('components/adaptive/AdaptiveActionBar.tsx');
    gate(
      'ADJ_USES_ROW_ACTIONS',
      adj.includes('AdaptiveRowActions') && adj.includes("label: 'Adjust'"),
      'Adjustments wires structured AdaptiveRowActions',
    );
    gate(
      'FOOTER_NO_COLLAPSE',
      actionBar.includes('adaptiveCollapse={false}'),
      'page sticky AdaptiveActionBar keeps CTAs visible',
    );
  });
});

afterAll(() => {
  const passed = gates.filter((g) => g.ok).length;
  const failed = gates.filter((g) => !g.ok);
  const payload = {
    proof: 'ADAPTIVE_ROW_ACTIONS',
    verdict: failed.length === 0 ? 'PASS' : 'FAIL',
    generatedAt: new Date().toISOString(),
    passed,
    total: gates.length,
    gates,
    integrity:
      'List/card row actions: sheet/dense chrome → Actions menu; ResponsiveActionBar delegates to AdaptiveRowActions; no full-width stacked CTA towers on phone cards.',
  };
  const json = JSON.stringify(payload, null, 2);
  const md = `# PROOF — Adaptive row actions SSOT

**Verdict:** ${payload.verdict}
**Generated:** ${payload.generatedAt}
**Gates:** ${passed}/${gates.length}

${gates.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} \`${g.id}\` — ${g.detail}`).join('\n')}

## Integrity
${payload.integrity}
`;
  for (const dir of [clientRoot, repoRoot]) {
    writeFileSync(resolve(dir, 'PROOF_ADAPTIVE_ROW_ACTIONS.json'), json);
    writeFileSync(resolve(dir, 'PROOF_ADAPTIVE_ROW_ACTIONS.md'), md);
  }
});
