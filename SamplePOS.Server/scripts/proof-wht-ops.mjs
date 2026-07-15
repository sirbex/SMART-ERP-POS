#!/usr/bin/env node
/**
 * Proof: WithholdingTaxPage ops — Tax reports / Remit / Recover / Add Type.
 * Mocked unit evidence + static wiring — no DB / production mutation.
 *
 *   npm run proof:wht-ops
 *   node SamplePOS.Server/scripts/proof-wht-ops.mjs
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
log(' WHT OPS PROOF — Tax reports · Remit Payable · Recover Receivable · Add Type');
log(` Generated: ${new Date().toISOString()}`);
log(' Mode: Jest mocks + static wiring (no database mutation)');
log('═'.repeat(76));

log('\n── Expected GL (expert contract) ──');
log(' Add Type:    INSERT withholding_tax_types (rate fraction, applies_to, 1250|2350)');
log(' Remit:       DR 2350 WHT Payable / CR cash|bank   source=WHT_REMITTANCE');
log(' Recover:     DR cash|bank / CR 1250 Tax Receivable source=WHT_RECEIVABLE_RECOVERY');
log(' Tax reports: GET /api/reports/tax-compliance/{summary|register|liability}');
log('              SSOT = whtReportService (rollforward + WHT register)');

log('\n── Static surface wiring ──');
{
  const page = readFileSync(
    path.join(repoRoot, 'samplepos.client/src/pages/accounting/WithholdingTaxPage.tsx'),
    'utf8',
  );
  const whtRoutes = readFileSync(
    path.join(repoRoot, 'SamplePOS.Server/src/modules/withholding-tax/whtRoutes.ts'),
    'utf8',
  );
  const reportRoutes = readFileSync(
    path.join(repoRoot, 'SamplePOS.Server/src/modules/reports/reportsRoutes.ts'),
    'utf8',
  );
  const api = readFileSync(path.join(repoRoot, 'samplepos.client/src/utils/api.ts'), 'utf8');

  assertTrue('UI Tax reports → /reports/tax-compliance', /to="\/reports\/tax-compliance"/.test(page));
  assertTrue('UI Remit Payable button', /Remit Payable/.test(page));
  assertTrue('UI Recover Receivable button', /Recover Receivable/.test(page));
  assertTrue('UI Add WHT Type button', /Add WHT Type/.test(page));
  assertTrue('UI customer checkbox wiring', /appliesToCustomers/.test(page));

  assertTrue('API POST /types', /router\.post\('\/types'/.test(whtRoutes));
  assertTrue('API POST /remit', /router\.post\('\/remit'/.test(whtRoutes));
  assertTrue('API POST /recover', /router\.post\('\/recover'/.test(whtRoutes));
  assertTrue(
    'Remit/recover require accounting.manage',
    (whtRoutes.match(/requirePermission\('accounting\.manage'\)/g) || []).length >= 3,
  );

  assertTrue('Report /tax-compliance/summary', /\/tax-compliance\/summary/.test(reportRoutes));
  assertTrue('Report /tax-compliance/register', /\/tax-compliance\/register/.test(reportRoutes));
  assertTrue('Report /tax-compliance/liability', /\/tax-compliance\/liability/.test(reportRoutes));

  assertTrue('Client createType', /withholding-tax\/types/.test(api));
  assertTrue('Client remit', /withholding-tax\/remit/.test(api));
  assertTrue('Client recover', /withholding-tax\/recover/.test(api));
  assertTrue('Client tax-compliance', /reports\/tax-compliance/.test(api));
}

log('\n── Jest ops suite (create / remit / recover / wiring) ──');
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
      'src/modules/withholding-tax/whtOpsProof.test.ts',
      'src/modules/withholding-tax/whtReportService.test.ts',
      'src/modules/withholding-tax/whtService.test.ts',
      '--no-coverage',
    ],
    { cwd: serverRoot, encoding: 'utf8', shell: false },
  );
  log(jestRun.stdout || '');
  if (jestRun.stderr) log(jestRun.stderr.slice(0, 4000));
  assertTrue('Jest ops suite PASS', jestRun.status === 0, `exit=${jestRun.status}`);
}

log('\n── Scope honesty ──');
log(' ✓ Proven: service GL shape, validations, settlement audit, UI↔API↔route wiring,');
log('   tax-compliance routes + rollforward math (whtReportService).');
log(' ✗ Not claimed: live Henber POST against production balances (would mutate).');
log('   Run Remit/Recover on production only with real payable/receivable > 0.');

log('\n' + '═'.repeat(76));
if (failed) {
  log(' RESULT: PROOF FAILED — WHT ops not fully verified');
} else {
  log(' RESULT: PROOF OK — Add Type · Remit · Recover · Tax reports wiring verified');
}
log('═'.repeat(76));

const outPath = path.join(repoRoot, 'PROOF_WHT_OPS.md');
writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
console.log(`\nWrote ${outPath}`);
process.exit(failed ? 1 : 0);
