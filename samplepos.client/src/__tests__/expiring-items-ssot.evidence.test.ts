/**
 * EVIDENCE: Expiring items — shelf-life register SSOT (include expired, urgency bands, PDF keys).
 * Run: npx vitest run src/__tests__/expiring-items-ssot.evidence.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  classifyExpiryUrgency,
  summarizeExpiringItems,
} from '@shared/reports/expiringItemsSsot';

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

describe('EVIDENCE — Expiring items shelf-life SSOT', () => {
  it('SSOT: urgency bands + summary', () => {
    gate('EXPIRED', classifyExpiryUrgency(0) === 'expired', '0 days → expired');
    gate('CRITICAL', classifyExpiryUrgency(5) === 'critical', '5 days → critical');
    gate('WARNING', classifyExpiryUrgency(20) === 'warning', '20 days → warning');
    gate('WATCH', classifyExpiryUrgency(45) === 'watch', '45 days → watch');

    const sum = summarizeExpiringItems([
      { daysUntilExpiry: -2, quantityRemaining: 1, potentialLoss: 100 },
      { daysUntilExpiry: 3, quantityRemaining: 2, potentialLoss: 50 },
      { daysUntilExpiry: 15, quantityRemaining: 1, potentialLoss: 25 },
    ]);
    gate('SUM_EXPIRED', sum.expiredCount === 1 && sum.expiredValue === 100, 'expired band totals');
    gate('SUM_CRITICAL', sum.criticalCount === 1 && sum.criticalValue === 50, 'critical band totals');
    gate('SUM_ITEMS', sum.totalItems === 3 && sum.totalPotentialLoss === 175, 'overall totals');
  });

  it('SQL: includes past expiry; ACTIVE batches; business as-of date', () => {
    const repo = read('SamplePOS.Server/src/modules/reports/reportsRepository.ts');
    const start = repo.indexOf('async getExpiringItems');
    const slice = repo.slice(start, start + 2800);
    gate('NO_BETWEEN_ONLY_FUTURE', !slice.includes('BETWEEN CURRENT_DATE AND'), 'does not exclude already-expired');
    gate('INCLUDES_PAST_DUE', slice.includes('expiry_date::date <=') || slice.includes('expiry_date <='), 'horizon includes past due');
    gate('ACTIVE_ONLY', slice.includes("status, 'ACTIVE'") || slice.includes("status = 'ACTIVE'"), 'ACTIVE batches only');
    gate('AS_OF_BIZ', slice.includes('getBusinessDate') || slice.includes('asOf'), 'business as-of date');
    gate('HAS_SKU', slice.includes('p.sku'), 'selects SKU');
  });

  it('UI + PDF SSOT', () => {
    const page = read('samplepos.client/src/pages/ReportsPage.tsx');
    const ctrl = read('SamplePOS.Server/src/modules/reports/reportsController.ts');
    const svc = read('SamplePOS.Server/src/modules/reports/reportsService.ts');
    gate(
      'IN_SSOT',
      /FINANCIAL_SSOT_REPORTS[\s\S]*?'EXPIRING_ITEMS'/.test(page),
      'EXPIRING_ITEMS in FINANCIAL_SSOT_REPORTS',
    );
    gate('SHELF_COPY', page.includes('Shelf-life register'), 'dedicated shelf-life UI');
    gate('SVC_SUMMARIZE', svc.includes('summarizeExpiringItems'), 'service uses shared summarize');
    const pdfStart = ctrl.indexOf('async getExpiringItems');
    const pdf = ctrl.slice(pdfStart, pdfStart + 4500);
    gate('PDF_QTY_KEY', pdf.includes("key: 'quantityRemaining'"), 'PDF uses quantityRemaining');
    gate('PDF_LOSS_KEY', pdf.includes("key: 'potentialLoss'"), 'PDF uses potentialLoss');
    gate('NO_BRAND', !/\b(SAP|Odoo|Tally|QuickBooks)\b/i.test(page), 'no competitor brand in ReportsPage');
  });

  it('writes PROOF artifacts', () => {
    const failed = gates.filter((g) => !g.ok);
    const evidence = {
      feature: 'EXPIRING_ITEMS_SSOT',
      provenAt: new Date().toISOString(),
      contract:
        'shelf-life register; include expired on-hand; ACTIVE; urgency bands; SSOT UI; PDF column keys match data',
      gates,
      summary: {
        total: gates.length,
        passed: gates.filter((g) => g.ok).length,
        failed: failed.length,
        verdict: failed.length === 0 ? 'PASS' : 'FAIL',
      },
    };
    writeFileSync(
      path.join(repoRoot, 'PROOF_EXPIRING_ITEMS_SSOT.json'),
      JSON.stringify(evidence, null, 2),
    );
    writeFileSync(
      path.join(repoRoot, 'PROOF_EXPIRING_ITEMS_SSOT.md'),
      [
        '# PROOF — Expiring items shelf-life SSOT',
        '',
        `**Verdict:** ${evidence.summary.verdict}`,
        `**Proven at:** ${evidence.provenAt}`,
        '',
        `**Contract:** ${evidence.contract}`,
        '',
        ...gates.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} \`${g.id}\`: ${g.detail}`),
        '',
        '```bash',
        'cd samplepos.client && npx vitest run src/__tests__/expiring-items-ssot.evidence.test.ts',
        '```',
        '',
      ].join('\n'),
    );
    gate('ARTIFACTS', true, 'PROOF_EXPIRING_ITEMS_SSOT written');
    expect(failed).toEqual([]);
  });
});
