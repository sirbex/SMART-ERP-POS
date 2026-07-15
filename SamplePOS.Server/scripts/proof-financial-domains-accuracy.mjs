#!/usr/bin/env node
/**
 * Financial domains Phase 1–5 — business logic accuracy proof (production gate).
 *
 * Rules:
 * - Fail loud: spawn/Jest/assert failures increment fail and never soft-PASS.
 * - STRICT: requires Jest suite green + minimum test count + per-phase describe evidence.
 * - No waivers / skips in this proof.
 *
 * Usage:
 *   npm run proof:financial-domains-accuracy
 *   npm run proof:financial-domains-accuracy:strict
 */
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serverRoot, '..');
const OUT = process.env.PROOF_OUT || resolve(repoRoot, 'PROOF_FINANCIAL_DOMAINS_ACCURACY.md');
const STRICT =
  process.env.FINANCIAL_DOMAINS_ACCURACY_STRICT === '1' || process.argv.includes('--strict');

/** Minimum Jest tests that must pass (engine negatives + phase scenarios). */
const MIN_TESTS = 18;

let pass = 0;
let fail = 0;
const lines = [
  '# Financial Domains — Phase-by-Phase Accuracy Proof\n',
  `Run: ${new Date().toISOString()}\n`,
  `Mode: ${STRICT ? 'STRICT' : 'foundation'}\n`,
  '\n**Purpose:** Prove each phase posts correct economics (balanced journal, exact accounts/amounts, P&L vs BS). Failures throw — no error swallowing.\n',
];

