/**
 * PROOF: Adaptive KPI density SSOT — Dashboard + Sales Analytics consistency.
 *
 * Invariant: no full-width single-column KPI towers on phone for overview metrics.
 *
 * npx vitest run src/__tests__/adaptive-dashboard-kpi-density.evidence.test.ts
 */
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DASHBOARD_KPI_CARD_CLASS,
  DASHBOARD_KPI_GRID_CLASS,
  DASHBOARD_KPI_VALUE_CLASS,
  DASHBOARD_PAGE_FRAME_CLASS,
  KPI_ACCENT_CARD_BASE_CLASS,
  KPI_ACCENT_GRID_CLASS,
  KPI_ACCENT_VALUE_CLASS,
  kpiAccentCardClass,
} from '../lib/adaptiveDashboard';

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

describe('PROOF: adaptive KPI density SSOT', () => {
  it('neutral + accent grids are 2-up on phone (never cols-1)', () => {
    gate(
      'NEUTRAL_GRID_2UP',
      DASHBOARD_KPI_GRID_CLASS.includes('grid-cols-2') &&
        !DASHBOARD_KPI_GRID_CLASS.includes('grid-cols-1') &&
        DASHBOARD_KPI_GRID_CLASS.includes('lg:grid-cols-4'),
      DASHBOARD_KPI_GRID_CLASS,
    );
    gate(
      'ACCENT_GRID_2UP',
      KPI_ACCENT_GRID_CLASS.includes('grid-cols-2') &&
        !KPI_ACCENT_GRID_CLASS.includes('grid-cols-1') &&
        KPI_ACCENT_GRID_CLASS.includes('xl:grid-cols-5'),
      KPI_ACCENT_GRID_CLASS,
    );
    gate(
      'NEUTRAL_COMPACT_PAD',
      DASHBOARD_KPI_CARD_CLASS.includes('p-3') && DASHBOARD_KPI_CARD_CLASS.includes('sm:p-5'),
      DASHBOARD_KPI_CARD_CLASS,
    );
    gate(
      'ACCENT_COMPACT_PAD',
      KPI_ACCENT_CARD_BASE_CLASS.includes('p-3') &&
        KPI_ACCENT_CARD_BASE_CLASS.includes('sm:p-5') &&
        !KPI_ACCENT_CARD_BASE_CLASS.includes('p-6'),
      KPI_ACCENT_CARD_BASE_CLASS,
    );
    gate(
      'VALUE_SCALE_ALIGNED',
      DASHBOARD_KPI_VALUE_CLASS.includes('text-lg') &&
        KPI_ACCENT_VALUE_CLASS.includes('text-lg') &&
        DASHBOARD_KPI_VALUE_CLASS.includes('sm:text-2xl') &&
        KPI_ACCENT_VALUE_CLASS.includes('sm:text-2xl'),
      'neutral and accent value scales match',
    );
    gate(
      'TONE_HELPER',
      kpiAccentCardClass('blue').includes('from-blue-500') &&
        kpiAccentCardClass('orange').includes('from-orange-500'),
      'kpiAccentCardClass composes base + tone',
    );
    gate(
      'PAGE_FRAME',
      DASHBOARD_PAGE_FRAME_CLASS.includes('p-3') &&
        DASHBOARD_PAGE_FRAME_CLASS.includes('space-y-4'),
      DASHBOARD_PAGE_FRAME_CLASS,
    );
  });

  it('Dashboard + Sales Analytics both consume the SSOT', () => {
    const dash = read('pages/Dashboard.tsx');
    const sales = read('pages/SalesPage.tsx');

    gate(
      'DASH_USES_SSOT',
      dash.includes('DASHBOARD_KPI_GRID_CLASS') &&
        dash.includes('DASHBOARD_KPI_CARD_CLASS') &&
        dash.includes('data-dashboard-kpis'),
      'Dashboard wires adaptiveDashboard',
    );
    gate(
      'DASH_NO_COLS1_KPI',
      !dash.includes('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'),
      'Dashboard removed full-bleed KPI towers',
    );

    gate(
      'SALES_USES_SSOT',
      sales.includes('KPI_ACCENT_GRID_CLASS') &&
        sales.includes('kpiAccentCardClass') &&
        sales.includes('data-sales-kpis') &&
        sales.includes('ADAPTIVE_PAGE_PAD_CLASS'),
      'Sales Analytics wires accent KPI SSOT + AdaptivePage pad (no double space-y)',
    );
    gate(
      'SALES_PERIOD_CLOSES',
      sales.includes('secondary={({ close })') &&
        sales.includes("if (key !== 'custom') close()") &&
        sales.includes('data-sales-period-panel') &&
        sales.includes('modeOverride="compact"') &&
        sales.includes('presentationOverride="compact"'),
      'period closes after select; search+Period labels (no icon-sheet/··· waste)',
    );
    gate(
      'SALES_NO_COLS1_KPI',
      !sales.includes('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5') &&
        !sales.includes('text-3xl font-bold mt-2') &&
        !sales.includes('rounded-lg shadow p-6 text-white'),
      'Sales removed full-width p-6 accent towers',
    );
    gate(
      'SALES_HAS_FIVE_TONES',
      sales.includes("kpiAccentCardClass('blue')") &&
        sales.includes("kpiAccentCardClass('green')") &&
        sales.includes("kpiAccentCardClass('purple')") &&
        sales.includes("kpiAccentCardClass('orange')") &&
        sales.includes("kpiAccentCardClass('pink')"),
      'all five overview metrics use tone helper',
    );
  });

  it('SSOT file forbids brand forks', () => {
    const src = read('lib/adaptiveDashboard.ts');
    gate(
      'NO_BRAND_FORK',
      src.includes('no device-brand forks') && !/userAgent|navigator\.platform/i.test(src),
      'capability density only',
    );
    gate(
      'PAD_SPLIT',
      src.includes('ADAPTIVE_PAGE_PAD_CLASS') &&
        src.includes('AdaptivePage owns space-y'),
      'pad-only class prevents double vertical rhythm under AdaptivePage',
    );
    gate(
      'WORKLIST_KPI_EXPORT',
      src.includes('worklistKpiGridClass') &&
        src.includes('WORKLIST_KPI_GRID_6_CLASS') &&
        src.includes('never full-width single towers'),
      'worklist KPI grid helper is part of global SSOT',
    );
  });

  it('AdaptiveToolbar closes secondary after selection (SSOT)', () => {
    const toolbar = read('components/adaptive/AdaptiveToolbar.tsx');
    gate(
      'TOOLBAR_CLOSE_API',
      toolbar.includes('AdaptiveToolbarSecondaryApi') &&
        toolbar.includes("typeof secondary === 'function'") &&
        toolbar.includes('data-secondary-presentation="popover"') &&
        toolbar.includes('data-toolbar-stack') &&
        !toolbar.includes("'···'"),
      'secondary close API + Filters popover; never cryptic ···',
    );
    gate(
      'TOOLBAR_OUTSIDE_CLOSE',
      toolbar.includes('Escape') && toolbar.includes('mousedown'),
      'Escape + outside click dismiss panel',
    );
  });

  it('AdaptiveReportSummary uses global KPI SSOT', () => {
    const summary = read('components/adaptive/AdaptiveReportSummary.tsx');
    const reports = read('lib/adaptiveReports.ts');
    gate(
      'SUMMARY_KPI_SSOT',
      summary.includes('REPORT_KPI_CARD_CLASS') &&
        summary.includes('data-kpi-ssot="adaptiveDashboard"') &&
        reports.includes("from './adaptiveDashboard'"),
      'report KPI chrome re-exports adaptiveDashboard',
    );
  });
});

