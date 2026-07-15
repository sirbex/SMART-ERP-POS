#!/usr/bin/env node
/**
 * End-to-end proof: Bank Reconciliation accuracy (live local API + DB).
 *
 * Flow:
 *   1. Login
 *   2. Create dedicated ASSET GL + bank account
 *   3. Post DEPOSIT + WITHDRAWAL (full GL via BankingService)
 *   4. Unbalanced reconcile must FAIL
 *   5. Balanced reconcile must PASS (cleared = last + net)
 *   6. lastReconciledBalance / newBalance must match statement ending
 *
 *   npm run proof:bank-reconciliation:e2e
 *   BASE_URL=http://localhost:3001 npm run proof:bank-reconciliation:e2e
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const require = createRequire(import.meta.url);
const pg = require('pg');

const BASE = (process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';

const lines = [];
const log = (s = '') => {
  lines.push(s);
  console.log(s);
};

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const rel of ['SamplePOS.Server/.env', 'SamplePOS.Server/.env.local', '.env']) {
    const p = path.join(repoRoot, rel);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

let pass = 0;
let fail = 0;
const ok = (n, d = '') => {
  pass += 1;
  log(`  PASS  ${n}${d ? ` — ${d}` : ''}`);
};
const bad = (n, d = '') => {
  fail += 1;
  log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
};
const assert = (cond, n, d = '') => (cond ? ok(n, d) : bad(n, d));

async function req(method, pathName, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${pathName}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text?.slice(0, 500) };
  }
  return { status: res.status, data, text, error: data?.error || data?.message };
}

/** CoA API omits CurrentBalance on some DBs — provision GL directly when needed. */
async function ensureBankGlAccount(token, code, name) {
  const api = await req('POST', '/api/accounting/chart-of-accounts', {
    token,
    body: {
      accountNumber: code,
      accountName: name,
      accountType: 'ASSET',
      normalBalance: 'DEBIT',
      isPostingAccount: true,
    },
  });
  if (api.status === 201 && api.data?.data?.id) {
    return { id: api.data.data.id, via: 'api' };
  }

  const dbUrl = loadDatabaseUrl();
  if (!dbUrl) {
    throw new Error(`CoA create failed (${api.error}) and no DATABASE_URL for SQL fallback`);
  }
  const pool = new pg.Pool({ connectionString: dbUrl });
  try {
    const idRes = await pool.query(`SELECT gen_random_uuid() AS id`);
    const id = idRes.rows[0].id;
    await pool.query(
      `INSERT INTO accounts (
         "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
         "ParentAccountId", "Level", "IsPostingAccount", "IsActive", "CurrentBalance",
         "CreatedAt", "UpdatedAt"
       ) VALUES ($1, $2, $3, 'ASSET', 'DEBIT', NULL, 1, TRUE, TRUE, 0, NOW(), NOW())`,
      [id, code, name],
    );
    return { id, via: 'sql' };
  } finally {
    await pool.end();
  }
}

function today() {
  return new Date().toLocaleDateString('en-CA');
}

function nearly(a, b, tol = 0.011) {
  return Math.abs(Number(a) - Number(b)) <= tol;
}

