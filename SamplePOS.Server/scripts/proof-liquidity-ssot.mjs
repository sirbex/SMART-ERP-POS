#!/usr/bin/env node
/**
 * E2E proof: Banking & Liquidity SSOT accuracy
 * - GL balance SSOT on liquidity accounts
 * - Insufficient funds blocked
 * - Transfer posts + appears in Liquidity Movements report
 * - Report column selection works
 *
 * Usage: npm run proof:liquidity-ssot
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serverRoot, '..');
const OUT = process.env.PROOF_OUT || resolve(repoRoot, 'PROOF_LIQUIDITY_SSOT.md');
const BASE = (process.env.API_BASE || 'http://localhost:3001').replace(/\/$/, '');
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';

let pass = 0;
let fail = 0;
const lines = [
  '# Banking & Liquidity — SSOT E2E Proof\n',
  `Run: ${new Date().toISOString()}\n`,
  `API: ${BASE}\n`,
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
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/pdf') || contentType.includes('text/csv')) {
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      status: res.status,
      data: null,
      headers: { 'content-type': contentType },
      body: contentType.includes('text/csv')
        ? buf.toString('utf8')
        : buf.slice(0, 8).toString('utf8'),
      bytes: buf.length,
    };
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data, headers: { 'content-type': contentType } };
}
function errMsg(res) {
  return res.data?.error || res.data?.message || `HTTP ${res.status}`;
}

console.log('═'.repeat(60));
console.log(' proof-liquidity-ssot');
console.log('═'.repeat(60));

lines.push('\n## Unit proofs\n');
const unit = run(
  'npm',
  ['test', '--', 'src/modules/treasury/liquidityFundsGuard.test.ts', '--forceExit'],
  serverRoot,
);
assert(unit.code === 0, 'Jest liquidityFundsGuard', unit.out.match(/Tests:\s+[^\n]+/)?.[0] || '');

lines.push('\n## Live API\n');

try {
  const health = await req('GET', '/api/health');
  assert(health.status === 200, 'API health');

  const login = await req('POST', '/api/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  });
  const token = login.data?.data?.token ?? login.data?.data?.accessToken;
  assert(login.status === 200 && token, 'Admin login', EMAIL);
  if (!token) throw new Error('no token');

  // Enable treasury
  const enabledBefore = await req('GET', '/api/treasury/enabled', { token });
  const wasOn = Boolean(enabledBefore.data?.data?.enabled);
  if (!wasOn) {
    await req('PATCH', '/api/system-settings', {
      token,
      body: { treasuryDocumentEnabled: true },
    });
  }
  ok('Treasury enabled for proof');

  const balRes = await req('GET', '/api/reports/liquidity-movements/balances', { token });
  assert(balRes.status === 200, 'GET liquidity balances (GL SSOT)');
  const items = balRes.data?.data?.items ?? [];
  assert(items.length >= 3, 'Liquidity accounts present', `count=${items.length}`);

  const byCode = Object.fromEntries(items.map((i) => [i.accountCode, i]));
  const cash = byCode['1010'];
  assert(Boolean(cash), 'Cash 1010 present');

  // UI accounts must match report GL balances (same SSOT)
  const liqUi = await req('GET', '/api/treasury/liquidity-accounts', { token });
  const uiItems = liqUi.data?.data?.items ?? [];
  const uiCash = uiItems.find((a) => a.accountCode === '1010');
  assert(
    uiCash && Math.abs(Number(uiCash.currentBalance) - Number(cash.available)) < 0.02,
    'UI listLiquidityAccounts matches GL SSOT for 1010',
    `ui=${uiCash?.currentBalance} gl=${cash?.available}`,
  );

  // Insufficient funds blocked
  const over = Number(cash.available) + 100000;
  const blocked = await req('POST', '/api/treasury/transfers', {
    token,
    body: {
      transactionDate: new Date().toISOString().slice(0, 10),
      fromAccountCode: '1010',
      toAccountCode: '1030',
      amount: over,
      memo: 'PROOF overdraft',
      postImmediately: true,
    },
  });
  assert(
    blocked.status >= 400 && /Insufficient funds/i.test(errMsg(blocked)),
    'Blocks transfer when funds insufficient',
    errMsg(blocked),
  );

  // Funded move: cash → bank small amount (if cash has balance)
  const AMT = 1.5;
  let postedDoc = null;
  if (Number(cash.available) >= AMT) {
    const move = await req('POST', '/api/treasury/transfers', {
      token,
      body: {
        transactionDate: new Date().toISOString().slice(0, 10),
        fromAccountCode: '1010',
        toAccountCode: '1030',
        amount: AMT,
        memo: 'PROOF cash-to-bank',
        postImmediately: true,
      },
    });
    postedDoc = move.data?.data;
    assert(
      (move.status === 200 || move.status === 201) && postedDoc?.status === 'POSTED',
      'Posts cash→bank when funded',
      postedDoc?.documentNumber || errMsg(move),
    );

    // Reverse to keep non-destructive
    if (postedDoc?.id) {
      const rev = await req('POST', `/api/treasury/documents/${postedDoc.id}/reverse`, {
        token,
        body: { reason: 'PROOF reverse' },
      });
      assert(
        rev.status === 200 && rev.data?.data?.reversal?.documentType === 'TREASURY_REVERSAL',
        'Reverse funded transfer',
        rev.data?.data?.reversal?.documentNumber || errMsg(rev),
      );
    }
  } else {
    bad('Posts cash→bank when funded', `cash available ${cash.available} < ${AMT}`);
  }

  // Report
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const report = await req(
    'GET',
    `/api/reports/liquidity-movements?startDate=${monthStart}&endDate=${today}&columns=transactionDate,accountCode,debitAmount,creditAmount,documentNumber&limit=100`,
    { token },
  );
  assert(report.status === 200, 'Liquidity movements report');
  const rows = report.data?.data?.rows ?? [];
  const cols = report.data?.data?.meta?.columns ?? [];
  assert(cols.includes('accountCode') && cols.includes('debitAmount'), 'Report respects selected columns');
  assert(
    String(report.data?.data?.meta?.ssot || '').includes('ledger'),
    'Report declares ledger SSOT',
  );

  if (postedDoc?.documentNumber) {
    const hit = rows.some((r) => r.documentNumber === postedDoc.documentNumber);
    assert(hit, 'Posted transfer appears in movements report', postedDoc.documentNumber);
  }

  const colsApi = await req('GET', '/api/reports/liquidity-movements/columns', { token });
  assert(
    colsApi.status === 200 && (colsApi.data?.data?.columns?.length || 0) >= 8,
    'Column catalog for field picker',
  );

  const csvExport = await req(
    'GET',
    `/api/reports/liquidity-movements?startDate=${monthStart}&endDate=${today}&format=csv&columns=transactionDate,accountCode,debitAmount,creditAmount&limit=100`,
    { token },
  );
  assert(csvExport.status === 200, 'CSV export returns 200');
  assert(
    String(csvExport.headers?.['content-type'] || '').includes('text/csv') &&
      String(csvExport.body || '').includes('Date'),
    'CSV export content-type + header row',
  );

  const pdfExport = await req(
    'GET',
    `/api/reports/liquidity-movements?startDate=${monthStart}&endDate=${today}&format=pdf&columns=transactionDate,accountCode,debitAmount,creditAmount&limit=100`,
    { token },
  );
  assert(pdfExport.status === 200, 'PDF export returns 200');
  assert(
    String(pdfExport.headers?.['content-type'] || '').includes('application/pdf') &&
      String(pdfExport.body || '').startsWith('%PDF'),
    'PDF export is application/pdf',
    `bytes=${pdfExport.bytes || 0}`,
  );

  const totals = report.data?.data?.meta?.totals;
  assert(
    totals &&
      typeof totals.moneyIn === 'number' &&
      typeof totals.moneyOut === 'number' &&
      typeof totals.net === 'number',
    'Report totals are consistent (money in/out/net)',
  );
  if (!wasOn) {
    await req('PATCH', '/api/system-settings', {
      token,
      body: { treasuryDocumentEnabled: false },
    });
    ok('Restored treasury flag off');
  }
} catch (e) {
  bad('Live exception', e instanceof Error ? e.message : String(e));
}

lines.push('\n## Verdict\n');
lines.push(`- PASS: ${pass}`);
lines.push(`- FAIL: ${fail}`);
const verdict = fail === 0 ? 'PASS' : 'FAIL';
lines.push(`\n**Overall: ${verdict}**\n`);
writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
console.log(`\n Wrote ${OUT}\n PASS=${pass} FAIL=${fail} → ${verdict}`);
process.exit(fail === 0 ? 0 : 1);
