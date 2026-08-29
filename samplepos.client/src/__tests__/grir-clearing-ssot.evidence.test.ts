/**
 * PROOF: GR/IR Clearing — client SSOT + wiring.
 *
 * npx vitest run src/__tests__/grir-clearing-ssot.evidence.test.ts
 */
import { describe, expect, it, afterAll } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  canShowManualClearAction,
  F13_DEFAULT_TOLERANCE_PERCENT,
  grirClearingStatusLabel,
  GRIR_CLEARING_ROUTE,
  GRIR_CLEARING_STATUS_LABELS,
  GRIR_HELP,
  GRIR_PAGE_SUBTITLE,
  GRIR_RESIDUAL_CLEAR_METHOD_OPTIONS,
  normalizeOpenStatusFilter,
  OPEN_STATUS_FILTER_OPTIONS,
  parseF13TolerancePercent,
  resolveGrirClearingStatus,
  resolveResidualClearMethod,
  isResidualClearMethodAllowed,
  residualClearMethodBlockedReason,
  unwrapGrirAutoMatchPayload,
  unwrapGrirOpenPayload,
} from '../../../shared/domain/grirClearingSsot';

const repoRoot = path.resolve(__dirname, '../../..');

type Gate = { id: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string): void {
  gates.push({ id, ok, detail });
  expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
}

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('GR/IR Clearing domain SSOT (client)', () => {
  it('status + filter + F.13 defaults', () => {
    gate(
      'STATUS_RESOLVE',
      resolveGrirClearingStatus({ invoiceId: null }) === 'UNMATCHED' &&
        resolveGrirClearingStatus({ invoiceId: 'i', grAmount: 100, invoiceAmount: 100 }) === 'MATCHED' &&
        resolveGrirClearingStatus({ invoiceId: 'i', grAmount: 100, invoiceAmount: 90 }) === 'VARIANCE' &&
        resolveGrirClearingStatus({ gcStatus: 'MATCHED', invoiceId: 'i', grAmount: 50, invoiceAmount: 100 }) ===
          'MATCHED',
      'CASE mirror',
    );
    gate(
      'FILTER_WL',
      normalizeOpenStatusFilter('UNMATCHED') === 'UNMATCHED' &&
        normalizeOpenStatusFilter("x'; DROP--") === null &&
        normalizeOpenStatusFilter('PARTIALLY_MATCHED') === 'VARIANCE',
      'whitelist',
    );
    gate(
      'F13_DEFAULT',
      F13_DEFAULT_TOLERANCE_PERCENT === 2 && parseF13TolerancePercent('bad') === 2,
      'tol 2%',
    );
    gate(
      'MANUAL_CLEAR',
      canShowManualClearAction({ clearingStatus: 'VARIANCE', invoiceId: 'i' }) &&
        !canShowManualClearAction({ clearingStatus: 'MATCHED', invoiceId: 'i' }),
      'MR11N gate',
    );
    gate(
      'LABELS',
      grirClearingStatusLabel('UNMATCHED') === GRIR_CLEARING_STATUS_LABELS.UNMATCHED &&
        OPEN_STATUS_FILTER_OPTIONS.length === 3,
      'labels + filter opts',
    );
    gate('ROUTE', GRIR_CLEARING_ROUTE === '/accounting/grir-clearing', 'route');
    gate(
      'HELP_SSOT',
      GRIR_HELP.residuals.methods.length === 3 &&
        GRIR_RESIDUAL_CLEAR_METHOD_OPTIONS.length === 3 &&
        GRIR_PAGE_SUBTITLE.length < 80,
      'help copy SSOT + short subtitle',
    );
    gate(
      'RESIDUAL_METHOD_GUARD',
      isResidualClearMethodAllowed('RECLASS_FROM_EXPENSE', 100) &&
        !isResidualClearMethodAllowed('RECLASS_FROM_EXPENSE', -50) &&
        resolveResidualClearMethod('RECLASS_FROM_EXPENSE', -50, 'TO_PRICE_VARIANCE') === 'TO_PRICE_VARIANCE' &&
        residualClearMethodBlockedReason('RECLASS_FROM_EXPENSE', -50)?.includes('credit') === true,
      'reclass credit-only SSOT',
    );
  });

  it('list unwrap never silently drops rows or pagination', () => {
    const rows = [{ id: 'g1', grNumber: 'GR-1' }];
    const standard = unwrapGrirOpenPayload({
      success: true,
      data: { data: rows, total: 8, page: 1, limit: 50, totalPages: 1 },
    });
    gate(
      'UNWRAP_OPEN',
      standard.rows.length === 1 && standard.pagination?.total === 8,
      'paginated open list',
    );
    gate(
      'UNWRAP_FAIL',
      (() => {
        try {
          unwrapGrirOpenPayload({ success: false, error: 'denied' });
          return false;
        } catch (e) {
          return e instanceof Error && e.message.includes('denied');
        }
      })(),
      'throws on success:false',
    );
    gate(
      'UNWRAP_AUTO',
      unwrapGrirAutoMatchPayload({
        success: true,
        data: { matched: 1, withVariance: 0, skipped: 0, failures: [] },
      }).matched === 1,
      'auto-match payload',
    );
  });
});

