#!/usr/bin/env node
/**
 * Proof: Bank Reconciliation cleared-balance accuracy (no DB mutation).
 *   npm run proof:bank-reconciliation
 */
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverRoot, '..');

const lines = [];
const log = (s = '') => {
  lines.push(s);
  console.log(s);
};

let failed = false;
function assertTrue(label, cond, detail = '') {
  const ok = !!cond;
  if (!ok) failed = true;
  log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

log('═'.repeat(76));
log(' BANK RECONCILIATION ACCURACY PROOF');
log(` Generated: ${new Date().toISOString()}`);
log(' Mode: Jest + static wiring (no database mutation)');
log('═'.repeat(76));

log('\n── Contract ──');
log(' Last reconciled: stored statement ending from prior run (0.00 if never)');
log(' Cleared = last reconciled + selected deposits − selected withdrawals');
log(' Difference = statement ending − cleared → must be ~0 to post');
log(' Server refuses unbalanced reconcile (no silent GL/statement drift)');

log('\n── Static wiring ──');
{
  const math = readFileSync(
    path.join(repoRoot, 'SamplePOS.Server/src/services/bankReconciliationMath.ts'),
    'utf8',
  );
  const svc = readFileSync(
    path.join(repoRoot, 'SamplePOS.Server/src/services/bankingService.ts'),
    'utf8',
  );
  const ui = readFileSync(
    path.join(repoRoot, 'samplepos.client/src/components/banking/ReconciliationTab.tsx'),
    'utf8',
  );
  const types = readFileSync(path.join(repoRoot, 'shared/types/banking.ts'), 'utf8');

  assertTrue('cleared-balance math module', /computeClearedBalance/.test(math));
  assertTrue('service refuses unbalanced', /Reconciliation unbalanced/.test(svc));
  assertTrue('service returns newBalance', /newBalance: statementBalance/.test(svc));
  assertTrue('statementDate filter on server', /after statement date/.test(svc));
  assertTrue('UI gates on isBalanced', /!isBalanced/.test(ui) && /disabled=/.test(ui));
  assertTrue('UI never-reconciled shows 0.00', /Never reconciled/.test(ui));
  assertTrue('UI passes statementDate', /statementDate/.test(ui));
  assertTrue(
    'normalize preserves reconciled 0.00',
    /last_reconciled_balance != null/.test(types),
  );
}

log('\n── Jest ──');
const jestBin = [
  path.join(serverRoot, 'node_modules', 'jest', 'bin', 'jest.js'),
  path.join(repoRoot, 'node_modules', 'jest', 'bin', 'jest.js'),
].find((p) => existsSync(p));

if (!jestBin) {
  failed = true;
  log('✗ Jest not found');
} else {
  const r = spawnSync(
    process.execPath,
    [
      '--experimental-vm-modules',
      jestBin,
      'src/services/bankReconciliationMath.test.ts',
      '--no-coverage',
    ],
    { cwd: serverRoot, encoding: 'utf8', shell: false },
  );
  log(r.stdout || '');
  if (r.stderr) log(r.stderr.slice(0, 2500));
  assertTrue('Math suite PASS', r.status === 0, `exit=${r.status}`);
}

log('\n' + '═'.repeat(76));
log(failed ? ' RESULT: PROOF FAILED' : ' RESULT: PROOF OK — bank reconciliation consistent');
log('═'.repeat(76));

writeFileSync(path.join(repoRoot, 'PROOF_BANK_RECONCILIATION.md'), lines.join('\n') + '\n');
process.exit(failed ? 1 : 0);
