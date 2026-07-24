/**
 * Proof: expense categories ↔ GL consistency.
 * Run: npx vitest run src/__tests__/expense-category-gl-proof.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  mapExpenseCategoryCodeToGl,
  normalizeExpenseCategoryCode,
  EXPENSE_CATEGORY_GL_CODES,
} from '../../../shared/expense/categoryGlMap';

const testsDir = resolve(__dirname);
const clientSrc = resolve(testsDir, '..');
const clientRoot = resolve(clientSrc, '..');
const repoRoot = resolve(clientRoot, '..');

function readRepo(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

describe('Expense category ↔ GL consistency', () => {
  it('normalizes legacy enum codes to canonical short codes', () => {
    expect(normalizeExpenseCategoryCode('OFFICE_SUPPLIES')).toBe('OFFICE');
    expect(normalizeExpenseCategoryCode('PROFESSIONAL_SERVICES')).toBe('PROFESSIONAL');
    expect(normalizeExpenseCategoryCode('GENERAL')).toBe('OTHER');
    expect(normalizeExpenseCategoryCode('TRAVEL')).toBe('TRAVEL');
  });

  it('maps categories to CoA codes matching AccountCodes / add_missing_accounts', () => {
    expect(mapExpenseCategoryCodeToGl('OFFICE')).toBe('6400');
    expect(mapExpenseCategoryCodeToGl('OFFICE_SUPPLIES')).toBe('6400');
    expect(mapExpenseCategoryCodeToGl('UTILITIES')).toBe('6200');
    expect(mapExpenseCategoryCodeToGl('MARKETING')).toBe('6300');
    expect(mapExpenseCategoryCodeToGl('PROFESSIONAL')).toBe('6700');
    expect(mapExpenseCategoryCodeToGl('TRAVEL')).toBe('6800');
    expect(mapExpenseCategoryCodeToGl('ALLOWANCE')).toBe('6000');
    expect(mapExpenseCategoryCodeToGl('UNKNOWN_XYZ')).toBe('6900');
    expect(EXPENSE_CATEGORY_GL_CODES.RENT).toBe('6100');
  });

  it('ships migration 561 for category/account backfill', () => {
    const path = 'shared/sql/561_expense_category_gl_consistency.sql';
    expect(existsSync(resolve(repoRoot, path))).toBe(true);
    const sql = readRepo(path);
    expect(sql).toContain("WHEN 'OFFICE' THEN '6400'");
    expect(sql).toContain('Backfill expenses.category_id');
    expect(sql).toContain('Sync expenses.account_id');
    // Must not collide on display name when code differs (prod deploy failure)
    expect(sql).toContain('LOWER(ec.name) = LOWER(v.name)');
    expect(sql).not.toMatch(/INSERT INTO expense_categories[\s\S]*ON CONFLICT \(code\) DO NOTHING/);
  });

  it('create expense form sends categoryId with category code', () => {
    const form = readFileSync(
      resolve(clientSrc, 'components/expenses/CreateExpenseForm.tsx'),
      'utf8'
    );
    expect(form).toContain("setValue('categoryId'");
    expect(form).toContain('dbCategories.find');
  });

  it('expenses list filters by categoryId UUID', () => {
    const page = readFileSync(
      resolve(clientSrc, 'pages/accounting/ExpensesPage.tsx'),
      'utf8'
    );
    expect(page).toContain('categoryId: cat?.id');
    expect(page).toContain('value={cat.id}');
  });

  it('mark-paid shows balances and disables insufficient accounts', () => {
    const page = readFileSync(
      resolve(clientSrc, 'pages/accounting/ExpensesPage.tsx'),
      'utf8'
    );
    expect(page).toContain('currentBalance');
    expect(page).toContain('insufficient');
    expect(page).toContain('disabled={!canCover}');
  });

  it('payment accounts API includes CurrentBalance', () => {
    const repo = readRepo('SamplePOS.Server/src/repositories/expenseRepository.ts');
    expect(repo).toContain('CurrentBalance');
    expect(repo).toContain('hasFunds');
  });

  it('export uses detailed list without duplicate payment_method column', () => {
    const controller = readRepo('SamplePOS.Server/src/controllers/expenseController.ts');
    expect(controller).toContain('getExpenseDetailedList');
    expect(controller).toContain("'Payment Status'");
    expect(controller).toContain("'Payment Method'");
    // Old bug: payment_method written twice for Payment Status
    expect(controller).not.toMatch(/expense\.payment_method,\s*\n\s*expense\.payment_method/);
  });

  it('approval GL prefers DB-resolved expense account code', () => {
    const service = readRepo('SamplePOS.Server/src/services/expenseService.ts');
    expect(service).toContain('resolveExpenseGlAccountCode');
    expect(service).toContain('expenseAccountCode');

    const gl = readRepo('SamplePOS.Server/src/services/glEntryService.ts');
    expect(gl).toContain('expense.expenseAccountCode || mapExpenseCategoryToAccount');
  });
});
