#!/usr/bin/env node
/**
 * Proof: Sales Analysis accuracy + Transfer reverse (Phase 1).
 *
 * Sales:
 *   - GET /api/reports/sales across all group_by dimensions
 *   - Summary has no *Formatted duplicate fields
 *   - Summary totals are identical across dimensions (inconsistency = FAIL)
 *   - Row sums reconcile to summary for day / cashier / payment_method
 *
 * Transfer reverse (SAP/Odoo style):
 *   - Post TREASURY_TRANSFER → reverse → balances restore
 *   - Double-reverse rejected; reverse-of-reversal rejected
 *   - Reversal document opposite lines; original marked reversed
 *
 * Usage:
 *   npm run proof:sales-analysis-transfer
 *   API_BASE=http://localhost:3001 TEST_EMAIL=... TEST_PASSWORD=... npm run proof:sales-analysis-transfer
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serverRoot, '..');
const OUT =
  process.env.PROOF_OUT ||
  resolve(repoRoot, 'PROOF_SALES_ANALYSIS_TRANSFER.md');
const BASE = (process.env.API_BASE || 'http://localhost:3001').replace(/\/$/, '');
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const AMOUNT = Number(process.env.TRANSFER_PROOF_AMOUNT || '1.37');

const GROUP_BYS = [
  'day',
  'week',
  'month',
  'cashier',
  'payment_method',
  'product',
  'category',
  'customer',
];

let pass = 0;
let fail = 0;
let skip = 0;
const lines = [
  '# Sales Analysis Accuracy + Transfer Reverse — Proof\n',
  `Run: ${new Date().toISOString()}\n`,
  `API: ${BASE}\n`,
  '\nGoal: no inconsistent sales KPIs across analyse-by dimensions; transfer reverse restores liquidity.\n',
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
function skipped(n, d = '') {
  skip++;
  console.log(`  SKIP  ${n}${d ? ` — ${d}` : ''}`);
  lines.push(`- **SKIP** ${n}${d ? ` — ${d}` : ''}`);
}
function assert(c, n, d = '') {
  if (c) ok(n, d);
  else bad(n, d);
}
function near(a, b, eps = 0.02) {
  return Math.abs(Number(a) - Number(b)) <= eps;
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    env: process.env,
  });
  return { code: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}` };
}

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

function errMsg(res) {
  return (
    res.data?.error ||
    res.data?.message ||
    (typeof res.data === 'string' ? res.data : JSON.stringify(res.data)?.slice(0, 240)) ||
    `HTTP ${res.status}`
  );
}

function monthStart(iso) {
  return `${iso.slice(0, 7)}-01`;
}

function businessTodayApprox() {
  // Africa/Kampala date — proof tolerates UTC vs local day boundary for range queries
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Kampala' });
}

console.log('═'.repeat(60));
console.log(' proof-sales-analysis-transfer');
console.log('═'.repeat(60));

// ── Static / UI contract ──────────────────────────────────────────
lines.push('\n## Static UI / wiring\n');

const salesPage = resolve(repoRoot, 'samplepos.client/src/pages/reports/SalesAnalysisReportPage.tsx');
const docsPage = resolve(repoRoot, 'samplepos.client/src/pages/accounting/TreasuryDocumentsPage.tsx');
const appTsx = resolve(repoRoot, 'samplepos.client/src/App.tsx');
const reportsPage = resolve(repoRoot, 'samplepos.client/src/pages/ReportsPage.tsx');
const zodReports = resolve(repoRoot, 'shared/zod/reports.ts');

assert(existsSync(salesPage), 'SalesAnalysisReportPage exists');
if (existsSync(salesPage)) {
  const src = readFileSync(salesPage, 'utf8');
  assert(src.includes("id: 'cashier'"), 'UI dimension: cashier');
  assert(src.includes("id: 'payment_method'"), 'UI dimension: payment_method');
  assert(src.includes('totalQuantitySold'), 'UI column: quantity');
  assert(src.includes('COLUMNS') || src.includes('Columns'), 'UI column picker');
  assert(!src.includes('Formatted'), 'UI does not render *Formatted KPIs');
  assert(src.includes('reports/sales'), 'UI calls reports/sales');
}
assert(existsSync(docsPage), 'TreasuryDocumentsPage exists');
if (existsSync(docsPage)) {
  const src = readFileSync(docsPage, 'utf8');
  assert(src.includes('Reverse document'), 'Documents UI has Reverse');
  assert(src.includes('treasury.reverse') || src.includes('.reverse('), 'Documents UI calls reverse API');
  assert(src.includes('accounting'), 'Reverse gated by accounting permission copy');
}
if (existsSync(appTsx)) {
  const src = readFileSync(appTsx, 'utf8');
  assert(src.includes('/reports/sales-analysis'), 'Route /reports/sales-analysis wired');
}
if (existsSync(reportsPage)) {
  const src = readFileSync(reportsPage, 'utf8');
  assert(src.includes("navigate('/reports/sales-analysis')"), 'Reports gallery opens Sales Analysis');
}
if (existsSync(zodReports)) {
  const src = readFileSync(zodReports, 'utf8');
  assert(src.includes("'cashier'"), 'Zod group_by allows cashier');
}

const uiVitest = run(
  'npx',
  ['vitest', 'run', 'src/__tests__/sales-analysis-transfer-proof.test.ts'],
  resolve(repoRoot, 'samplepos.client'),
);
if (uiVitest.code === 0) {
  ok(
    'Vitest sales-analysis-transfer UI proof',
    (uiVitest.out.match(/Tests\s+[^\n]+/) || uiVitest.out.match(/\d+ passed/) || ['ok'])[0],
  );
} else if (/no tests found|Not found|Cannot find/i.test(uiVitest.out)) {
  skipped('Vitest UI proof', 'test file missing or empty');
} else {
  bad('Vitest sales-analysis-transfer UI proof', uiVitest.out.slice(-600));
}

// ── Live API ──────────────────────────────────────────────────────
lines.push('\n## Live API — Sales Analysis accuracy\n');

let flagWasOn = false;
let token = null;

try {
  const health = await req('GET', '/api/health');
  if (health.status !== 200) {
    skipped('Live API', `health=${health.status}`);
  } else {
    ok('API health', String(health.status));

    const login = await req('POST', '/api/auth/login', {
      body: { email: EMAIL, password: PASSWORD },
    });
    token = login.data?.data?.token ?? login.data?.data?.accessToken;
    if (login.status !== 200 || !token) {
      bad('Admin login', errMsg(login));
    } else {
      ok('Admin login', EMAIL);

      const end = businessTodayApprox();
      const start = monthStart(end);
      const summaries = {};

      for (const groupBy of GROUP_BYS) {
        const res = await req(
          'GET',
          `/api/reports/sales?start_date=${start}&end_date=${end}&group_by=${groupBy}`,
          { token },
        );
        const payload = res.data?.data;
        const summary = payload?.summary;
        const data = Array.isArray(payload?.data) ? payload.data : [];

        assert(
          res.status === 200 && payload?.reportType === 'SALES_REPORT',
          `Sales report group_by=${groupBy}`,
          `${payload?.recordCount ?? data.length} groups · ${payload?.executionTimeMs ?? '?'}ms`,
        );

        if (!summary) {
          bad(`Summary present (${groupBy})`, errMsg(res));
          continue;
        }

        const formattedKeys = Object.keys(summary).filter((k) => /Formatted$/i.test(k));
        assert(
          formattedKeys.length === 0,
          `No *Formatted summary keys (${groupBy})`,
          formattedKeys.join(',') || 'clean',
        );

        assert(
          typeof summary.totalQuantitySold === 'number',
          `totalQuantitySold in summary (${groupBy})`,
          String(summary.totalQuantitySold),
        );

        assert(
          data.every((r) => typeof r.totalQuantitySold === 'number'),
          `Rows have totalQuantitySold (${groupBy})`,
          data[0] ? `sample=${data[0].totalQuantitySold}` : 'empty',
        );

        if (groupBy === 'cashier' && data.length > 0) {
          const mangled = data.filter((r) => /Invalid|NaN/i.test(String(r.period)));
          assert(mangled.length === 0, 'Cashier periods are names (not Invalid Date)', String(data[0]?.period));
        }

        summaries[groupBy] = {
          totalSales: Number(summary.totalSales),
          totalDiscounts: Number(summary.totalDiscounts),
          netRevenue: Number(summary.netRevenue),
          totalCost: Number(summary.totalCost),
          grossProfit: Number(summary.grossProfit),
          totalTransactions: Number(summary.totalTransactions),
          totalQuantitySold: Number(summary.totalQuantitySold),
          profitMargin: Number(summary.profitMargin),
          rows: data,
        };

        // Row ↔ summary reconcile (product: qty/sales OK; txn count can fan-out)
        if (['day', 'cashier', 'payment_method', 'customer'].includes(groupBy) && data.length > 0) {
          const sumSales = data.reduce((a, r) => a + Number(r.totalSales || 0), 0);
          const sumQty = data.reduce((a, r) => a + Number(r.totalQuantitySold || 0), 0);
          const sumTxn = data.reduce((a, r) => a + Number(r.transactionCount || 0), 0);
          assert(
            near(sumSales, summary.totalSales, 0.05),
            `Row sales sum = summary (${groupBy})`,
            `rows=${sumSales.toFixed(2)} summary=${Number(summary.totalSales).toFixed(2)}`,
          );
          assert(
            near(sumQty, summary.totalQuantitySold, 0.05),
            `Row qty sum = summary (${groupBy})`,
            `rows=${sumQty} summary=${summary.totalQuantitySold}`,
          );
          assert(
            near(sumTxn, summary.totalTransactions, 0),
            `Row txn sum = summary (${groupBy})`,
            `rows=${sumTxn} summary=${summary.totalTransactions}`,
          );
        }

        if (groupBy === 'product' || groupBy === 'category') {
          assert(
            data.every((r) => typeof r.category === 'string' && r.category.length > 0),
            `Rows include item category (${groupBy})`,
            data[0] ? `sample=${data[0].category}` : 'empty',
          );
        }

        if (groupBy === 'product' && data.length > 0) {
          const sumSales = data.reduce((a, r) => a + Number(r.totalSales || 0), 0);
          const sumQty = data.reduce((a, r) => a + Number(r.totalQuantitySold || 0), 0);
          assert(
            near(sumSales, summary.totalSales, 0.05),
            'Product row sales sum = summary',
            `rows=${sumSales.toFixed(2)} summary=${Number(summary.totalSales).toFixed(2)}`,
          );
          assert(
            near(sumQty, summary.totalQuantitySold, 0.05),
            'Product row qty sum = summary',
            `rows=${sumQty} summary=${summary.totalQuantitySold}`,
          );
        }

        if (groupBy === 'category' && data.length > 0) {
          const sumSales = data.reduce((a, r) => a + Number(r.totalSales || 0), 0);
          const sumQty = data.reduce((a, r) => a + Number(r.totalQuantitySold || 0), 0);
          assert(
            near(sumSales, summary.totalSales, 0.05),
            'Category row sales sum = summary',
            `rows=${sumSales.toFixed(2)} summary=${Number(summary.totalSales).toFixed(2)}`,
          );
          assert(
            near(sumQty, summary.totalQuantitySold, 0.05),
            'Category row qty sum = summary',
            `rows=${sumQty} summary=${summary.totalQuantitySold}`,
          );
        }
      }

      // Cross-dimension consistency (the inconsistency check)
      const baseline = summaries.day || summaries.month || Object.values(summaries)[0];
      if (baseline) {
        lines.push(
          `\nBaseline (${Object.keys(summaries)[0]}): sales=${baseline.totalSales} net=${baseline.netRevenue} qty=${baseline.totalQuantitySold} txns=${baseline.totalTransactions}\n`,
        );
        for (const [gb, s] of Object.entries(summaries)) {
          assert(
            near(s.totalSales, baseline.totalSales) &&
              near(s.netRevenue, baseline.netRevenue) &&
              near(s.totalCost, baseline.totalCost) &&
              near(s.grossProfit, baseline.grossProfit) &&
              near(s.totalTransactions, baseline.totalTransactions, 0) &&
              near(s.totalQuantitySold, baseline.totalQuantitySold, 0.05),
            `Summary consistent vs day (${gb})`,
            `sales=${s.totalSales} net=${s.netRevenue} qty=${s.totalQuantitySold} txns=${s.totalTransactions}`,
          );
          // Margin identity: grossProfit / netRevenue * 100 ≈ profitMargin (when net≠0)
          if (Math.abs(s.netRevenue) > 0.01) {
            const expected = (s.grossProfit / s.netRevenue) * 100;
            assert(
              near(expected, s.profitMargin, 0.05),
              `Margin = GP/Net (${gb})`,
              `calc=${expected.toFixed(2)} reported=${s.profitMargin}`,
            );
          }
          // Net identity
          assert(
            near(s.totalSales - s.totalDiscounts, s.netRevenue, 0.02),
            `Net = sales − discounts (${gb})`,
            `calc=${(s.totalSales - s.totalDiscounts).toFixed(2)} reported=${s.netRevenue}`,
          );
        }
      } else {
        skipped('Cross-dimension consistency', 'no sales data in range');
      }

      // ── Transfer reverse ────────────────────────────────────────
      lines.push('\n## Live API — Transfer reverse\n');

      const enabledBefore = await req('GET', '/api/treasury/enabled', { token });
      flagWasOn = Boolean(enabledBefore.data?.data?.enabled);
      if (!flagWasOn) {
        const enable = await req('PATCH', '/api/system-settings', {
          token,
          body: { treasuryDocumentEnabled: true },
        });
        assert(
          enable.status === 200 && enable.data?.data?.treasuryDocumentEnabled === true,
          'Enable treasuryDocumentEnabled',
          errMsg(enable),
        );
      } else {
        ok('Treasury already enabled');
      }

      const accountsRes = await req('GET', '/api/treasury/liquidity-accounts', { token });
      const accounts = accountsRes.data?.data?.items ?? [];
      assert(accountsRes.status === 200 && accounts.length > 0, 'List liquidity accounts', `n=${accounts.length}`);
      const byCode = new Map(accounts.map((a) => [a.accountCode, a]));
      for (const code of ['1010', '1030']) {
        assert(byCode.has(code), `Account ${code} present`, byCode.get(code)?.accountName || 'missing');
      }

      const balBefore = {
        '1010': Number(byCode.get('1010')?.currentBalance ?? 0),
        '1030': Number(byCode.get('1030')?.currentBalance ?? 0),
      };
      lines.push(`\nBalances before: cash=${balBefore['1010']} bank=${balBefore['1030']}\n`);

      // Prefer bank→cash so we don't need large cash balance
      const from = balBefore['1030'] >= AMOUNT ? '1030' : '1010';
      const to = from === '1030' ? '1010' : '1030';
      if (Number(byCode.get(from)?.currentBalance ?? 0) < AMOUNT) {
        skipped('Transfer reverse live', `insufficient ${from} balance for ${AMOUNT}`);
      } else {
        const today = businessTodayApprox();
        const create = await req('POST', '/api/treasury/transfers', {
          token,
          body: {
            transactionDate: today,
            fromAccountCode: from,
            toAccountCode: to,
            amount: AMOUNT,
            memo: 'PROOF sales-analysis-transfer reverse',
            postImmediately: true,
          },
        });
        const doc = create.data?.data;
        assert(
          (create.status === 200 || create.status === 201) &&
            doc?.status === 'POSTED' &&
            doc?.documentType === 'TREASURY_TRANSFER',
          'Post TREASURY_TRANSFER',
          `${doc?.documentNumber || errMsg(create)} ${from}→${to}`,
        );

        if (doc?.id) {
          const rev = await req('POST', `/api/treasury/documents/${doc.id}/reverse`, {
            token,
            body: { reason: 'PROOF reverse wrong destination' },
          });
          const reversal = rev.data?.data?.reversal;
          const original = rev.data?.data?.original;
          assert(
            (rev.status === 200 || rev.status === 201) &&
              reversal?.documentType === 'TREASURY_REVERSAL' &&
              reversal?.status === 'POSTED' &&
              Boolean(reversal?.journalEntryId),
            'Reverse creates posted TREASURY_REVERSAL',
            reversal?.documentNumber || errMsg(rev),
          );
          assert(
            Boolean(original?.reversedByDocumentId) ||
              Boolean(reversal?.reversesDocumentId) ||
              Boolean(rev.data?.data?.original?.reversedByDocumentId),
            'Original linked to reversal',
            original?.reversedByDocumentId || reversal?.reversesDocumentId || 'check payload',
          );

          const revDetail = await req('GET', `/api/treasury/documents/${reversal.id}`, { token });
          const revLines = revDetail.data?.data?.lines ?? [];
          const revDebit = revLines.reduce((a, l) => a + Number(l.debitAmount || 0), 0);
          const revCredit = revLines.reduce((a, l) => a + Number(l.creditAmount || 0), 0);
          assert(
            near(revDebit, revCredit, 0.01) && near(revDebit, AMOUNT, 0.01),
            'Reversal journal balanced (DR=CR=amount)',
            `DR=${revDebit} CR=${revCredit}`,
          );

          const double = await req('POST', `/api/treasury/documents/${doc.id}/reverse`, {
            token,
            body: { reason: 'PROOF double reverse should fail' },
          });
          assert(
            double.status >= 400,
            'Double reverse rejected',
            `${double.status} ${errMsg(double)}`.slice(0, 160),
          );

          if (reversal?.id) {
            const revOfRev = await req('POST', `/api/treasury/documents/${reversal.id}/reverse`, {
              token,
              body: { reason: 'PROOF reverse-of-reversal should fail' },
            });
            assert(
              revOfRev.status >= 400,
              'Reverse-of-reversal rejected',
              `${revOfRev.status} ${errMsg(revOfRev)}`.slice(0, 160),
            );
          }

          const afterRes = await req('GET', '/api/treasury/liquidity-accounts', { token });
          const afterMap = new Map(
            (afterRes.data?.data?.items ?? []).map((a) => [
              a.accountCode,
              Number(a.currentBalance ?? 0),
            ]),
          );
          for (const code of ['1010', '1030']) {
            assert(
              near(afterMap.get(code) ?? 0, balBefore[code], 0.0001),
              `Balance restored ${code}`,
              `before=${balBefore[code]} after=${afterMap.get(code)}`,
            );
          }
        }
      }
    }
  }
} catch (e) {
  bad('Live API exception', e instanceof Error ? e.message : String(e));
} finally {
  if (token && !flagWasOn) {
    const restore = await req('PATCH', '/api/system-settings', {
      token,
      body: { treasuryDocumentEnabled: false },
    });
    assert(
      restore.status === 200 && restore.data?.data?.treasuryDocumentEnabled === false,
      'Restore treasuryDocumentEnabled=false',
      errMsg(restore),
    );
  }
}

lines.push('\n## Verdict\n');
lines.push(`- PASS: ${pass}`);
lines.push(`- FAIL: ${fail}`);
lines.push(`- SKIP: ${skip}`);
const verdict = fail === 0 ? 'PASS' : 'FAIL';
lines.push(`\n**Overall: ${verdict}**\n`);
lines.push('\nCommit only after Overall PASS.\n');

writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
console.log('\n' + '─'.repeat(60));
console.log(` Wrote ${OUT}`);
console.log(` PASS=${pass} FAIL=${fail} SKIP=${skip} → ${verdict}`);
console.log('─'.repeat(60));
process.exit(fail === 0 ? 0 : 1);
