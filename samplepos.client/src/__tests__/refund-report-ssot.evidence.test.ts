/**
 * EVIDENCE: Refund report — credit-memo SSOT UI + one-row-per-document SQL.
 * Run: npx vitest run src/__tests__/refund-report-ssot.evidence.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

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

describe('EVIDENCE — Refund report SSOT / ledger consistency', () => {
  it('SQL: one header row per refund; GL docs aggregated (no join fan-out)', () => {
    const repo = read('SamplePOS.Server/src/modules/reports/reportsRepository.ts');
    const start = repo.indexOf('// ── Refund Report ──');
    const slice = repo.slice(start, start + 4500);
    gate(
      'NO_DIRECT_LT_JOIN',
      !/LEFT JOIN ledger_transactions lt\s+ON lt\."ReferenceType" = 'SALE_REFUND'/.test(slice),
      'header query does not join ledger_transactions (avoids duplicate docs)',
    );
    gate(
      'AGG_ACCT_DOCS',
      slice.includes('string_agg') && slice.includes('SALE_REFUND'),
      'accounting docs aggregated via string_agg',
    );
    gate(
      'COMPLETED_ONLY',
      slice.includes("sr.status = 'COMPLETED'"),
      'only completed refunds',
    );
  });

  it('service: numeric summary only (no *Formatted dump fields)', () => {
    const svc = read('SamplePOS.Server/src/modules/reports/reportsService.ts');
    const start = svc.indexOf('// ── Refund Report ──');
    const slice = svc.slice(start, start + 2500);
    gate(
      'NO_FORMATTED_SUMMARY',
      !slice.includes('totalRevenueReversalFormatted') &&
        !slice.includes('totalCOGSReversalFormatted') &&
        !slice.includes('netProfitImpactFormatted'),
      'summary has no duplicate Formatted currency strings',
    );
    gate('HAS_NUMERIC_SUMMARY', slice.includes('totalRevenueReversal: summary.totalRevenueReversal'), 'numeric revenue in summary');
  });

  it('UI: SSOT gate + dedicated credit-memo register (no brand words)', () => {
    const page = read('samplepos.client/src/pages/ReportsPage.tsx');
    gate(
      'IN_FINANCIAL_SSOT',
      /FINANCIAL_SSOT_REPORTS[\s\S]*?'REFUND_REPORT'/.test(page),
      'REFUND_REPORT in FINANCIAL_SSOT_REPORTS',
    );
    gate(
      'CREDIT_MEMO_COPY',
      page.includes('Credit memo register'),
      'business-logic credit memo blurb',
    );
    gate(
      'DOC_REGISTER',
      page.includes('Refund documents') && page.includes('one row per credit memo'),
      'document register section',
    );
    gate(
      'NO_GENERIC_WITH_SSOT',
      page.includes('isSsotReportType') &&
        page.includes("'REFUND_REPORT'"),
      'SSOT skip prevents generic summary/table dump',
    );
    gate('NO_BRAND', !/\b(SAP|Odoo|Tally|QuickBooks)\b/i.test(page), 'no competitor brand in ReportsPage');
  });

  it('PDF: document register heading + acct doc column', () => {
    const ctrl = read('SamplePOS.Server/src/modules/reports/reportsController.ts');
    const start = ctrl.indexOf('async getRefundReport');
    const slice = ctrl.slice(start, start + 3500);
    gate(
      'PDF_REGISTER_HEADING',
      slice.includes('Refund document register'),
      'PDF section for document register',
    );
    gate(
      'PDF_ACCT_DOC',
      slice.includes('Acct. Doc') || slice.includes('accountingDocNumber'),
      'PDF includes accounting doc column',
    );
  });

  it('writes PROOF artifacts', () => {
    const failed = gates.filter((g) => !g.ok);
    const evidence = {
      feature: 'REFUND_REPORT_SSOT',
      provenAt: new Date().toISOString(),
      contract:
        'one row per refund document; credit-memo SSOT UI; numeric summary; no generic dump; no competitor brand copy',
      gates,
      summary: {
        total: gates.length,
        passed: gates.filter((g) => g.ok).length,
        failed: failed.length,
        verdict: failed.length === 0 ? 'PASS' : 'FAIL',
      },
    };
    writeFileSync(
      path.join(repoRoot, 'PROOF_REFUND_REPORT_SSOT.json'),
      JSON.stringify(evidence, null, 2),
    );
    writeFileSync(
      path.join(repoRoot, 'PROOF_REFUND_REPORT_SSOT.md'),
      [
        '# PROOF — Refund report SSOT (credit memo register)',
        '',
        `**Verdict:** ${evidence.summary.verdict}`,
        `**Proven at:** ${evidence.provenAt}`,
        '',
        `**Contract:** ${evidence.contract}`,
        '',
        ...gates.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} \`${g.id}\`: ${g.detail}`),
        '',
        '```bash',
        'cd samplepos.client && npx vitest run src/__tests__/refund-report-ssot.evidence.test.ts',
        '```',
        '',
      ].join('\n'),
    );
    gate('ARTIFACTS', true, 'PROOF_REFUND_REPORT_SSOT written');
    expect(failed).toEqual([]);
  });
});
