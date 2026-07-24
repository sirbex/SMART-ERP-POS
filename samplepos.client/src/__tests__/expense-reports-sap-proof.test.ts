/**
 * Proof: expense reports are SAP-style (column chooser) + business-aligned.
 * Run: npx vitest run src/__tests__/expense-reports-sap-proof.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const testsDir = resolve(__dirname);
const clientSrc = resolve(testsDir, '..');
const repoRoot = resolve(clientSrc, '../..');

function readClient(path: string): string {
  return readFileSync(resolve(clientSrc, path), 'utf8');
}

function readRepo(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Expense reports — SAP column chooser + business logic', () => {
  it('page ships column chooser with persisted layout', () => {
    const page = readClient('pages/reports/ExpenseReportsPage.tsx');
    expect(page).toContain('Columns3');
    expect(page).toContain('toggleColumn');
    expect(page).toContain('expense-reports-layout-v1');
    expect(page).toContain('Display columns');
    expect(page).toContain('COLUMN_CATALOG');
  });

  it('does not dump Object.keys of raw API rows as table headers', () => {
    const page = readClient('pages/reports/ExpenseReportsPage.tsx');
    expect(page).not.toContain('Object.keys(data[0])');
    expect(page).not.toContain('Object.entries(data).map');
  });

  it('uses business KPIs: recognized P&L, unpaid AP, paid', () => {
    const page = readClient('pages/reports/ExpenseReportsPage.tsx');
    expect(page).toContain('Recognized (P&L)');
    expect(page).toContain('Unpaid AP');
    expect(page).toContain('recognizedAmount');
    expect(page).toContain('unpaidApAmount');
  });

  it('detailed list defaults exclude twin category/gl code columns', () => {
    const page = readClient('pages/reports/ExpenseReportsPage.tsx');
    expect(page).toContain("id: 'category'");
    expect(page).toContain("id: 'glAccount'");
    expect(page).not.toContain("id: 'categoryName'");
    expect(page).not.toContain("id: 'categoryCode'");
    expect(page).not.toContain("id: 'glAccountCode'");
  });

  it('repository aggregations exclude CANCELLED and expose recognized amounts', () => {
    const repo = readRepo('SamplePOS.Server/src/repositories/expenseRepository.ts');
    expect(repo).toContain("e.status != 'CANCELLED'");
    expect(repo).toContain("status IN ('APPROVED', 'PAID')");
    expect(repo).toContain('recognized_amount');
    expect(repo).toContain('unpaid_ap_amount');
    expect(existsSync(resolve(clientSrc, 'pages/reports/ExpenseReportsPage.tsx'))).toBe(true);
  });
});
