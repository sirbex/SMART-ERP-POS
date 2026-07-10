#!/usr/bin/env node
/**
 * Proof — Authorization refactor (Phases 0–3+)
 *
 * Runs static structural gates + unit/integration test suites per phase.
 *
 *   npm run proof:authorization-phases
 *   PROOF_OUT=PROOF_AUTHORIZATION_PHASES.md npm run proof:authorization-phases
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = resolve(root, 'SamplePOS.Server');
const clientDir = resolve(root, 'samplepos.client');
const OUT = process.env.PROOF_OUT || resolve(root, 'PROOF_AUTHORIZATION_PHASES.md');

let pass = 0;
let fail = 0;
const lines = [];
const testRuns = [];

function ok(name, detail = '') {
  pass++;
  const msg = detail ? `${name} — ${detail}` : name;
  console.log(`  PASS  ${msg}`);
  lines.push(`- **PASS** ${msg}`);
}

function bad(name, detail = '') {
  fail++;
  const msg = detail ? `${name} — ${detail}` : name;
  console.error(`  FAIL  ${msg}`);
  lines.push(`- **FAIL** ${msg}`);
}

function assert(cond, name, detail = '') {
  if (cond) ok(name, detail);
  else bad(name, detail);
}

function read(rel) {
  const p = resolve(root, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

function fileExists(rel) {
  return existsSync(resolve(root, rel));
}

function fileContains(rel, needle) {
  return read(rel).includes(needle);
}

function fileNotContains(rel, needle) {
  return !fileContains(rel, needle);
}

function fileMatches(rel, re) {
  return re.test(read(rel));
}

function grepCount(rel, re) {
  const text = read(rel);
  if (!text) return 0;
  const m = text.match(re);
  return m ? m.length : 0;
}

function runTests(cwd, label, pattern, runner = 'jest') {
  console.log(`\n▶ ${label}`);
  const cmd =
    runner === 'vitest'
      ? ['npm', 'test', '--', 'run', ...pattern.split(/\s+/).filter(Boolean)]
      : ['npm', 'test', '--', ...pattern.split(/\s+/).filter(Boolean)];

  const result = spawnSync(cmd[0], cmd.slice(1), {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const suiteMatch = output.match(/Test Suites:\s+(\d+)\s+passed,\s*(\d+)\s+total/);
  const testMatch = output.match(/Tests:\s+(\d+)\s+passed,\s*(\d+)\s+total/);
  const vitestFileMatch = output.match(/Test Files\s+(\d+)\s+passed\s+\((\d+)\)/);
  const vitestTestMatch = output.match(/Tests\s+(\d+)\s+passed\s+\((\d+)\)/);

  const suitesPassed = suiteMatch ? Number(suiteMatch[1]) : vitestFileMatch ? Number(vitestFileMatch[1]) : null;
  const testsPassed = testMatch ? Number(testMatch[1]) : vitestTestMatch ? Number(vitestTestMatch[1]) : null;

  const success = result.status === 0;
  testRuns.push({
    label,
    pattern,
    success,
    suitesPassed,
    testsPassed,
    exitCode: result.status ?? 1,
  });

  if (success) {
    ok(label, testsPassed != null ? `${testsPassed} tests passed` : 'exit 0');
  } else {
    bad(label, `exit ${result.status ?? 1}`);
    if (output.trim()) {
      const tail = output.trim().split('\n').slice(-15).join('\n');
      lines.push('```\n' + tail + '\n```');
    }
  }
  return success;
}

// ─── Phase 0: Foundation ───────────────────────────────────────────────────
console.log('\n══ Phase 0 — Foundation (shared + AuthorizationService) ══');

assert(fileExists('shared/authorization/legacyRoleFallback.ts'), 'Phase 0', 'shared legacyRoleFallback SSOT exists');
assert(fileExists('shared/authorization/permissionEvaluation.ts'), 'Phase 0', 'shared permissionEvaluation exists');
assert(fileExists('SamplePOS.Server/src/authorization/authorizationService.ts'), 'Phase 0', 'server AuthorizationService exists');
assert(fileExists('samplepos.client/src/authorization/authorizationService.ts'), 'Phase 0', 'client AuthorizationService exists');
assert(
  fileContains('SamplePOS.Server/src/middleware/auth.ts', 'loadAuthorizationContext'),
  'Phase 0',
  'authenticate wires loadAuthorizationContext'
);
assert(
  fileContains('SamplePOS.Server/src/rbac/middleware.ts', 'legacyRoleGrantsPermission'),
  'Phase 0',
  'RBAC middleware uses shared legacy fallback'
);

// ─── Phase 1: Server services ──────────────────────────────────────────────
console.log('\n══ Phase 1 — Server services ══');

assert(
  fileNotContains('SamplePOS.Server/src/modules/sales/salesRepository.ts', 'isManager'),
  'Phase 1',
  'salesRepository.isManager removed'
);
assert(
  fileContains('SamplePOS.Server/src/modules/sales/salesService.ts', 'assertUserPermission'),
  'Phase 1',
  'salesService uses assertUserPermission'
);
assert(
  fileContains('SamplePOS.Server/src/modules/discounts/discountService.ts', 'discountPolicy'),
  'Phase 1',
  'discountService uses discountPolicy'
);
assert(
  fileContains('SamplePOS.Server/src/modules/delivery/deliveryService.ts', 'userHasPermission'),
  'Phase 1',
  'deliveryService uses userHasPermission'
);
assert(fileExists('SamplePOS.Server/src/authorization/serviceAuth.ts'), 'Phase 1', 'serviceAuth helper exists');

// ─── Phase 2: Routes + policies ────────────────────────────────────────────
console.log('\n══ Phase 2 — Routes + policies ══');

assert(
  fileContains('SamplePOS.Server/src/modules/sales/salesRoutes.ts', 'salesPolicy'),
  'Phase 2',
  'salesRoutes imports salesPolicy'
);
assert(
  fileNotContains('SamplePOS.Server/src/modules/sales/salesRoutes.ts', 'legacyRoleGrantsSalesPermission'),
  'Phase 2',
  'salesRoutes local legacy map removed'
);
assert(
  fileContains('SamplePOS.Server/src/authorization/documentPermissionMiddleware.ts', 'requireDocumentPdfPermission'),
  'Phase 2',
  'document PDF permission middleware exists'
);
assert(
  fileContains('SamplePOS.Server/src/services/glReconciliationService.ts', 'accounting.period_manage'),
  'Phase 2',
  'GL advisor lock uses accounting.period_manage'
);
assert(
  fileContains('SamplePOS.Server/src/modules/grir-clearing/grirClearingRoutes.ts', 'accounting.reconcile'),
  'Phase 2',
  'GR/IR clearing routes permission-gated'
);

// ─── Phase 3: Client + cleanup ─────────────────────────────────────────────
console.log('\n══ Phase 3+ — Client + cleanup ══');

assert(
  grepCount('samplepos.client/src/App.tsx', /requiredRoles=\{/) === 0,
  'Phase 3',
  'App.tsx has zero requiredRoles usages'
);
assert(
  fileContains('samplepos.client/src/pages/pos/POSPage.tsx', 'useDiscountLimitPercent'),
  'Phase 3',
  'POSPage uses useDiscountLimitPercent'
);
assert(
  fileNotContains('samplepos.client/src/components/pos/DiscountDialog.tsx', 'ROLE_LIMITS'),
  'Phase 3',
  'DiscountDialog ROLE_LIMITS removed'
);
assert(
  fileContains('samplepos.client/src/pages/SalesPage.tsx', 'shouldRestrictSalesToOwnUser'),
  'Phase 3',
  'SalesPage uses shouldRestrictSalesToOwnUser'
);
assert(
  fileContains('samplepos.client/src/pages/settings/QuickLoginSettings.tsx', "useHasPermission('system.update')"),
  'Phase 3',
  'QuickLoginSettings uses system.update'
);
assert(
  fileNotContains('SamplePOS.Server/src/middleware/auth.ts', 'export function requirePermission'),
  'Phase 3',
  'legacy auth.ts requirePermission stub removed'
);
assert(
  fileContains('SamplePOS.Server/src/services/sessionService.ts', 'buildAuthorizationContext'),
  'Phase 3',
  'sessionService loads RBAC permissions'
);
assert(
  !fileExists('samplepos.client/src/stores/authStore.ts'),
  'Phase 3',
  'deprecated authStore.ts deleted'
);

// Business role-name gates (should be absent outside infra/display)
const clientRoleBusiness = [
  'samplepos.client/src/pages/inventory/ProductsPage.tsx',
  'samplepos.client/src/pages/inventory/StockLevelsPage.tsx',
  'samplepos.client/src/pages/settings/SettingsPage.tsx',
  'samplepos.client/src/hooks/useFinancialControlAccess.ts',
  'samplepos.client/src/pages/AdminDataManagementPage.tsx',
].filter((rel) => fileMatches(rel, /user\?\.role\s*===\s*['"]ADMIN['"]|user\?\.role\s*===\s*['"]MANAGER['"]|user\?\.role\s*===\s*['"]CASHIER['"]/));

assert(
  clientRoleBusiness.length === 0,
  'Phase 3',
  clientRoleBusiness.length
    ? `business role checks remain in: ${clientRoleBusiness.join(', ')}`
    : 'no ADMIN/MANAGER/CASHIER business checks in migrated client pages'
);

// ─── Automated test suites ───────────────────────────────────────────────────
console.log('\n══ Automated test suites ══');

runTests(
  serverDir,
  'Phase 0 tests — authorizationService + shared policies',
  'authorization discountPolicy documentPolicy serviceAuth'
);
runTests(serverDir, 'Phase 2 tests — salesRoutes.rbacPolicy', 'salesRoutes.rbacPolicy');
runTests(serverDir, 'Phase 2 tests — salesRoutes.security', 'salesRoutes.security');
runTests(serverDir, 'Phase 2 tests — glReconciliationService.auth', 'glReconciliationService.auth');
runTests(clientDir, 'Phase 0/3 client — authorizationService', 'authorizationService', 'vitest');
runTests(clientDir, 'Phase 3 client — warehouseRbac', 'warehouseRbac', 'vitest');

// ─── Report ──────────────────────────────────────────────────────────────────
const totalTests = testRuns.reduce((n, r) => n + (r.testsPassed ?? 0), 0);
const allTestsGreen = testRuns.every((r) => r.success);

const md = [
  '# Authorization Phases — Proof Run',
  '',
  `**Generated:** ${new Date().toISOString()}`,
  '',
  '## Summary',
  '',
  `| Metric | Value |`,
  `|--------|-------|`,
  `| Static checks passed | ${pass - testRuns.filter((r) => r.success).length} / ${pass + fail - testRuns.length + testRuns.filter((r) => r.success).length} |`,
  `| Test suites executed | ${testRuns.length} |`,
  `| Test suites passed | ${testRuns.filter((r) => r.success).length} |`,
  `| Individual tests passed | ${totalTests} |`,
  `| Overall | ${fail === 0 && allTestsGreen ? '**PASS**' : '**FAIL**'} |`,
  '',
  '## Phase map',
  '',
  '| Phase | Scope | Proof |',
  '|-------|-------|-------|',
  '| **0** | Shared module, AuthorizationService, auth context wiring | Static + `authorization` + `serviceAuth` + client `authorizationService` |',
  '| **1** | Server services (discount, sales, delivery) | Static + `discountPolicy` + `serviceAuth` |',
  '| **2** | Routes, sales/document/GL policies | Static + `salesRoutes.rbacPolicy` + `salesRoutes.security` + `documentPolicy` |',
  '| **3+** | Client UI, session cleanup, legacy removal | Static + client `warehouseRbac` + App route audit |',
  '',
  '## Static checks',
  '',
  ...lines,
  '',
  '## Test runs',
  '',
  ...testRuns.map(
    (r) =>
      `- ${r.success ? '**PASS**' : '**FAIL**'} \`${r.label}\` — pattern: \`${r.pattern}\`${r.testsPassed != null ? ` (${r.testsPassed} tests)` : ''}`
  ),
  '',
  '## Re-run',
  '',
  '```bash',
  'npm run proof:authorization-phases',
  '```',
  '',
  'Or manually:',
  '',
  '```bash',
  'cd SamplePOS.Server && npm test -- authorization discountPolicy documentPolicy serviceAuth salesRoutes.rbacPolicy salesRoutes.security glReconciliationService.auth',
  'cd samplepos.client && npm test -- run authorizationService warehouseRbac',
  '```',
  '',
].join('\n');

writeFileSync(OUT, md, 'utf8');

console.log('\n════════════════════════════════════════');
console.log(`Static + tests: ${fail === 0 ? 'PASS' : 'FAIL'} (${pass} pass, ${fail} fail)`);
console.log(`Tests executed: ${totalTests} individual tests across ${testRuns.length} suites`);
console.log(`Report: ${OUT}`);
console.log('════════════════════════════════════════\n');

process.exit(fail === 0 && allTestsGreen ? 0 : 1);
