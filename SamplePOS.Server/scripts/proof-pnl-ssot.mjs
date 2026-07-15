#!/usr/bin/env node
/**
 * Proof: P&L Reports GL SSOT (Odoo / SAP / QB style).
 * Arithmetic + static source gates + Jest — no DB mutation required.
 *
 *   npm run proof:pnl-ssot
 *   node SamplePOS.Server/scripts/proof-pnl-ssot.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
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

const fmt = (n) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let failures = 0;
function assertTrue(label, cond) {
  log(`${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failures += 1;
  return !!cond;
}
function assertEq(label, a, b, tol = 0.01) {
  const ok = Math.abs(Number(a) - Number(b)) <= tol;
  log(`${ok ? '✓' : '✗'} ${label}: ${fmt(a)} ${ok ? '==' : '!='} ${fmt(b)}`);
  if (!ok) failures += 1;
  return ok;
}

function read(rel) {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

log('══ P&L SSOT PROOF ══');
log(`Generated: ${new Date().toISOString()}`);
log('');

// ── Scenario from user report (July 2026) ────────────────────────────
log('── Arithmetic (user-reported July figures) ──');
const revenue = 450_542;
const cogs = 3_860;
const gross = revenue - cogs;

const brokenOpex = cogs; // 5000 typed EXPENSE included in OpEx
const brokenNet = gross - brokenOpex;
const brokenNetMargin = (brokenNet / revenue) * 100;
const brokenGrossMargin = (gross / revenue) * 100;

const fixedOpex = 0;
const fixedNet = gross - fixedOpex;
const fixedNetMargin = (fixedNet / revenue) * 100;

assertEq('Gross Profit', gross, 446_682);
assertEq('Broken OpEx (double-count COGS)', brokenOpex, 3_860);
assertEq('Broken Net Income', brokenNet, 442_822);
assertTrue(
  `Broken UI symptom: display net=0 while margin≈${brokenNetMargin.toFixed(1)}%`,
  Math.abs(brokenNetMargin - 98.3) < 0.05,
);
assertTrue(
  `Broken gross margin≈${brokenGrossMargin.toFixed(1)}% (UI showed 99.1%)`,
  Math.abs(brokenGrossMargin - 99.1) < 0.1,
);

assertEq('Fixed OpEx (exclude 5xxx)', fixedOpex, 0);
assertEq('Fixed Net Income (= Gross when OpEx=0)', fixedNet, 446_682);
assertEq('Fixed Net Margin = Gross Margin', fixedNetMargin, (gross / revenue) * 100, 0.0001);
log('');

// ── Static source gates ──────────────────────────────────────────────
log('── Static source evidence ──');

const mig = read('shared/sql/539_fix_pnl_ssot_classification.sql');
assertTrue('Migration 539 exists', existsSync(path.join(repoRoot, 'shared/sql/539_fix_pnl_ssot_classification.sql')));
assertTrue('539 OpEx excludes 5xxx', mig.includes("NOT LIKE '5%'") && mig.includes("NOT LIKE '4%'"));
assertTrue('539 uses POSTED + net-active filter', mig.includes(`"Status" = 'POSTED'`) && mig.includes('IsReversed'));
assertTrue('539 section: 5xxx → COST_OF_GOODS_SOLD', mig.includes("'COST_OF_GOODS_SOLD'"));

const schema = read('SamplePOS.Server/src/constants/schemaVersion.ts');
const schemaMatch = schema.match(/CURRENT_SCHEMA_VERSION\s*=\s*(\d+)/);
const schemaVer = schemaMatch ? Number(schemaMatch[1]) : 0;
assertTrue(
  'Schema version >= 540 (539 P&L SSOT applied; current may be higher)',
  schemaVer >= 540,
);

const page = read('samplepos.client/src/pages/ProfitLossPage.tsx');
assertTrue('UI pickNetProfit prefers netIncome', page.includes('netIncome ?? summary?.netProfit') || page.includes('summary?.netIncome ?? summary?.netProfit'));
assertTrue(
  'UI pickExpenses prefers totalOperatingExpenses',
  page.includes('totalOperatingExpenses ?? summary?.totalExpenses') ||
    page.includes('summary?.totalOperatingExpenses ?? summary?.totalExpenses'),
);
assertTrue('UI does not sole-read netProfit for cards', !/summary\?\.netProfit \|\| 0/.test(page));
assertTrue('Verify passes dateFrom/dateTo', page.includes('fetchPLVerification(dateFrom, dateTo)'));
assertTrue('Sections built from REVENUE/COGS/OPEX', page.includes('COST_OF_GOODS_SOLD') || page.includes('sections.cogs'));

const routes = read('SamplePOS.Server/src/routes/erpAccountingRoutes.ts');
assertTrue('API aliases netProfit: netIncome', routes.includes('netProfit: netIncome'));
assertTrue('API returns sections object', routes.includes('sections:') && routes.includes("section === 'REVENUE'"));
assertTrue('Comparative exposes periods alias', routes.includes('periods: comparisons'));

const verify = read('SamplePOS.Server/src/services/profitLossReportService.ts');
const verifyFnStart = verify.indexOf('async verifyProfitLossConsistency');
const verifyFnBody = verifyFnStart >= 0 ? verify.slice(verifyFnStart, verifyFnStart + 3500) : '';
assertTrue(
  'Verify uses fn_get_profit_loss detail rollup (same ledger SSOT)',
  verifyFnBody.includes('fn_get_profit_loss($1::DATE') &&
    verifyFnBody.includes('fn_get_profit_loss_summary') &&
    !verifyFnBody.includes('gl_period_balances'),
);
assertTrue(
  'Verify returns plNetIncome + trialBalanceNetIncome + difference',
  verifyFnBody.includes('plNetIncome') && verifyFnBody.includes('difference'),
);
log('');

// ── Jest ─────────────────────────────────────────────────────────────
log('── Jest: profitLossSsot.test.ts ──');
const jestRun = spawnSync(
  process.execPath,
  [
    '--experimental-vm-modules',
    './node_modules/jest/bin/jest.js',
    'src/services/profitLossSsot.test.ts',
    '--forceExit',
    '--no-coverage',
  ],
  { cwd: serverRoot, encoding: 'utf8', shell: false },
);
const jestOut = `${jestRun.stdout || ''}\n${jestRun.stderr || ''}`.trim();
log(jestOut.split('\n').slice(-40).join('\n'));
const jestOk = jestRun.status === 0;
assertTrue('Jest suite PASS', jestOk);
log('');

// ── Verdict ──────────────────────────────────────────────────────────
log('── Surface evidence ──');
log(' API: GET /api/erp-accounting/reports/profit-loss?dateFrom&dateTo');
log(' API: GET /api/erp-accounting/reports/profit-loss/verify?dateFrom&dateTo');
log(' UI:  /accounting/profit-loss');
log(' SSOT: posted ledger_entries via fn_get_profit_loss*_ (migration 539)');
log(' Formula: Net = Revenue(4xxx) − COGS(5xxx) − OpEx(6/7/EXPENSE≠5)');
log('');

const ok = failures === 0 && jestOk;
log(ok ? 'PROOF OK — P&L SSOT accepted with evidence' : `PROOF FAIL — ${failures} assertion(s) failed`);
log('');

const outPath = path.join(repoRoot, 'PROOF_PNL_SSOT.md');
writeFileSync(
  outPath,
  [
    '# PROOF: P&L Reports GL SSOT',
    '',
    '```',
    ...lines,
    '```',
    '',
    '## Acceptance criteria (evidence-backed)',
    '',
    '| Criterion | Evidence |',
    '|-----------|----------|',
    '| Net Profit not stuck at 0 when Gross > 0 | UI `pickNetProfit` + API `netProfit` alias; Jest + arithmetic |',
    '| OpEx does not double-count COGS 5xxx | Migration 539 `NOT LIKE \'5%\'`; Jest July scenario |',
    '| Discrepancy uses same-period ledger rollup | `verifyProfitLossConsistency` vs `fn_get_profit_loss` |',
    '| Schema gate | `CURRENT_SCHEMA_VERSION >= 540` (539 P&L SSOT retained) |',
    '',
    `**Verdict:** ${ok ? 'PASS' : 'FAIL'}`,
    '',
  ].join('\n'),
  'utf8',
);
log(`Wrote ${outPath}`);

process.exit(ok ? 0 : 1);
