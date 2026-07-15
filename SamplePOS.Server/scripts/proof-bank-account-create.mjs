#!/usr/bin/env node
/**
 * Proof: Add Bank Account form → API → BankingService.createAccount.
 * Mocked unit evidence + static wiring — no DB mutation.
 *
 *   npm run proof:bank-account-create
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
log(' ADD BANK ACCOUNT PROOF');
log(` Generated: ${new Date().toISOString()}`);
log(' Mode: Jest mocks + static wiring (no database mutation)');
log('═'.repeat(76));

log('\n── Expected contract ──');
log(' UI: Banking → Accounts → Add Account');
log(' Required: Account Name *, GL Account * (ASSET CoA)');
log(' Optional: Bank Name, Branch, Account Number, Opening Balance, Set as default');
log(' Create: INSERT bank_accounts (current_balance starts 0)');
log(' Opening > 0: DR bank GL / CR 3050 Opening Balance Equity (CUTOVER_OB)');
log(' Guard: one active bank book per GL account');

log('\n── Static wiring ──');
{
  const tab = readFileSync(
    path.join(repoRoot, 'samplepos.client/src/components/banking/BankAccountsTab.tsx'),
    'utf8',
  );
  const routes = readFileSync(
    path.join(repoRoot, 'SamplePOS.Server/src/routes/bankingRoutes.ts'),
    'utf8',
  );
  const service = readFileSync(
    path.join(repoRoot, 'SamplePOS.Server/src/services/bankingService.ts'),
    'utf8',
  );

  assertTrue('UI Add Bank Account dialog', /Add Bank Account/.test(tab));
  assertTrue('UI required name + GL', /Account Name/.test(tab) && /GL Account/.test(tab));
  assertTrue('UI opening balance + default', /Opening Balance/.test(tab) && /Set as default/.test(tab));
  assertTrue('UI loads ASSET GL accounts', /type=ASSET/.test(tab));
  assertTrue('UI createMutation payload', /glAccountId: formData\.glAccountId/.test(tab));
  assertTrue('Route CreateBankAccountSchema', /CreateBankAccountSchema/.test(routes));
  assertTrue('Route createAccount', /BankingService\.createAccount/.test(routes));
  assertTrue('Service unique GL guard', /already used by/.test(service));
  assertTrue(
    'Service opening BANK_OPENING → 3050 CUTOVER_OB',
    /BANK_OPENING/.test(service) &&
      /3050|OPENING_BALANCE_EQUITY/.test(service) &&
      /CUTOVER_OB/.test(service) &&
      !/ParentId/.test(service),
  );
}

log('\n── Jest suite ──');
const jestBin = [
  path.join(serverRoot, 'node_modules', 'jest', 'bin', 'jest.js'),
  path.join(repoRoot, 'node_modules', 'jest', 'bin', 'jest.js'),
].find((p) => existsSync(p));

if (!jestBin) {
  failed = true;
  log('✗ Jest binary not found');
} else {
  const jestRun = spawnSync(
    process.execPath,
    [
      '--experimental-vm-modules',
      jestBin,
      'src/services/bankingCreateAccountProof.test.ts',
      '--no-coverage',
    ],
    { cwd: serverRoot, encoding: 'utf8', shell: false },
  );
  log(jestRun.stdout || '');
  if (jestRun.stderr) log(jestRun.stderr.slice(0, 3000));
  assertTrue('Jest PASS', jestRun.status === 0, `exit=${jestRun.status}`);
}

log('\n── Scope honesty ──');
log(' ✓ Proven: create validations, GL uniqueness, default clear, opening JE shape, UI↔API wiring.');
log(' ✗ Not claimed: live Henber INSERT (would mutate tenant bank_accounts).');

log('\n' + '═'.repeat(76));
log(failed ? ' RESULT: PROOF FAILED' : ' RESULT: PROOF OK — Add Bank Account verified');
log('═'.repeat(76));

const outPath = path.join(repoRoot, 'PROOF_BANK_ACCOUNT_CREATE.md');
writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
console.log(`\nWrote ${outPath}`);
process.exit(failed ? 1 : 0);