async function main() {
  log('═'.repeat(76));
  log(' BANK RECONCILIATION E2E PROOF (live API)');
  log(` Generated: ${new Date().toISOString()}`);
  log(` BASE_URL: ${BASE}`);
  log('═'.repeat(76));

  const health = await req('GET', '/api/health');
  assert(health.status === 200, 'API health');
  if (health.status !== 200) {
    writeProof();
    process.exit(1);
  }

  const login = await req('POST', '/api/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  });
  const token = login.data?.data?.token ?? login.data?.data?.accessToken;
  assert(login.status === 200 && !!token, 'Login as admin');
  if (!token) {
    writeProof();
    process.exit(1);
  }

  const stamp = Date.now().toString().slice(-8);
  const code = `1098${stamp.slice(-4)}`;

  log('\n── 1. Dedicated bank GL + bank book ──');
  let glId;
  try {
    const gl = await ensureBankGlAccount(token, code, `E2E Recon Bank ${stamp}`);
    glId = gl.id;
    assert(!!glId, `Create ASSET GL for bank via ${gl.via}`, code);
  } catch (err) {
    assert(false, 'Create ASSET GL for bank', err.message);
  }
  if (!glId) {
    writeProof();
    process.exit(1);
  }

  const bank = await req('POST', '/api/banking/accounts', {
    token,
    body: {
      name: `E2E Recon ${stamp}`,
      bankName: 'Proof Bank',
      branch: 'E2E',
      accountNumber: `E2E-${stamp}`,
      glAccountId: glId,
      openingBalance: 0,
      isDefault: false,
    },
  });
  const bankId = bank.data?.data?.id;
  assert(bank.status === 201 && !!bankId, 'Create bank account', bank.error);
  if (!bankId) {
    writeProof();
    process.exit(1);
  }
  assert(
    bank.data?.data?.lastReconciledBalance == null ||
      bank.data?.data?.lastReconciledBalance === undefined,
    'Fresh account has no last reconciled (never)',
    String(bank.data?.data?.lastReconciledBalance),
  );

  // Contra accounts (known seed codes)
  const coa = await req('GET', '/api/accounting/chart-of-accounts?isPostingAccount=true&isActive=true', {
    token,
  });
  const accounts = Array.isArray(coa.data?.data) ? coa.data.data : [];
  const revenue = accounts.find((a) => a.accountNumber === '4100') // Service Revenue — open AllowedSources
    || accounts.find((a) => a.accountNumber === '4000');
  const expense = accounts.find((a) => a.accountNumber === '7000') // Interest Expense — open AllowedSources
    || accounts.find((a) => a.accountNumber === '4100');
  assert(!!revenue?.id && !!expense?.id, 'Contra accounts for bank journal present', `${revenue?.accountNumber}/${expense?.accountNumber}`);

  const date = today();
  log('\n── 2. Post bank transactions (GL-backed) ──');
  const depositAmt = 1_000_000;
  const withdrawAmt = 250_000;
  const expectedCleared = depositAmt - withdrawAmt; // never-reconciled opening 0

  const dep = await req('POST', '/api/banking/transactions', {
    token,
    body: {
      bankAccountId: bankId,
      transactionDate: date,
      type: 'DEPOSIT',
      description: `E2E deposit ${stamp}`,
      amount: depositAmt,
      contraAccountId: revenue.id,
      reference: `E2E-DEP-${stamp}`,
    },
  });
  const depositId = dep.data?.data?.id;
  assert(
    (dep.status === 201 || dep.status === 200) && !!depositId,
    'Create DEPOSIT',
    `status=${dep.status} err=${dep.error || ''} id=${depositId || ''}`,
  );

  const wd = await req('POST', '/api/banking/transactions', {
    token,
    body: {
      bankAccountId: bankId,
      transactionDate: date,
      type: 'WITHDRAWAL',
      description: `E2E withdrawal ${stamp}`,
      amount: withdrawAmt,
      contraAccountId: expense.id,
      reference: `E2E-WD-${stamp}`,
    },
  });
  const withdrawId = wd.data?.data?.id;
  assert(
    (wd.status === 201 || wd.status === 200) && !!withdrawId,
    'Create WITHDRAWAL',
    `status=${wd.status} err=${wd.error || ''} id=${withdrawId || ''} body=${JSON.stringify(wd.data)?.slice(0, 200)}`,
  );
  if (!depositId || !withdrawId) {
    writeProof();
    process.exit(1);
  }

  const afterTx = await req('GET', `/api/banking/accounts/${bankId}`, { token });
  const bookBal = Number(afterTx.data?.data?.currentBalance);
  assert(
    afterTx.status === 200 && nearly(bookBal, expectedCleared),
    'Book (GL) balance = deposit − withdrawal',
    String(bookBal),
  );

  log('\n── 3. Unbalanced reconcile must fail ──');
  const badRecon = await req('POST', '/api/banking/reconcile', {
    token,
    body: {
      bankAccountId: bankId,
      transactionIds: [depositId, withdrawId],
      statementBalance: expectedCleared + 50_000, // deliberately wrong
      statementDate: date,
    },
  });
  assert(
    badRecon.status >= 400,
    'Unbalanced reconcile rejected by API',
    `status=${badRecon.status} err=${badRecon.error || ''}`,
  );
  assert(
    String(badRecon.error || badRecon.text || '').match(/unbalanced|difference|cleared/i) != null,
    'Error mentions unbalanced / cleared / difference',
    String(badRecon.error || '').slice(0, 180),
  );

  log('\n── 4. Balanced reconcile must succeed ──');
  const goodRecon = await req('POST', '/api/banking/reconcile', {
    token,
    body: {
      bankAccountId: bankId,
      transactionIds: [depositId, withdrawId],
      statementBalance: expectedCleared,
      statementDate: date,
    },
  });
  const result = goodRecon.data?.data;
  assert(goodRecon.status === 200 && !!result, 'Balanced reconcile HTTP 200', goodRecon.error);
  assert(Number(result?.reconciledCount) === 2, 'Reconciled count = 2', String(result?.reconciledCount));
  assert(nearly(result?.newBalance, expectedCleared), 'newBalance = statement ending', String(result?.newBalance));
  assert(nearly(result?.clearedBalance, expectedCleared), 'clearedBalance matches', String(result?.clearedBalance));
  assert(nearly(result?.difference, 0), 'difference ~ 0', String(result?.difference));
  assert(nearly(result?.bookBalance, expectedCleared), 'bookBalance reported', String(result?.bookBalance));

  log('\n── 5. Persist last reconciled on account ──');
  const finalAcc = await req('GET', `/api/banking/accounts/${bankId}`, { token });
  const last = finalAcc.data?.data?.lastReconciledBalance;
  assert(
    finalAcc.status === 200 && nearly(last, expectedCleared),
    'lastReconciledBalance persisted = statement ending',
    String(last),
  );
  assert(!!finalAcc.data?.data?.lastReconciledAt, 'lastReconciledAt set');

  const txList = await req(
    'GET',
    `/api/banking/accounts/${bankId}/transactions?isReconciled=true&limit=50`,
    { token },
  );
  const txs = txList.data?.data?.transactions ?? [];
  const reconciledIds = new Set(txs.filter((t) => t.isReconciled).map((t) => t.id));
  assert(reconciledIds.has(depositId) && reconciledIds.has(withdrawId), 'Both transactions flagged reconciled');

  // Cleanup: deactivate bank account (keep GL trail for audit)
  await req('PATCH', `/api/banking/accounts/${bankId}`, {
    token,
    body: { isActive: false, name: `E2E Recon ${stamp} (done)` },
  });

  log('\n' + '═'.repeat(76));
  if (fail > 0) {
    log(` RESULT: E2E FAILED — ${pass} passed, ${fail} failed`);
  } else {
    log(` RESULT: E2E OK — ${pass} assertions — reconcile accurate end-to-end`);
  }
  log('═'.repeat(76));
  writeProof();
  process.exit(fail > 0 ? 1 : 0);
}

function writeProof() {
  const out = path.join(repoRoot, 'PROOF_BANK_RECONCILIATION_E2E.md');
  writeFileSync(out, lines.join('\n') + '\n', 'utf8');
  console.log(`\nWrote ${out}`);
}

main().catch((err) => {
  bad('Unhandled exception', err?.message || String(err));
  writeProof();
  process.exit(1);
});
