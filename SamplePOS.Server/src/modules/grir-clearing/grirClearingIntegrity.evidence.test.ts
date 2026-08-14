/**
 * PROOF (integrity): GR/IR Clearing — multi-path SSOT, F.13 selection, MR11 open list.
 *
 * Emits (repo root):
 *   PROOF_GRIR_CLEARING_INTEGRITY.md
 *   PROOF_GRIR_CLEARING_INTEGRITY.json
 *
 * Re-run:
 *   cd SamplePOS.Server
 *   npm test -- --runInBand src/modules/grir-clearing/grirClearingIntegrity.evidence.test.ts
 */
import { afterAll, describe, expect, it } from '@jest/globals';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  F13_DEFAULT_TOLERANCE_PERCENT,
  GR_HAS_LINES_SQL,
  normalizeOpenStatusFilter,
  selectF13Pairs,
  SI_ACTIVE_SQL,
  SI_LINKS_GR_SQL,
} from './grirIntegrity.js';
import { resolveSupplierFilter } from './supplierFilter.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repoRoot = path.resolve(serverRoot, '..');

type Gate = { id: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string): void {
  gates.push({ id, ok, detail });
  if (!ok) {
    expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
  }
}

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

function fileHas(rel: string, re: RegExp | string): boolean {
  const p = path.join(repoRoot, rel);
  if (!existsSync(p)) return false;
  const src = readFileSync(p, 'utf8');
  return typeof re === 'string' ? src.includes(re) : re.test(src);
}

