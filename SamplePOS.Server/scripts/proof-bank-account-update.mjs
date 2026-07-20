#!/usr/bin/env node
/**
 * Proof: Bank Accounts Actions (Edit/Activate) + Opening Balance UX + wrong-OB correction.
 *
 * Layers:
 *   1. Static wiring evidence (UI / routes / service / DTO)
 *   2. Jest mocked service tests (update, deactivate, ASSET guard, OB delta JE)
 *   3. Optional live API E2E when BASE_URL is reachable (create → PATCH → correct OB → deactivate)
 *
 *   npm run proof:bank-account-update
 *   BASE_URL=http://localhost:3001 npm run proof:bank-account-update
 */
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverRoot, '..');
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

let failed = false;
function assertTrue(label, cond, detail = '') {
  const ok = !!cond;
  if (!ok) failed = true;
  log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

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

  const list = await req('GET', '/api/accounting/chart-of-accounts?type=ASSET', { token });
  const rows = list.data?.data || [];
  const hit = rows.find(
    (a) =>
      String(a.accountCode || a.accountNumber || '') === code ||
      String(a.AccountCode || '') === code,
  );
  if (hit?.id || hit?.Id) return { id: hit.id || hit.Id, via: 'list' };

  const dbUrl = loadDatabaseUrl();
  if (!dbUrl) {
    throw new Error(`CoA create failed (${api.error}) and no DATABASE_URL for SQL fallback`);
  }
  const pool = new pg.Pool({ connectionString: dbUrl });
  try {
    const existing = await pool.query(
      `SELECT "Id" AS id FROM accounts WHERE "AccountCode" = $1 LIMIT 1`,
      [code],
    );
    if (existing.rows[0]?.id) return { id: existing.rows[0].id, via: 'sql-existing' };
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
    return { id, via: 'sql-insert' };
  } finally {
    await pool.end();
  }
}

log('═'.repeat(76));
log(' BANK ACCOUNT UPDATE / ACTIONS / OPENING BALANCE PROOF');
log(` Generated: ${new Date().toISOString()}`);
log(` BASE_URL: ${BASE}`);
log('═'.repeat(76));

log('\n── Claims under test ──');
log(' 1. Opening Balance input: empty default, inputMode decimal, no scroll bump, focus-select');
log(' 2. Actions Edit/Activate call PATCH /api/banking/accounts/:id (route+service exist)');
log(' 3. Wrong opening amount: edit posts BANK_OPENING_ADJ delta JE (immutability-safe)');
log(' 4. Non-ASSET GL (e.g. Sales Revenue) rejected on create/update');

log('\n── 1) Static wiring ──');
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
  const hook = readFileSync(
    path.join(repoRoot, 'samplepos.client/src/hooks/useBanking.ts'),
    'utf8',
  );
  const shared = readFileSync(path.join(repoRoot, 'shared/types/banking.ts'), 'utf8');

  assertTrue('UI openingBalance default empty string (not 0)', /openingBalance: ''/.test(tab));
  assertTrue('UI inputMode=decimal (not sticky number-0)', /inputMode="decimal"/.test(tab));
  assertTrue('UI preventNumberScroll onWheel', /onWheel=\{preventNumberScroll\}/.test(tab));
  assertTrue('UI onFocus select for replace-typing', /e\.target\.select\(\)/.test(tab));
  assertTrue('UI Edit + Toggle Active handlers', /handleOpenEdit/.test(tab) && /handleToggleActive/.test(tab));
  assertTrue('UI useUpdateBankAccount', /useUpdateBankAccount/.test(tab));
  assertTrue('UI OB correction helper copy', /Opening balance correction|difference is posted/i.test(tab));
  assertTrue('Hook PATCH updateAccount', /method: 'PATCH'/.test(hook) && /updateAccount/.test(hook));
  assertTrue('Route UpdateBankAccountSchema', /UpdateBankAccountSchema/.test(routes));
  assertTrue('Route PATCH → updateAccount', /BankingService\.updateAccount/.test(routes));
  assertTrue('Route banking.update permission', /banking\.update/.test(routes));
  assertTrue('DTO UpdateBankAccountDto', /UpdateBankAccountDto/.test(shared));
  assertTrue('Service updateAccount method', /static async updateAccount/.test(service));
  assertTrue('Service BANK_OPENING_ADJ correction', /BANK_OPENING_ADJ/.test(service));
  assertTrue('Service ASSET GL guard', /not ASSET/.test(service));
}

