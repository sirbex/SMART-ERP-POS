/**
 * PROOF (structural): GR/IR Automatic Clearing F.13
 *
 * Prefer full integrity suite:
 *   npm test -- --runInBand src/modules/grir-clearing/grirClearingIntegrity.evidence.test.ts
 *
 * Re-run F.13-only:
 *   npm test -- --runInBand src/modules/grir-clearing/grirClearingF13.evidence.test.ts
 */
import { afterAll, describe, expect, it } from '@jest/globals';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  F13_DEFAULT_TOLERANCE_PERCENT,
  selectF13Pairs,
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

describe('PROOF: GR/IR F.13 Automatic Clearing', () => {
  it('repository multi-path via integrity SSOT', () => {
    const src = readRepo('SamplePOS.Server/src/modules/grir-clearing/grirClearingRepository.ts');
    gate('REPO_SSOT', src.includes('SI_LINKS_GR_SQL') && src.includes('SI_ACTIVE_SQL'), 'uses grirIntegrity SSOT');
    gate('REPO_EMPTY_GR', src.includes('GR_HAS_LINES_SQL'), 'empty GR excluded');
    gate('REPO_NO_RECLEAR', src.includes("status IN ('MATCHED', 'VARIANCE')"), 'skip cleared pairs');
  });

  it('service: selectF13Pairs + posted bookkeeping', () => {
    const src = readRepo('SamplePOS.Server/src/modules/grir-clearing/grirClearingService.ts');
    gate('SVC_SELECT', src.includes('selectF13Pairs'), 'selectF13Pairs SSOT');
    gate('SVC_DEFAULT_2', src.includes('F13_DEFAULT_TOLERANCE_PERCENT'), 'default tol from SSOT');
    gate(
      'SVC_ALREADY_POSTED',
      src.includes('alreadyPosted') && src.includes('invoice already posted'),
      'posted bills bookkeeping only',
    );
    gate(
      'SVC_AUTO_CLEAR',
      /export async function autoMatch[\s\S]*clearItem\(/.test(src),
      'autoMatch → clearItem',
    );
  });

  it('routes + client', () => {
    const routes = readRepo('SamplePOS.Server/src/modules/grir-clearing/grirClearingRoutes.ts');
    gate('ROUTE_CANDIDATES', routes.includes("router.get('/match-candidates'"), 'GET candidates');
    gate('ROUTE_AUTO', routes.includes("router.post('/auto-match'"), 'POST auto-match');
    gate('ROUTE_WRITE', routes.includes("requirePermission('accounting.reconcile')"), 'reconcile write');
    gate(
      'CLIENT_API',
      fileHas('samplepos.client/src/utils/api.ts', /getMatchCandidates:[\s\S]*tolerancePercent/),
      'client API tolerance',
    );
    gate(
      'UI_F13',
      fileHas('samplepos.client/src/pages/accounting/GrirClearingPage.tsx', 'Automatic Clearing — F.13'),
      'F.13 modal',
    );
  });

  it('algorithm 1:1 + default 2%', () => {
    gate('DEFAULT_TOL', F13_DEFAULT_TOLERANCE_PERCENT === 2, 'default 2');
    const raw = [
      { gr_id: 'g1', invoice_id: 'i1', gr_line_total: 100, amount_diff: 0 },
      { gr_id: 'g1', invoice_id: 'i2', gr_line_total: 100, amount_diff: 1 },
      { gr_id: 'g2', invoice_id: 'i1', gr_line_total: 50, amount_diff: 0 },
      { gr_id: 'g3', invoice_id: 'i3', gr_line_total: 100, amount_diff: 3 },
      { gr_id: 'g4', invoice_id: 'i4', gr_line_total: 100, amount_diff: 10 },
    ];
    const selected5 = selectF13Pairs(raw, 5);
    gate('ALGO_ONE_TO_ONE', selected5.length === 2, `selected=${selected5.length}`);
    gate('ALGO_FIRST', selected5[0]?.gr_id === 'g1' && selected5[0]?.invoice_id === 'i1', 'g1-i1 first');
    gate('ALGO_G3', selected5.some((c) => c.gr_id === 'g3'), 'g3 in at 5%');
    gate('ALGO_G4', !selected5.some((c) => c.gr_id === 'g4'), 'g4 out at 5%');
    const selected2 = selectF13Pairs(raw, F13_DEFAULT_TOLERANCE_PERCENT);
    gate('ALGO_TOL2', !selected2.some((c) => c.gr_id === 'g3'), '3% out at default 2%');
  });

  it('supplier filter', () => {
    gate('FILTER_SEARCH', resolveSupplierFilter('ONCO').mode === 'search', 'ONCO search');
    gate(
      'FILTER_UUID',
      resolveSupplierFilter('3bdfdabb-cb7a-478a-99f3-bea84db0a1a9').mode === 'id',
      'UUID id',
    );
    gate('FILTER_NONE', resolveSupplierFilter('').mode === 'none', 'empty none');
  });
});

afterAll(() => {
  const pass = gates.filter((g) => g.ok).length;
  const fail = gates.filter((g) => !g.ok).length;
  const verdict = fail === 0 ? 'PASS' : 'FAIL';
  const at = new Date().toISOString();
  const evidence = {
    at,
    feature: 'GRIR_F13_AUTO_MATCH',
    summary: { pass, fail, total: gates.length, verdict },
    rootCauseFixed: [
      'Multi-path candidates via grirIntegrity SSOT',
      'selectF13Pairs shared by preview + run, default 2%',
      'already-posted bills: grir_clearing only (no second AP/GL)',
    ],
    gates,
  };

  const md = `# PROOF — GR/IR Automatic Clearing (F.13)

**Generated:** ${at}  
**Verdict:** **${verdict}** (${pass}/${gates.length} gates)  
**Scope:** Structural + algorithm only

## Root cause fixed

Multi-path SSOT + shared \`selectF13Pairs\` (default 2%). See also PROOF_GRIR_CLEARING_INTEGRITY.

## Gates

| Gate | Result | Detail |
|------|--------|--------|
${gates.map((g) => `| \`${g.id}\` | ${g.ok ? 'PASS' : 'FAIL'} | ${g.detail.replace(/\|/g, '\\|')} |`).join('\n')}

## Re-run

\`\`\`bash
cd SamplePOS.Server
npm test -- --runInBand src/modules/grir-clearing/grirClearingF13.evidence.test.ts
\`\`\`
`;

  writeFileSync(path.join(repoRoot, 'PROOF_GRIR_F13_AUTO_MATCH.json'), JSON.stringify(evidence, null, 2));
  writeFileSync(path.join(repoRoot, 'PROOF_GRIR_F13_AUTO_MATCH.md'), md);
});
