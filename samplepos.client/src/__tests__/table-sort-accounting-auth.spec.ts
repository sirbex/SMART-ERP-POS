/**
 * Proof: sortable table utilities + accounting modules use axios auth (not raw fetch).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyTableSort, compareSortValues } from '../lib/tableSortUtils';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readSrc(relativePath: string): string {
  return fs.readFileSync(path.join(clientRoot, relativePath), 'utf8');
}

describe('tableSortUtils — client-side column sort', () => {
  it('compareSortValues sorts strings A→Z ascending', () => {
    expect(compareSortValues('alpha', 'beta', 'asc')).toBeLessThan(0);
    expect(compareSortValues('beta', 'alpha', 'asc')).toBeGreaterThan(0);
  });

  it('compareSortValues reverses for desc', () => {
    expect(compareSortValues('alpha', 'beta', 'desc')).toBeGreaterThan(0);
  });

  it('applyTableSort orders rows by accessor', () => {
    const rows = [{ name: 'Zulu' }, { name: 'Alpha' }, { name: 'Mike' }];
    const sorted = applyTableSort(rows, 'name', 'asc', { name: (r) => r.name });
    expect(sorted.map((r) => r.name)).toEqual(['Alpha', 'Mike', 'Zulu']);
  });

  it('applyTableSort filters outstanding-style numeric desc', () => {
    const rows = [{ bal: 0 }, { bal: 500 }, { bal: 100 }];
    const sorted = applyTableSort(rows, 'bal', 'desc', { bal: (r) => r.bal });
    expect(sorted.map((r) => r.bal)).toEqual([500, 100, 0]);
  });
});

describe('SortableTableHeader — wired on list pages', () => {
  const pagesWithSortableHeaders = [
    'pages/SuppliersPage.tsx',
    'pages/CustomersPage.tsx',
    'pages/SalesPage.tsx',
    'pages/inventory/ProductsPage.tsx',
    'pages/inventory/StockLevelsPage.tsx',
    'pages/inventory/PurchaseOrdersPage.tsx',
    'components/customers/CustomerGroupsPanel.tsx',
  ];

  for (const page of pagesWithSortableHeaders) {
    it(`${page} imports SortableTableHeader`, () => {
      const src = readSrc(page);
      expect(src).toContain('SortableTableHeader');
      expect(src).toContain('useColumnSort');
    });
  }
});

describe('accounting modules — axios auth with token refresh (ERP session policy)', () => {
  it('useExpenses uses api axios, not raw fetch', () => {
    const src = readSrc('hooks/useExpenses.ts');
    expect(src).toContain("from '../services/api'");
    expect(src).not.toMatch(/fetch\(\s*[`'"]\/api\/expenses/);
    expect(src).toContain('api.get');
    expect(src).toContain('api.post');
  });

  it('JournalEntriesPage uses api axios, not authHeaders fetch', () => {
    const src = readSrc('pages/JournalEntriesPage.tsx');
    expect(src).toContain("from '../services/api'");
    expect(src).not.toContain('authHeaders');
    expect(src).not.toMatch(/fetch\(\s*[`'"]\/api\/erp-accounting/);
  });

  it('ExpenseCategoriesPage uses api axios', () => {
    const src = readSrc('pages/accounting/ExpenseCategoriesPage.tsx');
    expect(src).toContain("from '../../services/api'");
    expect(src).not.toMatch(/fetch\(\s*[`'"]\/api\/expenses\/categories/);
  });

  it('AssetAccountingPage chart-of-accounts uses api axios', () => {
    const src = readSrc('pages/accounting/AssetAccountingPage.tsx');
    expect(src).toContain("from '../../services/api'");
    expect(src).not.toMatch(/fetch\(\s*[`'"]\/api\/accounting\/chart-of-accounts/);
  });
});