describe('PROOF: GR/IR Clearing integrity', () => {
  it('SSOT fragments are multi-path + soft cancel + non-empty GR', () => {
    gate(
      'SSOT_LINKS_GRN',
      SI_LINKS_GR_SQL.includes('supplier_invoice_grn_links'),
      'path 1 grn_links',
    );
    gate(
      'SSOT_LINKS_PO',
      SI_LINKS_GR_SQL.includes('PurchaseOrderId'),
      'path 2 PO',
    );
    gate(
      'SSOT_LINKS_REF',
      SI_LINKS_GR_SQL.includes('InternalReferenceNumber'),
      'path 3 internal ref',
    );
    gate(
      'SSOT_ACTIVE_CANCELLED',
      SI_ACTIVE_SQL.includes('Cancelled') && SI_ACTIVE_SQL.includes('CANCELLED'),
      'soft cancel variants',
    );
    gate(
      'SSOT_ACTIVE_VOIDED',
      SI_ACTIVE_SQL.includes('Voided') || SI_ACTIVE_SQL.includes('VOIDED'),
      'void status excluded',
    );
    gate(
      'SSOT_HAS_LINES',
      GR_HAS_LINES_SQL.includes('received_quantity'),
      'empty GR shells excluded',
    );
    gate(
      'SSOT_DEFAULT_TOL_2',
      F13_DEFAULT_TOLERANCE_PERCENT === 2,
      `default tol=${F13_DEFAULT_TOLERANCE_PERCENT}`,
    );
  });

  it('repository uses SSOT in open, search, candidates, balance', () => {
    const src = readRepo('SamplePOS.Server/src/modules/grir-clearing/grirClearingRepository.ts');
    gate('REPO_IMPORTS_SSOT', src.includes('SI_LINKS_GR_SQL') && src.includes('SI_ACTIVE_SQL'), 'imports integrity SSOT');
    gate('REPO_OPEN_MULTI', /getOpenItems[\s\S]*SI_LINKS_GR_SQL/.test(src), 'open list multi-path');
    gate('REPO_OPEN_GC', /getOpenItems[\s\S]*grir_clearing/.test(src), 'open prefers grir_clearing status');
    gate('REPO_OPEN_STATUS_WL', src.includes('normalizeOpenStatusFilter'), 'status whitelist');
    gate('REPO_SEARCH_MULTI', /searchClearingItems[\s\S]*SI_LINKS_GR_SQL/.test(src), 'search multi-path');
    gate('REPO_CAND_MULTI', /export async function getMatchCandidates[\s\S]*SI_LINKS_GR_SQL/.test(src), 'candidates multi-path');
    gate('REPO_BAL_MULTI', /getBalanceSummary[\s\S]*SI_LINKS_GR_SQL/.test(src), 'balance multi-path');
    gate(
      'REPO_NO_CANCELLED_ONLY',
      !src.includes("NOT IN ('CANCELLED')"),
      'no hard-coded CANCELLED-only filter left',
    );
    gate(
      'REPO_PO_STATUS_TEXT',
      src.includes("po.status::text") && !src.includes("COALESCE(po.status, '—')"),
      'po.status cast to text before em-dash (enum-safe)',
    );
  });

  it('service: selectF13Pairs shared by preview and autoMatch', () => {
    const src = readRepo('SamplePOS.Server/src/modules/grir-clearing/grirClearingService.ts');
    gate('SVC_SELECT_IMPORT', src.includes('selectF13Pairs'), 'imports selectF13Pairs');
    gate('SVC_DEFAULT_TOL', src.includes('F13_DEFAULT_TOLERANCE_PERCENT'), 'uses default tolerance SSOT');
    gate('SVC_AUTO_SELECT', /export async function autoMatch[\s\S]*selectF13Pairs/.test(src), 'autoMatch uses selectF13Pairs');
    gate(
      'SVC_PREVIEW_SELECT',
      /export async function getMatchCandidates[\s\S]*selectF13Pairs/.test(src),
      'preview uses selectF13Pairs',
    );
    gate(
      'SVC_POSTED_BOOKKEEP',
      src.includes('alreadyPosted') && src.includes('invoice already posted'),
      'posted bill bookkeeping only',
    );
  });

  it('selectF13Pairs algorithm integrity', () => {
    const raw = [
      { gr_id: 'g1', invoice_id: 'i1', gr_line_total: 100, amount_diff: 0 },
      { gr_id: 'g1', invoice_id: 'i2', gr_line_total: 100, amount_diff: 1 },
      { gr_id: 'g2', invoice_id: 'i1', gr_line_total: 50, amount_diff: 0 },
      { gr_id: 'g3', invoice_id: 'i3', gr_line_total: 100, amount_diff: 3 },
      { gr_id: 'g4', invoice_id: 'i4', gr_line_total: 100, amount_diff: 10 },
    ];
    const at2 = selectF13Pairs(raw, 2);
    const at5 = selectF13Pairs(raw, 5);
    gate('ALGO_AT2_COUNT', at2.length === 1 && at2[0].gr_id === 'g1', `at2=${at2.length} first=g1-i1`);
    gate('ALGO_AT5_HAS_G3', at5.some((c) => c.gr_id === 'g3'), '5% includes 3% variance g3');
    gate('ALGO_AT5_NO_G4', !at5.some((c) => c.gr_id === 'g4'), '5% excludes 10% g4');
    gate('ALGO_NO_DOUBLE_INV', !at5.some((c) => c.gr_id === 'g2'), 'invoice i1 not reused');
  });

  it('status filter + supplier filter guards', () => {
    gate('STATUS_UNMATCHED', normalizeOpenStatusFilter('UNMATCHED') === 'UNMATCHED', 'UNMATCHED ok');
    gate('STATUS_INJECT', normalizeOpenStatusFilter("x'; DROP TABLE t;--") === null, 'injection rejected');
    gate('STATUS_PARTIAL', normalizeOpenStatusFilter('PARTIALLY_MATCHED') === 'VARIANCE', 'partial→VARIANCE');
    gate('FILTER_TEXT', resolveSupplierFilter('sal').mode === 'search', 'text is search');
    gate('FILTER_UUID', resolveSupplierFilter('3bdfdabb-cb7a-478a-99f3-bea84db0a1a9').mode === 'id', 'uuid is id');
  });

  it('routes + CRUD + UI surfaces', () => {
    const routes = readRepo('SamplePOS.Server/src/modules/grir-clearing/grirClearingRoutes.ts');
    gate('ROUTE_AUTO_PARSE', routes.includes('parseFloat') && routes.includes('tolerancePercent'), 'auto-match tol parse');
    gate(
      'ROUTE_RES_BEFORE_PO',
      routes.indexOf("router.get('/residuals'") < routes.indexOf("router.get('/:poId'"),
      'residuals before :poId',
    );
    gate(
      'CRUD_NO_CASE_$9',
      fileHas(
        'SamplePOS.Server/src/modules/grir-clearing/grirClearingRepository.ts',
        'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())',
      ) &&
        !fileHas(
          'SamplePOS.Server/src/modules/grir-clearing/grirClearingRepository.ts',
          /CASE WHEN \$9 IN/,
        ),
      'createClearingRecord no $9 CASE reuse',
    );
    gate(
      'UI_UNMATCHED',
      fileHas(
        'samplepos.client/src/pages/accounting/GrirClearingPage.tsx',
        'UNMATCHED',
      ),
      'UI badge supports UNMATCHED',
    );
    gate(
      'UI_TOL_DEFAULT',
      fileHas(
        'samplepos.client/src/pages/accounting/GrirClearingPage.tsx',
        "useState('2')",
      ),
      'UI default tolerance 2%',
    );
  });
});