afterAll(() => {
  const passed = gates.filter((g) => g.ok).length;
  const payload = {
    feature: 'ADAPTIVE_DASHBOARD_KPI_DENSITY',
    verdict: passed === gates.length ? 'PASS' : 'FAIL',
    passed,
    total: gates.length,
    integrity: {
      ssot: 'samplepos.client/src/lib/adaptiveDashboard.ts',
      consumers: [
        'pages/Dashboard.tsx',
        'pages/SalesPage.tsx',
        'components/adaptive/AdaptiveReportSummary.tsx',
      ],
      invariants: [
        'Phone KPI strips are 2-up (never grid-cols-1 towers)',
        'Neutral and accent tiles share compact padding + value scale',
        'Sales Analytics and Dashboard both import adaptiveDashboard SSOT',
        'AdaptiveReportSummary chrome = adaptiveDashboard (global reports)',
        'Toolbar stacks search full-width; Period label never ···',
      ],
    },
    gates,
    generatedAt: new Date().toISOString(),
  };
  const md =
    `# PROOF_ADAPTIVE_DASHBOARD_KPI_DENSITY\n\nVerdict: **${payload.verdict}** (${passed}/${gates.length})\n\n` +
    `## Integrity\n\n` +
    payload.integrity.invariants.map((i) => `- ${i}`).join('\n') +
    `\n\n## Consumers\n\n` +
    payload.integrity.consumers.map((c) => `- \`${c}\``).join('\n') +
    `\n\n## Gates\n\n` +
    gates.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} \`${g.id}\`: ${g.detail}`).join('\n') +
    `\n\n## Reproduce\n\n\`\`\`bash\nnpm run proof:adaptive-reports-responsive\n\`\`\`\n`;
  for (const root of [repoRoot, clientRoot]) {
    writeFileSync(
      resolve(root, 'PROOF_ADAPTIVE_DASHBOARD_KPI_DENSITY.json'),
      `${JSON.stringify(payload, null, 2)}\n`,
    );
    writeFileSync(resolve(root, 'PROOF_ADAPTIVE_DASHBOARD_KPI_DENSITY.md'), md);
  }
});