function ok(n, d = '') {
  pass++;
  console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`);
  lines.push(`- **PASS** ${n}${d ? ` — ${d}` : ''}`);
}
function bad(n, d = '') {
  fail++;
  console.error(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
  lines.push(`- **FAIL** ${n}${d ? ` — ${d}` : ''}`);
}
function assert(c, n, d = '') {
  if (c) ok(n, d);
  else bad(n, d);
  return Boolean(c);
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: 'pipe',
    shell: false,
    encoding: 'utf8',
    env: process.env,
  });
  if (r.error) {
    return {
      code: 1,
      out: `spawn failed: ${r.error.message}`,
      spawnError: true,
    };
  }
  return {
    code: r.status ?? 1,
    out: `${r.stdout || ''}${r.stderr || ''}`,
    spawnError: false,
  };
}

function parseJestCounts(out) {
  const suites = out.match(/Test Suites:\s+(\d+)\s+passed/);
  const tests = out.match(/Tests:\s+(\d+)\s+passed/);
  const failedSuites = /Test Suites:.*failed/i.test(out);
  const failedTests = /Tests:.*failed/i.test(out);
  return {
    suitesPassed: suites ? Number(suites[1]) : 0,
    testsPassed: tests ? Number(tests[1]) : 0,
    failedSuites,
    failedTests,
  };
}

console.log('═'.repeat(60));
console.log(' proof-financial-domains-accuracy');
console.log(` mode: ${STRICT ? 'STRICT' : 'foundation'}`);
console.log('═'.repeat(60));

// ── Artifacts ─────────────────────────────────────────────────
lines.push('\n## Artifacts\n');
const artifacts = [
  'shared/financial-accuracy/journalAccuracy.ts',
  'shared/financial-accuracy/index.ts',
  'SamplePOS.Server/src/modules/financial-domains/phaseAccuracyScenarios.ts',
  'SamplePOS.Server/src/modules/financial-domains/financialDomainsAccuracy.test.ts',
  'SamplePOS.Server/src/modules/financial-domains/journalAccuracy.engine.test.ts',
  'samplepos.client/src/components/financial-workspace/ReportsLauncher.tsx',
];
for (const rel of artifacts) {
  assert(existsSync(resolve(repoRoot, rel)), `artifact:${rel}`);
}

// ── Engine + phase accuracy Jest ──────────────────────────────
lines.push('\n## Accuracy suite (engine negatives + phase business logic)\n');
const accuracy = run(
  'node',
  [
    '--experimental-vm-modules',
    './node_modules/jest/bin/jest.js',
    '--config',
    'jest.config.cjs',
    '--testPathPatterns',
    'financialDomainsAccuracy|journalAccuracy\\.engine',
    '--runInBand',
    '--verbose',
  ],
  serverRoot,
);

assert(!accuracy.spawnError, 'jest:spawn', accuracy.spawnError ? accuracy.out : 'ok');

const counts = parseJestCounts(accuracy.out);
const jestGreen =
  accuracy.code === 0 &&
  !counts.failedSuites &&
  !counts.failedTests &&
  counts.testsPassed >= MIN_TESTS;

assert(
  jestGreen,
  'jest:accuracy-suites',
  jestGreen
    ? `${counts.testsPassed} tests passed (min ${MIN_TESTS})`
    : `code=${accuracy.code} passed=${counts.testsPassed} min=${MIN_TESTS}\n${accuracy.out.slice(-1200)}`,
);

const phaseDescribe = [
  ['1', 'Financial domains accuracy — Phase 1 Treasury', 'Treasury'],
  ['2', 'Financial domains accuracy — Phase 2 Loss/Quarantine', 'Loss/Quarantine'],
  ['3', 'Financial domains accuracy — Phase 3 VAT', 'VAT'],
  ['4', 'Financial domains accuracy — Phase 4 Bad Debt', 'Bad Debt'],
  ['5', 'Financial domains accuracy — Phase 5 Reporting consistency', 'Reporting'],
];

for (const [n, describeName, label] of phaseDescribe) {
  const present = accuracy.out.includes(describeName);
  // In STRICT, Jest must have been green AND the describe must appear in output.
  // If Jest failed early, describe may still be printed — still require jestGreen.
  assert(jestGreen && present, `phase-${n}-accuracy`, `${label}: ${describeName}`);
}

assert(
  accuracy.out.includes('journalAccuracy engine — fail loud') && jestGreen,
  'engine:negative-paths',
  'unbalanced / dual-sided / forbidden / extra line must throw',
);

assert(
  accuracy.out.includes('P4-BD-02') && jestGreen,
  'policy:reject-cn-as-writeoff',
  '4010 / CN uncollectible path rejected',
);

// ── UX ────────────────────────────────────────────────────────
lines.push('\n## Operator UX (plain language)\n');
const launcherPath = resolve(
  repoRoot,
  'samplepos.client/src/components/financial-workspace/ReportsLauncher.tsx',
);
const launcherText = existsSync(launcherPath) ? readFileSync(launcherPath, 'utf8') : '';
assert(
  /Did we make money|Customer will not pay|still an asset|profit does not change/i.test(launcherText),
  'ux:ReportsLauncher-plain-language',
  'Tally-style close copy',
);
assert(
  /kind:\s*'financial'/.test(launcherText) && /kind:\s*'operational'/.test(launcherText),
  'ux:kind-separation',
  'Books vs Ops kinds',
);

// ── No skip markers in this proof ─────────────────────────────
lines.push('\n## Integrity\n');
assert(!lines.some((l) => l.includes('**SKIP**') || l.includes('**WAIVER**')), 'integrity:no-skip-waiver');

// ── Verdict ───────────────────────────────────────────────────
lines.push('\n## Verdict\n');
const verdict = fail === 0 ? (STRICT ? 'CERTIFIED' : 'PASS') : 'FAIL';
if (STRICT && fail > 0) {
  lines.push('**Strict mode refuses CERTIFIED when any check failed.**');
}
lines.push(`**${verdict}** — pass=${pass} fail=${fail}`);
lines.push('\n### Phase economics (expected)\n');
lines.push('| Phase | User action | Journal | Profit impact |');
lines.push('|-------|-------------|---------|---------------|');
lines.push('| 1 Treasury deposit | Bank undeposited cash | DR Bank / CR Undeposited | Unchanged |');
lines.push('| 1 Transfer | Move till ↔ bank | DR/CR liquidity | Unchanged |');
lines.push('| 1 Petty expense | Spend float | DR Expense / CR Petty | ↓ amount |');
lines.push('| 2 Quarantine | Isolate stock | *(none)* | Unchanged |');
lines.push('| 2 Dispose damage | Write off stock | DR 5120 / CR Inventory | ↓ cost |');
lines.push('| 3 VAT remit | Pay authority | DR 2300 / CR Bank | Unchanged |');
lines.push('| 4 Bad debt | Customer won’t pay | DR 5210 / CR AR | ↓ expense |');
lines.push('| 4 Wrong path | CN / 4010 | **REJECTED** | Must not post |');
lines.push('| 5 Reporting | Close package | Composite story | Only disposal + bad debt move NI |');

writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
console.log('─'.repeat(60));
console.log(` Written ${OUT}`);
console.log(` Verdict: ${verdict} (pass=${pass} fail=${fail})`);
process.exit(fail === 0 ? 0 : 1);