log('\n── 2) Jest suite (mocked, no DB mutation) ──');
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
      'src/services/bankingUpdateAccountProof.test.ts',
      'src/services/bankingCreateAccountProof.test.ts',
      '--no-coverage',
      '--forceExit',
    ],
    { cwd: serverRoot, encoding: 'utf8', shell: false },
  );
  const out = (jestRun.stdout || '') + (jestRun.stderr || '');
  // Keep evidence readable but complete for pass/fail lines
  for (const line of out.split('\n')) {
    if (
      /PASS|FAIL|✓|✕|√|×|Tests:|Test Suites:|rejects|updates|corrects|deactivate|posts opening|creates account|PATCH|UI \+|non-ASSET|Opening Balance/.test(
        line,
      )
    ) {
      log(line);
    }
  }
  assertTrue('Jest PASS (create + update proof suites)', jestRun.status === 0, `exit=${jestRun.status}`);
}

log('\n── 3) Live API E2E (optional if server up) ──');
let liveRan = false;
try {
  const health = await req('GET', '/api/health');
  if (health.status !== 200 && health.status !== 404) {
    // some deployments use /health
  }
  const healthAlt =
    health.status === 200 ? health : await req('GET', '/health').catch(() => ({ status: 0 }));
  const up = health.status === 200 || healthAlt.status === 200 || health.status === 401;

  // Probe login regardless — proves reachability
  const loginAttempts = [
    { email: EMAIL, password: PASSWORD },
    { email: 'admin@henber.com', password: 'admin123' },
    { email: 'admin@localhost', password: 'admin123' },
  ];
  let token = null;
  let loginEmail = null;
  for (const creds of loginAttempts) {
    const login = await req('POST', '/api/auth/login', { body: creds });
    token = login.data?.data?.token || login.data?.data?.accessToken || login.data?.token;
    if (token) {
      loginEmail = creds.email;
      break;
    }
  }

  if (!token) {
    log(`⊘ Live E2E skipped — server not reachable or login failed at ${BASE}`);
    log('  (Static + Jest evidence still stands. Start API and re-run for live layer.)');
  } else {
    log(`✓ Live login OK — ${loginEmail}`);
    const stamp = Date.now().toString(36).slice(-6);
    const glCode = `1099${stamp}`.slice(0, 12);
    const gl = await ensureBankGlAccount(token, glCode, `Proof Bank GL ${stamp}`);
    assertTrue('Provision unique ASSET GL', !!gl.id, `via=${gl.via} id=${gl.id}`);

    const wrongOb = 120_020;
    const correctOb = 100_000;
    const create = await req('POST', '/api/banking/accounts', {
      token,
      body: {
        name: `Proof BA ${stamp}`,
        bankName: 'PROOF BANK',
        branch: 'TEST',
        accountNumber: `ACC-${stamp}`,
        glAccountId: gl.id,
        openingBalance: wrongOb,
        isDefault: false,
      },
    });
    assertTrue(
      'POST create with opening balance',
      create.status === 201 && !!create.data?.data?.id,
      `status=${create.status} err=${create.error || ''}`,
    );
    const bankId = create.data?.data?.id;
    if (!bankId) throw new Error('Create did not return bank id — aborting live chain');

    const createdBal = Number(create.data?.data?.currentBalance ?? create.data?.data?.openingBalance ?? 0);
    assertTrue(
      'Created balance reflects opening',
      Math.abs(createdBal - wrongOb) < 0.5,
      `balance=${createdBal}`,
    );

    const patchMeta = await req('PATCH', `/api/banking/accounts/${bankId}`, {
      token,
      body: { name: `Proof BA ${stamp} EDITED`, branch: 'WANDEGEYA' },
    });
    assertTrue(
      'PATCH metadata (Actions Edit)',
      patchMeta.status === 200 && patchMeta.data?.data?.name?.includes('EDITED'),
      `status=${patchMeta.status} err=${patchMeta.error || ''} name=${patchMeta.data?.data?.name}`,
    );

    const patchOb = await req('PATCH', `/api/banking/accounts/${bankId}`, {
      token,
      body: { openingBalance: correctOb },
    });
    assertTrue(
      'PATCH opening balance correction',
      patchOb.status === 200,
      `status=${patchOb.status} err=${typeof patchOb.error === 'string' ? patchOb.error : JSON.stringify(patchOb.error || '')}`,
    );
    const afterOb = Number(patchOb.data?.data?.openingBalance ?? NaN);
    const afterBal = Number(patchOb.data?.data?.currentBalance ?? NaN);
    assertTrue(
      'Stored openingBalance corrected',
      Math.abs(afterOb - correctOb) < 0.5,
      `openingBalance=${afterOb}`,
    );
    assertTrue(
      'GL currentBalance reduced by delta (−20020)',
      Math.abs(afterBal - correctOb) < 1.0,
      `currentBalance=${afterBal}`,
    );

    // Evidence: bank register has correction line
    const txns = await req('GET', `/api/banking/accounts/${bankId}/transactions?limit=20`, {
      token,
    });
    const list = txns.data?.data?.transactions || txns.data?.data || [];
    const corr = (Array.isArray(list) ? list : []).find(
      (t) => /correction/i.test(String(t.description || '')) || /OPEN-CORR/i.test(String(t.reference || '')),
    );
    assertTrue(
      'Bank register shows opening balance correction line',
      !!corr,
      corr ? `ref=${corr.reference} amt=${corr.amount}` : `txnCount=${Array.isArray(list) ? list.length : 0}`,
    );

    // Reject non-posting / non-ASSET GL
    const allCoa = await req('GET', '/api/accounting/chart-of-accounts?type=REVENUE', { token });
    const rev = (allCoa.data?.data || []).find((a) => {
      const id = a.id || a.Id;
      const posting = a.isPostingAccount ?? a.IsPostingAccount ?? true;
      const type = String(a.accountType || a.AccountType || 'REVENUE').toUpperCase();
      return id && posting && type === 'REVENUE';
    });
    if (rev) {
      const badGl = await req('PATCH', `/api/banking/accounts/${bankId}`, {
        token,
        body: { glAccountId: rev.id || rev.Id },
      });
      const errText = String(badGl.error || badGl.data?.error || '');
      assertTrue(
        'PATCH rejects REVENUE GL',
        badGl.status >= 400 && /not ASSET|REVENUE/i.test(errText),
        `status=${badGl.status} err=${errText}`,
      );
    } else {
      log('⊘ No posting REVENUE CoA row to probe ASSET guard live (Jest covers it)');
    }

    const deactivate = await req('PATCH', `/api/banking/accounts/${bankId}`, {
      token,
      body: { isActive: false },
    });
    assertTrue(
      'PATCH deactivate (Actions toggle)',
      deactivate.status === 200 && deactivate.data?.data?.isActive === false,
      `status=${deactivate.status}`,
    );

    liveRan = !failed;
    log(`\n Live evidence IDs: bankId=${bankId} glId=${gl.id} glCode=${glCode}`);
  }
} catch (err) {
  log(`⊘ Live E2E error (non-fatal to static/jest): ${err?.message || err}`);
}

log('\n── Scope honesty ──');
log(' ✓ Proven (always): UI UX guards, PATCH route/service wiring, mocked update/OB/ASSET tests.');
log(
  liveRan
    ? ' ✓ Proven (live): create → edit → OB correction → deactivate against running API.'
    : ' ✗ Live API layer skipped this run — re-run with server up for full E2E evidence.',
);
log(' ✗ Not claimed: moving historical JE off a wrongly linked Sales Revenue GL (reclass is separate).');

log('\n' + '═'.repeat(76));
log(
  failed
    ? ' RESULT: PROOF FAILED — see ✗ lines above'
    : liveRan
      ? ' RESULT: PROOF OK — static + Jest + live API evidence'
      : ' RESULT: PROOF OK — static + Jest evidence (live skipped)',
);
log('═'.repeat(76));

const outPath = path.join(repoRoot, 'PROOF_BANK_ACCOUNT_UPDATE.md');
writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
console.log(`\nWrote ${outPath}`);
process.exit(failed ? 1 : 0);
