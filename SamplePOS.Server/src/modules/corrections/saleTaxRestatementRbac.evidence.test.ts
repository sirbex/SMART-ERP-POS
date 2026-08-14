/**
 * Evidence + PROOF: sales.tax_restatement (Apply omitted VAT) RBAC matrix.
 *
 * Asserts allow/deny consistency across:
 *   SSOT helpers → seed filters → SQL grants → API requirePermission → UI gate
 *
 *   npm test -- --runInBand src/modules/corrections/saleTaxRestatementRbac.evidence.test.ts
 *
 * Emits: PROOF_SALE_TAX_RESTATEMENT_RBAC.md + .json (structural; no DB).
 */
import { afterAll, describe, expect, it } from '@jest/globals';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SALES_TAX_RESTATEMENT_DEFAULT_ROLES,
  SALES_TAX_RESTATEMENT_DENIED_DEFAULT_ROLES,
  SALES_TAX_RESTATEMENT_PERMISSION,
  evaluateTaxRestatementSeedProfile,
  isTaxRestatementDefaultRole,
  legacyUserRoleGrantsTaxRestatement,
} from '../../../../shared/authorization/saleTaxRestatementRbac.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repoRoot = path.resolve(serverRoot, '..');

type Gate = { id: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string): void {
  gates.push({ id, ok, detail });
  if (!ok) {
    // Fail the Jest assertion with a clear message while still collecting siblings.
    expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
  }
}

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

function fileHas(rel: string, re: RegExp): boolean {
  const p = path.join(repoRoot, rel);
  if (!existsSync(p)) return false;
  return re.test(readFileSync(p, 'utf8'));
}