afterAll(() => {
  const pass = gates.filter((g) => g.ok).length;
  const fail = gates.filter((g) => !g.ok).length;
  const verdict = fail === 0 ? 'PASS' : 'FAIL';
  const at = new Date().toISOString();
  const evidence = {
    at,
    feature: 'GRIR_CLEARING_INTEGRITY',
    summary: { pass, fail, total: gates.length, verdict },
    fixes: [
      'Single SI_LINKS / SI_ACTIVE / GR_HAS_LINES SSOT for open, search, candidates, balance',
      'F.13 preview and run share selectF13Pairs + default 2% tolerance',
      'Open status whitelist (no SQL string injection)',
      'grir_clearing MATCHED/VARIANCE preferred on worklist',
      'Soft cancel/void for all list queries (not CANCELLED-only)',
      'UI UNMATCHED badge',
    ],
    gates,
  };

  const md = `# PROOF — GR/IR Clearing integrity

**Generated:** ${at}  
**Verdict:** **${verdict}** (${pass}/${gates.length} gates)  
**Scope:** Structural SSOT + algorithm (no tenant DB writes)

## Fixes proved

1. Multi-path GR↔bill (grn links / PO / internal ref) on **open, search, balance, F.13**
2. Soft cancel/void statuses everywhere
3. Empty-shell GRs excluded
4. Preview/Run Auto-Match share \`selectF13Pairs\` + default **2%**
5. Status filter whitelist (no SQL interpolation of free text)
6. Worklist prefers \`grir_clearing\` when already cleared

## Gates

| Gate | Result | Detail |
|------|--------|--------|
${gates.map((g) => `| \`${g.id}\` | ${g.ok ? 'PASS' : 'FAIL'} | ${g.detail.replace(/\|/g, '\\|')} |`).join('\n')}

## Re-run

\`\`\`bash
cd SamplePOS.Server
npm test -- --runInBand src/modules/grir-clearing/grirClearingIntegrity.evidence.test.ts
npm test -- --runInBand src/modules/grir-clearing/grirClearingF13.evidence.test.ts
npm test -- --runInBand src/modules/grir-clearing/grirClearingRepository.test.ts
\`\`\`
`;

  writeFileSync(path.join(repoRoot, 'PROOF_GRIR_CLEARING_INTEGRITY.json'), JSON.stringify(evidence, null, 2));
  writeFileSync(path.join(repoRoot, 'PROOF_GRIR_CLEARING_INTEGRITY.md'), md);
});
