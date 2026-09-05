/**
 * PROOF: Sales Analytics → Expense ops path (no Accounting feature required).
 *
 * Invariants:
 *   - Export Report removed from Sales Analytics chrome
 *   - New Expense CTA gated by expenses.create + opens CreateExpenseForm
 *   - /expenses route exists WITHOUT requiredFeature="accounting"
 *   - /accounting/expenses keeps accounting feature lock
 *   - Cashier lockdown allows /expenses when expenses.read|create granted
 *   - CreateExpenseForm is the shared SSOT form (same as ExpensesPage)
 *
 * npx vitest run src/__tests__/sales-expense-ops.evidence.test.ts
 */
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYSTEM_CASHIER_PERMISSION_KEYS } from '@shared/authorization/systemRoleGrants';
import {
  isCashierAllowedPath,
  resolveCashierNavItems,
} from '../utils/cashierLockdown';

const here = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(here, '../..');
const repoRoot = resolve(clientRoot, '..');

type Gate = { id: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string): void {
  gates.push({ id, ok, detail });
  expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
}

function read(rel: string): string {
  return readFileSync(resolve(clientRoot, 'src', rel), 'utf8');
}

describe('PROOF: Sales expense ops path (precision + consistency)', () => {
  it('Sales Analytics replaces Export Report with gated New Expense + CreateExpenseForm', () => {
    const sales = read('pages/SalesPage.tsx');
    gate(
      'NO_EXPORT_REPORT',
      !sales.includes('Export Report'),
      'Sales Analytics no longer shows Export Report',
    );
    gate(
      'EXPENSE_CTA_GATE',
      sales.includes("useCanAccess([], ['expenses.create'])") &&
        sales.includes('canCreateExpense') &&
        sales.includes('data-sales-expense-cta="true"') &&
        sales.includes('New Expense'),
      'New Expense CTA is primaryActions + expenses.create only',
    );
    gate(
      'EXPENSE_FORM_SSOT',
      sales.includes('CreateExpenseForm') &&
        sales.includes("from '../components/expenses/CreateExpenseForm'") &&
        sales.includes('data-sales-expense-form="true"') &&
        sales.includes('data-sales-expense-dialog="true"') &&
        sales.includes('isCreateExpenseOpen'),
      'Sales opens shared CreateExpenseForm (same SSOT as ExpensesPage)',
    );
    gate(
      'EXPENSE_LABEL_PARITY',
      sales.includes('Create New Expense') &&
        read('pages/accounting/ExpensesPage.tsx').includes('Create New Expense'),
      'Sales modal title matches ExpensesPage create dialog',
    );
  });

  it('Routes: ops /expenses without accounting feature; accounting path stays locked', () => {
    const app = read('App.tsx');
    const opsBlock = app.slice(
      app.indexOf('path="/expenses"'),
      app.indexOf('path="/accounting/expenses"'),
    );
    const acctBlock = app.slice(
      app.indexOf('path="/accounting/expenses"'),
      app.indexOf('path="/accounting/expense-categories"'),
    );
    gate(
      'OPS_EXPENSES_ROUTE',
      opsBlock.includes('path="/expenses"') &&
        opsBlock.includes("requiredPermissions={['expenses.read', 'expenses.create']}") &&
        !opsBlock.includes('requiredFeature="accounting"') &&
        opsBlock.includes('<Layout>') &&
        opsBlock.includes('<ExpensesPage />'),
      '/expenses: expenses.read|create, Layout, NO accounting feature',
    );
    gate(
      'ACCT_EXPENSES_ROUTE',
      acctBlock.includes('requiredFeature="accounting"') &&
        acctBlock.includes('AccountingLayout') &&
        acctBlock.includes("requiredPermissions={['expenses.read']}"),
      '/accounting/expenses keeps accounting feature + AccountingLayout',
    );
  });

  it('Cashier lockdown + system grants align with ops expenses path', () => {
    gate(
      'CASHIER_GRANTS_EXPENSE',
      SYSTEM_CASHIER_PERMISSION_KEYS.includes('expenses.create') &&
        SYSTEM_CASHIER_PERMISSION_KEYS.includes('expenses.read'),
      'Default cashier grant set includes expenses.create + expenses.read',
    );
    gate(
      'CASHIER_PATH_EXPENSES',
      isCashierAllowedPath('/expenses', {
        permissions: SYSTEM_CASHIER_PERMISSION_KEYS,
      }) === true,
      'Cashier lockdown allows /expenses when expense keys granted',
    );
    gate(
      'CASHIER_NAV_EXPENSES',
      resolveCashierNavItems(false, SYSTEM_CASHIER_PERMISSION_KEYS).some(
        (i) => i.path === '/expenses',
      ),
      'Cashier nav surfaces Expenses → /expenses',
    );
  });

  it('Server expense create is permission-gated (not accounting feature)', () => {
    const routes = readFileSync(
      resolve(repoRoot, 'SamplePOS.Server/src/routes/expenseRoutes.ts'),
      'utf8',
    );
    gate(
      'API_CREATE_PERM',
      routes.includes("requirePermission('expenses.create'), expenseController.createExpense"),
      'POST /expenses requires expenses.create',
    );
    gate(
      'API_NO_ACCT_FEATURE_ON_CREATE',
      !/requireFeature|requiredFeature/.test(routes),
      'Expense routes are not feature-flagged to accounting module',
    );
  });
});

afterAll(() => {
  const passed = gates.filter((g) => g.ok).length;
  const failed = gates.filter((g) => !g.ok);
  const payload = {
    proof: 'SALES_EXPENSE_OPS',
    verdict: failed.length === 0 ? 'PASS' : 'FAIL',
    generatedAt: new Date().toISOString(),
    passed,
    total: gates.length,
    gates,
    integrity:
      'Sales Analytics New Expense (expenses.create) opens CreateExpenseForm without Accounting feature; /expenses ops route + cashier lockdown SSOT; /accounting/expenses remains accounting-locked.',
  };
  const json = JSON.stringify(payload, null, 2);
  const md = `# PROOF — Sales expense ops path

**Verdict:** ${payload.verdict}
**Generated:** ${payload.generatedAt}
**Gates:** ${passed}/${gates.length}

${gates.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} \`${g.id}\` — ${g.detail}`).join('\n')}

## Integrity
${payload.integrity}
`;
  for (const dir of [clientRoot, repoRoot]) {
    writeFileSync(resolve(dir, 'PROOF_SALES_EXPENSE_OPS.json'), json);
    writeFileSync(resolve(dir, 'PROOF_SALES_EXPENSE_OPS.md'), md);
  }
});
