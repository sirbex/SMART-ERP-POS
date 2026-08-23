/**
 * EVIDENCE: Void Sales report — cancellation-register SSOT + robust void-date / acct docs.
 * Run: npx vitest run src/__tests__/void-sales-report-ssot.evidence.test.ts
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

describe('EVIDENCE — Void Sales report SSOT / cancellation register', () => {
  it('SQL: VOID status; coalesce void date; aggregated REVERSAL docs', () => {
    const repo = read('SamplePOS.Server/src/modules/reports/reportsRepository.ts');
    const start = repo.indexOf('// ── Void Sales Report ──');
    const slice = repo.slice(start, start + 5500);
    gate('STATUS_VOID', slice.includes("s.status = 'VOID'"), 'filters status VOID only');
    gate(
      'COALESCE_VOID_DATE',
      slice.includes('COALESCE(s.voided_at, s.created_at)'),
      'void posting date falls back to created_at (sales has no updated_at)',
    );
    gate(
      'NO_REQUIRE_VOIDED_AT',
      !slice.includes('s.voided_at IS NOT NULL'),
      'does not drop legacy voids missing voided_at',
    );
    gate(
      'AGG_REVERSAL_DOCS',
      slice.includes('string_agg') && slice.includes("'REVERSAL'"),
      'accounting docs aggregated from REVERSAL journals',
    );
  });

  it('service: numeric summary only (no *Formatted dump fields)', () => {
    const svc = read('SamplePOS.Server/src/modules/reports/reportsService.ts');
    const start = svc.indexOf('// ── Void Sales Report ──');
    const slice = svc.slice(start, start + 2000);
    gate(
      'NO_FORMATTED_SUMMARY',
      !slice.includes('totalVoidedAmountFormatted') && !slice.includes('totalLostProfitFormatted'),
      'summary has no duplicate Formatted currency strings',
    );
  });

  it('UI: SSOT gate + cancellation register + void-vs-return copy', () => {
    const page = read('samplepos.client/src/pages/ReportsPage.tsx');
    gate(
      'IN_FINANCIAL_SSOT',
      /FINANCIAL_SSOT_REPORTS[\s\S]*?'VOID_SALES_REPORT'/.test(page),
      'VOID_SALES_REPORT in FINANCIAL_SSOT_REPORTS',
    );
    gate(
      'CANCEL_COPY',
      page.includes('Void / cancellation register') || page.includes('cancellation register'),
      'business-logic cancellation blurb',
    );
    gate(
      'POINTS_TO_REFUND',
      page.includes('Refund / Returns'),
      'empty/help points to credit-memo report',
    );
    gate('DOC_REGISTER', page.includes('Void documents'), 'document register section');
    gate('NO_BRAND', !/\b(SAP|Odoo|Tally|QuickBooks)\b/i.test(page), 'no competitor brand in ReportsPage');
  });

  it('PDF: register heading + by-reason section', () => {
    const ctrl = read('SamplePOS.Server/src/modules/reports/reportsController.ts');
    const start = ctrl.indexOf('async getVoidSalesReport');
    const slice = ctrl.slice(start, start + 3500);
    gate('PDF_REGISTER', slice.includes('Void document register'), 'PDF register heading');
    gate('PDF_BY_REASON', slice.includes('By void reason'), 'PDF includes reason breakdown');
  });

  it('writes PROOF artifacts', () => {
    const failed = gates.filter((g) => !g.ok);
    const evidence = {
      feature: 'VOID_SALES_REPORT_SSOT',
      provenAt: new Date().toISOString(),
      contract:
        'VOID cancellation register; coalesce void date; REVERSAL acct docs; numeric summary; SSOT UI; no competitor brand',
      gates,
      summary: {
        total: gates.length,
        passed: gates.filter((g) => g.ok).length,
        failed: failed.length,
        verdict: failed.length === 0 ? 'PASS' : 'FAIL',
      },
    };
    writeFileSync(
      path.join(repoRoot, 'PROOF_VOID_SALES_REPORT_SSOT.json'),
      JSON.stringify(evidence, null, 2),
    );
    writeFileSync(
      path.join(repoRoot, 'PROOF_VOID_SALES_REPORT_SSOT.md'),
      [
        '# PROOF — Void Sales report SSOT (cancellation register)',
        '',
        `**Verdict:** ${evidence.summary.verdict}`,
        `**Proven at:** ${evidence.provenAt}`,
        '',
        `**Contract:** ${evidence.contract}`,
        '',
        ...gates.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} \`${g.id}\`: ${g.detail}`),
        '',
        '```bash',
        'cd samplepos.client && npx vitest run src/__tests__/void-sales-report-ssot.evidence.test.ts',
        '```',
        '',
      ].join('\n'),
    );
    gate('ARTIFACTS', true, 'PROOF_VOID_SALES_REPORT_SSOT written');
    expect(failed).toEqual([]);
  });
});