describe('PROOF: Apply omitted VAT RBAC (sales.tax_restatement)', () => {
  it('SSOT seed profile: manager+accountant grant; cashier+waiter deny', () => {
    const profile = evaluateTaxRestatementSeedProfile();
    gate('SSOT_MANAGER', profile.manager === true, `manager=${profile.manager}`);
    gate('SSOT_ACCOUNTANT', profile.accountant === true, `accountant=${profile.accountant}`);
    gate('SSOT_CASHIER_DENY', profile.cashier === false, `cashier=${profile.cashier}`);
    gate('SSOT_WAITER_DENY', profile.waiter === false, `waiter=${profile.waiter}`);

    for (const role of SALES_TAX_RESTATEMENT_DEFAULT_ROLES) {
      gate(`ROLE_ALLOW_${role.replace(/\s+/g, '_')}`, isTaxRestatementDefaultRole(role), role);
    }
    for (const role of SALES_TAX_RESTATEMENT_DENIED_DEFAULT_ROLES) {
      gate(
        `ROLE_DENY_${role.replace(/\s+/g, '_')}`,
        isTaxRestatementDefaultRole(role) === false,
        role,
      );
    }
  });

  it('legacy users.role fallback: ADMIN/MANAGER yes; CASHIER/STAFF no', () => {
    gate('LEGACY_ADMIN', legacyUserRoleGrantsTaxRestatement('ADMIN'), 'ADMIN');
    gate('LEGACY_MANAGER', legacyUserRoleGrantsTaxRestatement('MANAGER'), 'MANAGER');
    gate('LEGACY_CASHIER', !legacyUserRoleGrantsTaxRestatement('CASHIER'), 'CASHIER deny');
    gate('LEGACY_STAFF', !legacyUserRoleGrantsTaxRestatement('STAFF'), 'STAFF deny');
  });

  it('catalog + migrations grant only default allow-list roles', () => {
    const key = SALES_TAX_RESTATEMENT_PERMISSION.replace('.', '\\.');
    gate(
      'PERM_CATALOG',
      fileHas('SamplePOS.Server/src/rbac/permissions.ts', new RegExp(key)),
      'permissions.ts catalogues key',
    );
    gate(
      'MIG_594',
      fileHas('shared/sql/594_sale_tax_restatement.sql', /Accountant/) &&
        fileHas('shared/sql/594_sale_tax_restatement.sql', /Manager/),
      '594 grants Manager + Accountant (+ admins)',
    );
    const heal = readRepo('shared/sql/596_sale_tax_restatement_manager_accountant_grant.sql');
    for (const role of SALES_TAX_RESTATEMENT_DEFAULT_ROLES) {
      gate(
        `MIG_596_${role.replace(/\s+/g, '_')}`,
        heal.toLowerCase().includes(`'${role}'`),
        `596 lists ${role}`,
      );
    }
    // Cashier/Waiter must not appear in heal allow list
    gate(
      'MIG_596_NO_CASHIER',
      !/['"]cashier['"]/.test(heal.toLowerCase().replace(/\s+/g, ' ')),
      '596 does not grant cashier',
    );
    gate(
      'MIG_596_NO_WAITER',
      !/['"]waiter['"]/.test(heal.toLowerCase().replace(/\s+/g, ' ')),
      '596 does not grant waiter',
    );
  });

  it('API routes enforce sales.tax_restatement on preview and execute', () => {
    const routes = readRepo('SamplePOS.Server/src/modules/sales/salesRoutes.ts');
    const previewBlock = routes.slice(
      routes.indexOf("'/tax-restatement/preview'"),
      routes.indexOf("'/tax-restatement/preview'") + 280,
    );
    const executeBlock = routes.slice(
      routes.indexOf("'/tax-restatement/execute'"),
      routes.indexOf("'/tax-restatement/execute'") + 280,
    );
    gate(
      'API_PREVIEW',
      /requirePermission\('sales\.tax_restatement'\)/.test(previewBlock),
      'preview requires sales.tax_restatement',
    );
    gate(
      'API_EXECUTE',
      /requirePermission\('sales\.tax_restatement'\)/.test(executeBlock),
      'execute requires sales.tax_restatement',
    );
  });

  it('UI gates Apply omitted VAT on sales.tax_restatement only', () => {
    const page = readRepo('samplepos.client/src/pages/SalesPage.tsx');
    gate(
      'UI_HOOK',
      /useBackendPermission\('sales\.tax_restatement'\)/.test(page) ||
        /useBackendPermission\("sales\.tax_restatement"\)/.test(page),
      'SalesPage uses useBackendPermission(sales.tax_restatement)',
    );
    gate(
      'UI_BUTTON',
      /canRestateTax/.test(page) && /Apply omitted VAT/.test(page),
      'button gated by canRestateTax',
    );
    // Must not soft-open on sales.update alone
    const buttonZone = page.slice(
      page.indexOf('canRestateTax'),
      page.indexOf('Apply omitted VAT') + 40,
    );
    gate(
      'UI_NOT_SALES_UPDATE',
      !/sales\.update/.test(buttonZone),
      'button not gated on sales.update alone',
    );
  });

  it('client legacy map includes tax_restatement → EDIT_SALES (manager fallback)', () => {
    const hook = readRepo('samplepos.client/src/hooks/useBackendPermission.ts');
    gate(
      'CLIENT_LEGACY_MAP',
      /['"]sales\.tax_restatement['"]\s*:\s*Permission\.EDIT_SALES/.test(hook),
      'BACKEND_TO_LEGACY maps tax_restatement',
    );
  });

  it('seed + tenant seed deny Sales Rep privileged tax restatement', () => {
    const seed = readRepo('SamplePOS.Server/src/rbac/seed.ts');
    const tenant = readRepo('SamplePOS.Server/src/modules/platform/tenantService.ts');
    gate(
      'SEED_REP_DENY',
      /sales\.tax_restatement/.test(seed) && /salesRepDeniedSalesKeys|Sales Representative/.test(seed),
      'seed excludes tax_restatement from Sales Rep',
    );
    gate(
      'TENANT_REP_DENY',
      /Sales Representative[\s\S]{0,400}sales\.tax_restatement/.test(tenant),
      'tenantService excludes tax_restatement from Sales Rep',
    );
  });

  it('live RBAC proof script present', () => {
    gate(
      'LIVE_SCRIPT',
      existsSync(
        path.join(serverRoot, 'scripts/proof-sale-tax-restatement-rbac-live.ts'),
      ),
      'proof-sale-tax-restatement-rbac-live.ts exists',
    );
  });
});

afterAll(() => {
  const pass = gates.filter((g) => g.ok).length;
  const fail = gates.filter((g) => !g.ok).length;
  const verdict = fail === 0 ? 'PASS' : 'FAIL';
  const at = new Date().toISOString();
  const evidence = {
    at,
    permission: SALES_TAX_RESTATEMENT_PERMISSION,
    allowRoles: [...SALES_TAX_RESTATEMENT_DEFAULT_ROLES],
    denyRoles: [...SALES_TAX_RESTATEMENT_DENIED_DEFAULT_ROLES],
    seedProfile: evaluateTaxRestatementSeedProfile(),
    gates,
    summary: { pass, fail, total: gates.length, verdict },
  };

  const md = `# PROOF — Sale tax restatement RBAC (omitted VAT permissions)

**Generated:** ${at}  
**Verdict:** **${verdict}** (${pass}/${gates.length} gates)  
**Permission:** \`${SALES_TAX_RESTATEMENT_PERMISSION}\`

## Allow (default system roles)

${SALES_TAX_RESTATEMENT_DEFAULT_ROLES.map((r) => `- ${r}`).join('\n')}

## Deny (default system roles)

${SALES_TAX_RESTATEMENT_DENIED_DEFAULT_ROLES.map((r) => `- ${r}`).join('\n')}

## Seed profile (SSOT functions)

| Profile | Grants? |
|---------|---------|
| Manager | ${evaluateTaxRestatementSeedProfile().manager ? 'YES' : 'NO'} |
| Accountant | ${evaluateTaxRestatementSeedProfile().accountant ? 'YES' : 'NO'} |
| Cashier | ${evaluateTaxRestatementSeedProfile().cashier ? 'YES' : 'NO'} |
| Waiter | ${evaluateTaxRestatementSeedProfile().waiter ? 'YES' : 'NO'} |

## Gates

| Gate | Result | Detail |
|------|--------|--------|
${gates.map((g) => `| \`${g.id}\` | ${g.ok ? 'PASS' : 'FAIL'} | ${g.detail.replace(/\|/g, '\\|')} |`).join('\n')}

## Re-run

\`\`\`bash
cd SamplePOS.Server
npm test -- --runInBand src/modules/corrections/saleTaxRestatementRbac.evidence.test.ts
npx tsx scripts/proof-sale-tax-restatement-rbac-live.ts
\`\`\`
`;

  writeFileSync(path.join(repoRoot, 'PROOF_SALE_TAX_RESTATEMENT_RBAC.json'), JSON.stringify(evidence, null, 2));
  writeFileSync(path.join(repoRoot, 'PROOF_SALE_TAX_RESTATEMENT_RBAC.md'), md);
});
