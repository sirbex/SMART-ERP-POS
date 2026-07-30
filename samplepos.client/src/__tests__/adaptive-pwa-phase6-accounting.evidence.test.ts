/**
 * Adaptive PWA Platform — Phase 6 evidence
 * Accounting lists/journals + Reports AdaptiveReportShell.
 *
 * @see docs/architecture/ADAPTIVE_PWA_PLATFORM_ARCHITECTURE.md roadmap Phase 6
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(resolve(here, rel), 'utf8');
}

describe('Phase 6 accounting Adaptive floorplans', () => {
  it('JournalEntriesPage uses AdaptivePage / Toolbar — keeps journal APIs', () => {
    const src = read('../pages/JournalEntriesPage.tsx');
    expect(src).toContain('AdaptivePage');
    expect(src).toContain('AdaptiveToolbar');
    expect(src).toContain('data-je-filters="true"');
    expect(src).toContain('/erp-accounting/journal-entries');
    expect(src).toContain('New Journal Entry');
    expect(src).not.toMatch(/\/api\/mobile/);
  });

  it('ExpensesPage uses AdaptivePage / Toolbar / Search — keeps useExpenses', () => {
    const src = read('../pages/accounting/ExpensesPage.tsx');
    expect(src).toContain('AdaptivePage');
    expect(src).toContain('AdaptiveToolbar');
    expect(src).toContain('AdaptiveSearch');
    expect(src).toContain('data-expense-filters="true"');
    expect(src).toContain('useExpenses');
    expect(src).toContain("value={filter.search || ''}");
  });

  it('ChartOfAccountsPage uses AdaptivePage / Search — keeps accountingApi', () => {
    const src = read('../pages/accounting/ChartOfAccountsPage.tsx');
    expect(src).toContain('AdaptivePage');
    expect(src).toContain('AdaptiveSearch');
    expect(src).toContain('AdaptiveToolbar');
    expect(src).toContain('data-coa-filters="true"');
    expect(src).toContain('accountingApi');
    expect(src).toContain('value={searchTerm}');
  });

  it('CustomerPaymentsPage uses AdaptivePage / Search — keeps AR payment service', () => {
    const src = read('../pages/accounting/CustomerPaymentsPage.tsx');
    expect(src).toContain('AdaptivePage');
    expect(src).toContain('AdaptiveSearch');
    expect(src).toContain('AdaptiveToolbar');
    expect(src).toContain('data-ar-payment-filters="true"');
    expect(src).toContain('arPaymentService');
    expect(src).toContain('value={searchTerm}');
  });

  it('GeneralLedgerPage uses AdaptivePage / Search — keeps accountingApi', () => {
    const src = read('../pages/accounting/GeneralLedgerPage.tsx');
    expect(src).toContain('AdaptivePage');
    expect(src).toContain('AdaptiveSearch');
    expect(src).toContain('AdaptiveToolbar');
    expect(src).toContain('data-gl-filters="true"');
    expect(src).toContain('accountingApi');
  });

  it('CreditDebitNotesPage uses AdaptivePage / Toolbar — drops ResponsiveToolbar', () => {
    const src = read('../pages/accounting/CreditDebitNotesPage.tsx');
    expect(src).toContain('AdaptivePage');
    expect(src).toContain('AdaptiveToolbar');
    expect(src).toContain('AdaptiveSearch');
    expect(src).toContain('data-cdn-filters="customer"');
    expect(src).toContain('data-cdn-filters="supplier"');
    expect(src).not.toContain('ResponsiveToolbar');
    expect(src).toContain('CustomerNotesAdaptiveGrid');
  });
});

describe('Phase 6 reports AdaptiveReportShell', () => {
  it('BusinessPerformancePage uses AdaptivePage + ReportShell / Summary', () => {
    const src = read('../pages/reports/BusinessPerformancePage.tsx');
    expect(src).toContain('AdaptivePage');
    expect(src).toContain('AdaptiveReportShell');
    expect(src).toContain('AdaptiveReportSummary');
    expect(src).toContain('data-bp-filters="true"');
    expect(src).toContain('useBusinessPerformance');
    expect(src).not.toMatch(/\/api\/mobile/);
  });

  it('TrialBalancePage uses AdaptivePage + ReportShell / Summary', () => {
    const src = read('../pages/accounting/TrialBalancePage.tsx');
    expect(src).toContain('AdaptivePage');
    expect(src).toContain('AdaptiveReportShell');
    expect(src).toContain('AdaptiveReportSummary');
    expect(src).toContain('data-tb-filters="true"');
    expect(src).toContain('accountingApi');
  });

  it('AgedBalancePage uses AdaptivePage + ReportShell / Summary', () => {
    const src = read('../pages/accounting/AgedBalancePage.tsx');
    expect(src).toContain('AdaptivePage');
    expect(src).toContain('AdaptiveReportShell');
    expect(src).toContain('AdaptiveReportSummary');
    expect(src).toContain('data-aged-filters="true"');
    expect(src).toContain('useAgedReceivables');
  });

  it('ExpenseReportsPage uses AdaptivePage + ReportShell', () => {
    const src = read('../pages/reports/ExpenseReportsPage.tsx');
    expect(src).toContain('AdaptivePage');
    expect(src).toContain('AdaptiveReportShell');
    expect(src).toContain('AdaptiveReportSummary');
    expect(src).toContain('data-expense-report-filters="true"');
  });

  it('SalesAnalysisReportPage remains on AdaptiveReportShell (prior art)', () => {
    const src = read('../pages/reports/SalesAnalysisReportPage.tsx');
    expect(src).toContain('AdaptiveReportShell');
    expect(src).toContain('AdaptiveReportSummary');
  });
});
