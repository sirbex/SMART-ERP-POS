/**
 * PROOF: Apply omitted VAT button permission wiring (client + shared SSOT)
 * Runner: npx vitest run src/__tests__/sale-tax-restatement-rbac.proof.test.ts
 */
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SALES_TAX_RESTATEMENT_DEFAULT_ROLES,
  SALES_TAX_RESTATEMENT_PERMISSION,
  evaluateTaxRestatementSeedProfile,
  legacyUserRoleGrantsTaxRestatement,
} from '../../../shared/authorization/saleTaxRestatementRbac';
import { hasPermission, Permission } from '../utils/rolePermissions';

const here = dirname(fileURLToPath(import.meta.url));
const results: string[] = [];

function pass(label: string) {
  results.push(`- PASS ${label}`);
}

function readClient(rel: string): string {
  return readFileSync(join(here, '..', rel), 'utf8');
}

function readRepo(rel: string): string {
  return readFileSync(resolve(here, '../../..', rel), 'utf8');
}

describe('PROOF: Omitted VAT sales.tax_restatement permissions', () => {
  it('SSOT allow/deny matrix', () => {
    const p = evaluateTaxRestatementSeedProfile();
    expect(p.manager).toBe(true);
    expect(p.accountant).toBe(true);
    expect(p.cashier).toBe(false);
    expect(p.waiter).toBe(false);
    expect(SALES_TAX_RESTATEMENT_DEFAULT_ROLES).toContain('manager');
    expect(SALES_TAX_RESTATEMENT_DEFAULT_ROLES).toContain('accountant');
    expect(SALES_TAX_RESTATEMENT_DEFAULT_ROLES).toContain('administrator');
    pass('SSOT seed profile matrix');
  });

  it('legacy role fallback matches manager/admin only', () => {
    expect(legacyUserRoleGrantsTaxRestatement('ADMIN')).toBe(true);
    expect(legacyUserRoleGrantsTaxRestatement('MANAGER')).toBe(true);
    expect(legacyUserRoleGrantsTaxRestatement('CASHIER')).toBe(false);
    expect(legacyUserRoleGrantsTaxRestatement('STAFF')).toBe(false);
    // EDIT_SALES is manager/admin only in ROLE_PERMISSIONS — maps tax_restatement
    expect(hasPermission('MANAGER', Permission.EDIT_SALES)).toBe(true);
    expect(hasPermission('CASHIER', Permission.EDIT_SALES)).toBe(false);
    expect(hasPermission('STAFF', Permission.EDIT_SALES)).toBe(false);
    expect(hasPermission('ADMIN', Permission.EDIT_SALES)).toBe(true);
    pass('legacy fallback ADMIN/MANAGER only');
  });

  it('SalesPage + hook wiring', () => {
    const page = readClient('pages/SalesPage.tsx');
    expect(page).toMatch(/useBackendPermission\(['"]sales\.tax_restatement['"]\)/);
    expect(page).toMatch(/canRestateTax/);
    expect(page).toMatch(/Apply omitted VAT/);

    const hook = readClient('hooks/useBackendPermission.ts');
    expect(hook).toMatch(/sales\.tax_restatement/);
    expect(hook).toMatch(/Permission\.EDIT_SALES/);
    pass('UI + client legacy map');
  });

  it('API requirePermission and heal SQL align with SSOT key', () => {
    const routes = readRepo('SamplePOS.Server/src/modules/sales/salesRoutes.ts');
    expect(routes).toMatch(/tax-restatement\/preview[\s\S]{0,200}sales\.tax_restatement/);
    expect(routes).toMatch(/tax-restatement\/execute[\s\S]{0,200}sales\.tax_restatement/);

    const heal = readRepo('shared/sql/596_sale_tax_restatement_manager_accountant_grant.sql');
    expect(heal).toContain(SALES_TAX_RESTATEMENT_PERMISSION);
    for (const role of SALES_TAX_RESTATEMENT_DEFAULT_ROLES) {
      expect(heal.toLowerCase()).toContain(`'${role}'`);
    }
    pass('API + SQL heal allow-list');
  });
});

afterAll(() => {
  const body = [
    '# PROOF: Omitted VAT (sales.tax_restatement) client RBAC',
    '',
    `- Date: ${new Date().toISOString()}`,
    '- Runner: `npx vitest run src/__tests__/sale-tax-restatement-rbac.proof.test.ts`',
    '',
    '## Results',
    ...results,
    '',
    '## Verdict',
    results.length >= 4
      ? '**PASS** — manager/admin/accountant SSOT; cashier deny; UI/API/SQL aligned.'
      : '**FAIL** — incomplete.',
    '',
  ].join('\n');
  writeFileSync(resolve(here, '../../../PROOF_SALE_TAX_RESTATEMENT_RBAC_CLIENT.md'), body, 'utf8');
});