describe('GR/IR Clearing UI wiring', () => {
  it('page imports SSOT — no inline status/filter/tolerance drift', () => {
    const page = read('samplepos.client/src/pages/accounting/GrirClearingPage.tsx');

    gate('USES_SSOT', page.includes('grirClearingSsot'), 'imports domain SSOT');
    gate('USES_STATUS_LABEL', page.includes('grirClearingStatusLabel'), 'badge labels');
    gate('USES_FILTER_OPTS', page.includes('OPEN_STATUS_FILTER_OPTIONS'), 'filter dropdown SSOT');
    gate('USES_F13_DEFAULT', page.includes('F13_DEFAULT_TOLERANCE_PERCENT'), 'default tolerance');
    gate('USES_PARSE_TOL', page.includes('parseF13TolerancePercent'), 'parse tolerance');
    gate('USES_CLEAR_GATE', page.includes('canShowManualClearAction'), 'manual clear gate');
    gate('USES_QUERY_ERROR', page.includes('QueryError') && page.includes('getStructuredErrorMessage'), 'surfaces load errors');
    gate('AUTO_MATCH_FAILURES', page.includes('result.failures'), 'shows auto-match pair failures');
    gate(
      'HOOKS_UNWRAP',
      read('samplepos.client/src/hooks/useAccountingModules.ts').includes('unwrapGrirOpenPayload'),
      'hooks use SSOT unwrap',
    );
    gate('USES_HELP_TRIGGER', page.includes('HelpTrigger') && page.includes('GRIR_HELP'), 'help icon SSOT');
    gate(
      'RESIDUAL_METHOD_SSOT',
      page.includes('resolveResidualClearMethod') && page.includes('isResidualClearMethodAllowed'),
      'client validates method before clear',
    );
    gate(
      'RESIDUAL_ONE_CLEAR',
      page.includes('One Clear per row') &&
        !page.includes('>Suggested</') &&
        !page.includes('Default method'),
      'single Clear + per-row method (no Suggested button)',
    );
    gate(
      'NO_INLINE_RESIDUAL_ESSAY',
      !page.includes('True ledger residual on 2150') &&
        !page.includes('Never double-posts AP.') &&
        page.includes('GRIR_RESIDUAL_CLEAR_METHOD_OPTIONS'),
      'residual help in popover only',
    );
    gate(
      'NO_INLINE_FILTER_OPTS',
      !page.includes('<option value="UNMATCHED">Unmatched</option>'),
      'no hard-coded filter options',
    );
    gate(
      'NO_INLINE_TOL_FALLBACK',
      !page.includes('isNaN(tolerance) ? 2'),
      'no inline 2% fallback',
    );
  });

  it('nav + app route + API consistent', () => {
    const nav = read('samplepos.client/src/components/AccountingLayout.tsx');
    gate('NAV_ROUTE', nav.includes(GRIR_CLEARING_ROUTE), 'accounting nav');

    const app = read('samplepos.client/src/App.tsx');
    gate('APP_ROUTE', app.includes('GrirClearingPage') && app.includes('/accounting/grir-clearing'), 'lazy route');

    const api = read('samplepos.client/src/utils/api.ts');
    gate('API_PREFIX', api.includes("'grir-clearing/open'"), 'open API');
  });
});

afterAll(() => {
  const pass = gates.filter((g) => g.ok).length;
  const fail = gates.filter((g) => !g.ok).length;
  const verdict = fail === 0 ? 'PASS' : 'FAIL';
  const at = new Date().toISOString();
  const evidence = {
    at,
    feature: 'GRIR_CLEARING_SSOT_CLIENT',
    summary: { pass, fail, total: gates.length, verdict },
    scope: 'Client SSOT + UI/API wiring (no tenant DB writes)',
    gates,
  };

  const md = `# PROOF — GR/IR Clearing SSOT (client)

**Generated:** ${at}  
**Verdict:** **${verdict}** (${pass}/${gates.length} gates)  
**Scope:** ${evidence.scope}

## Gates

| Gate | Result | Detail |
|------|--------|--------|
${gates.map((g) => `| \`${g.id}\` | ${g.ok ? 'PASS' : 'FAIL'} | ${g.detail.replace(/\|/g, '\\|')} |`).join('\n')}

## Re-run

\`\`\`bash
npm run proof:grir-clearing-ssot --prefix samplepos.client
npm run proof:grir-clearing
\`\`\`
`;

  writeFileSync(path.join(repoRoot, 'PROOF_GRIR_CLEARING_SSOT_CLIENT.json'), JSON.stringify(evidence, null, 2));
  writeFileSync(path.join(repoRoot, 'PROOF_GRIR_CLEARING_SSOT_CLIENT.md'), md);
});
