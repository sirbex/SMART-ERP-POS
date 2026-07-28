import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveReportDetailCollapsedDefault,
  resolveReportDetailMode,
  resolveReportSummaryColumns,
  selectReportMetrics,
} from '../lib/adaptiveReports';
import { printHtmlDocument, printReportDocument } from '../lib/print';

const here = dirname(fileURLToPath(import.meta.url));

describe('adaptive reports (Phase 4)', () => {
  it('maps tiers to summary columns and detail modes', () => {
    expect(resolveReportSummaryColumns('mobile')).toBe(2);
    expect(resolveReportSummaryColumns('compact')).toBe(3);
    expect(resolveReportSummaryColumns('desktop')).toBe(4);
    expect(resolveReportSummaryColumns('wide')).toBe(6);

    expect(resolveReportDetailMode('mobile')).toBe('cards');
    expect(resolveReportDetailMode('compact')).toBe('reduced');
    expect(resolveReportDetailMode('desktop')).toBe('table');
    expect(resolveReportDetailCollapsedDefault('mobile')).toBe(true);
    expect(resolveReportDetailCollapsedDefault('desktop')).toBe(false);
  });

  it('keeps primary metrics on mobile without dropping secondary forever', () => {
    const metrics = [
      { id: 'a', priority: 'primary' as const },
      { id: 'b', priority: 'secondary' as const },
      { id: 'c', priority: 'primary' as const },
    ];
    expect(selectReportMetrics(metrics, 'mobile').map((m) => m.id)).toEqual(['a', 'c']);
    expect(selectReportMetrics(metrics, 'desktop').map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('Sales Analysis consumes AdaptiveReportShell + PrintService print path', () => {
    const src = readFileSync(
      resolve(here, '../pages/reports/SalesAnalysisReportPage.tsx'),
      'utf8',
    );
    expect(src).toContain('AdaptiveReportShell');
    expect(src).toContain('AdaptiveReportSummary');
    expect(src).toContain('printReportDocument');
    expect(src).toContain('Print');
  });

  it('print.ts exposes shared HTML print contract used by receipts and reports', () => {
    const src = readFileSync(resolve(here, '../lib/print.ts'), 'utf8');
    expect(src).toContain('export async function printHtmlDocument');
    expect(src).toContain('export async function printReportDocument');
    expect(src).toContain('printHtmlDocument(receiptHTML)');
    expect(src).toContain('localhost:1811/print');
  });
});

describe('printHtmlDocument contract', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no bridge')));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects empty HTML', async () => {
    await expect(printHtmlDocument('')).rejects.toThrow(/HTML is required/);
    await expect(printReportDocument('   ')).rejects.toThrow(/HTML is required/);
  });
});
