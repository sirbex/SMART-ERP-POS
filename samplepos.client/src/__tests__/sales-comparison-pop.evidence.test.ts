/**
 * EVIDENCE: Sales comparison PoP — ordinal align + % when previous=0.
 * Run: npx vitest run src/__tests__/sales-comparison-pop.evidence.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  alignSalesComparisonBuckets,
  percentageChangePoP,
  summarizeSalesComparison,
} from '../../../shared/reports/salesComparisonSsot';

const repoRoot = path.resolve(__dirname, '../../..');

type Gate = { id: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string): void {
  gates.push({ id, ok, detail });
  expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
}

describe('EVIDENCE — Sales comparison period-over-period', () => {
  it('G1: calendar-label join bug reproduced as zero previous; ordinal align fixes it', () => {
    // Same shape as the bug: Aug weeks vs Jul weeks never share period labels
    const current = [
      { period: '2026-08-03', totalSales: 1707920, transactionCount: 5 },
      { period: '2026-08-10', totalSales: 99120, transactionCount: 1 },
      { period: '2026-08-17', totalSales: 12400, transactionCount: 3 },
    ];
    const previous = [
      { period: '2026-07-06', totalSales: 500000, transactionCount: 4 },
      { period: '2026-07-13', totalSales: 250000, transactionCount: 2 },
      { period: '2026-07-20', totalSales: 100000, transactionCount: 1 },
    ];

    const aligned = alignSalesComparisonBuckets(current, previous);

    gate('ROW_COUNT', aligned.length === 3, `rows=${aligned.length}`);
    gate(
      'FIRST_PAIR',
      aligned[0].period === '2026-08-03' &&
        aligned[0].previousPeriod === '2026-07-06' &&
        aligned[0].previousSales === 500000,
      `first previous=${aligned[0].previousSales} label=${aligned[0].previousPeriod}`,
    );
    gate(
      'NOT_ZERO_PREV',
      aligned.every((r) => r.previousSales > 0),
      'all previous sales > 0 under ordinal align',
    );
    gate(
      'PCT_FIRST',
      aligned[0].percentageChange !== null &&
        Math.abs((aligned[0].percentageChange as number) - ((1707920 - 500000) / 500000) * 100) < 0.02,
      `pct=${aligned[0].percentageChange}`,
    );
  });

  it('G2: previous=0 and current>0 → percentage null (not 100)', () => {
    gate('PCT_NULL', percentageChangePoP(1819440, 0) === null, 'no baseline → null');
    gate('PCT_BOTH_ZERO', percentageChangePoP(0, 0) === 0, 'both zero → 0');
    gate(
      'PCT_NORMAL',
      percentageChangePoP(110, 100) !== null &&
        Math.abs((percentageChangePoP(110, 100) as number) - 10) < 0.001,
      '110 vs 100 → 10%',
    );

    const summary = summarizeSalesComparison([
      {
        period: '2026-08-03',
        previousPeriod: '',
        currentSales: 1819440,
        previousSales: 0,
        difference: 1819440,
        percentageChange: null,
        currentTransactions: 9,
        previousTransactions: 0,
      },
    ]);
    gate(
      'SUMMARY_PCT_NULL',
      summary.overallPercentageChange === null,
      `overall=${String(summary.overallPercentageChange)}`,
    );
  });

  it('G3: repository no longer FULL OUTER JOIN on period label', () => {
    const repo = readFileSync(
      path.join(repoRoot, 'SamplePOS.Server/src/modules/reports/reportsRepository.ts'),
      'utf8',
    );
    const start = repo.indexOf('async getSalesComparison');
    const slice = repo.slice(start, start + 3500);
    gate(
      'NO_CALENDAR_JOIN',
      !/FULL OUTER JOIN previous_period p ON c\.period = p\.period/.test(slice),
      'old calendar join removed',
    );
    gate(
      'USES_ALIGN',
      slice.includes('alignSalesComparisonBuckets'),
      'uses ordinal align helper',
    );
    gate(
      'NO_FAKE_100',
      !/WHEN COALESCE\(p\.total_sales, 0\) = 0 THEN 100/.test(slice),
      'SQL no longer forces 100% when previous=0',
    );
  });

  it('writes PROOF artifacts', () => {
    const failed = gates.filter((g) => !g.ok);
    const evidence = {
      feature: 'SALES_COMPARISON_POP_ORDINAL',
      provenAt: new Date().toISOString(),
      defect:
        'Joined current/previous buckets ON calendar period label; Aug weeks vs Jul weeks → previous=0 and % forced to 100',
      fix: 'Bucket each range separately; align by ordinal index; % null when previous baseline is 0',
      gates,
      summary: {
        total: gates.length,
        passed: gates.filter((g) => g.ok).length,
        failed: failed.length,
        verdict: failed.length === 0 ? 'PASS' : 'FAIL',
      },
    };
    writeFileSync(
      path.join(repoRoot, 'PROOF_SALES_COMPARISON_POP.json'),
      JSON.stringify(evidence, null, 2),
    );
    writeFileSync(
      path.join(repoRoot, 'PROOF_SALES_COMPARISON_POP.md'),
      [
        '# PROOF — Sales Comparison period-over-period',
        '',
        `**Verdict:** ${evidence.summary.verdict}`,
        `**Proven at:** ${evidence.provenAt}`,
        '',
        '## Defect',
        evidence.defect,
        '',
        '## Fix',
        evidence.fix,
        '',
        '## Gates',
        ...gates.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} \`${g.id}\`: ${g.detail}`),
        '',
        '```bash',
        'cd samplepos.client && npx vitest run src/__tests__/sales-comparison-pop.evidence.test.ts',
        '```',
        '',
      ].join('\n'),
    );
    gate('ARTIFACTS', true, 'PROOF_SALES_COMPARISON_POP written');
    expect(failed).toEqual([]);
  });
});
