#!/usr/bin/env node
/**
 * Evidence: compare local (deployed SHA / schema 540) vs Henber production.
 *
 *   node scripts/proof-local-vs-production-wht-pnl.mjs
 *
 * Requires .env.proof.production (HENBER_DATABASE_URL, BASE_URL, TEST_EMAIL, TEST_PASSWORD).
 * Writes PROOF_LOCAL_VS_PRODUCTION_WHT_PNL.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const require = createRequire(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../SamplePOS.Server/package.json'),
);
const pg = require('pg');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.proof.production');
const EXPECTED_COMMIT = '38e84ba';
const EXPECTED_SCHEMA = 540;

const lines = [];
const log = (s = '') => {
  lines.push(s);
  console.log(s);
};

let failed = 0;
function assert(label, ok, detail = '') {
  const mark = ok ? '✓' : '✗';
  if (!ok) failed += 1;
  log(`${mark} ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) {
    console.error('Missing .env.proof.production');
    process.exit(2);
  }
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

function git(args, cwd = ROOT) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return (r.stdout || '').trim();
}

function readSchemaConstant(repoPath) {
  const p = path.join(repoPath, 'SamplePOS.Server/src/constants/schemaVersion.ts');
  if (!fs.existsSync(p)) return null;
  const m = fs.readFileSync(p, 'utf8').match(/CURRENT_SCHEMA_VERSION\s*=\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

async function login(base, email, password) {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login HTTP ${res.status}`);
  const json = await res.json();
  const token = json.data?.token ?? json.data?.accessToken;
  if (!token) throw new Error('no token');
  return token;
}

async function apiGet(base, token, apiPath) {
  const res = await fetch(`${base.replace(/\/$/, '')}${apiPath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

loadEnv();

const BASE = process.env.BASE_URL;
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const DB_URL = process.env.HENBER_DATABASE_URL;
const WT = path.join(path.dirname(ROOT), 'SamplePOS-wht');

log('════════════════════════════════════════════════════════════════════════');
log(' LOCAL vs PRODUCTION PROOF — WHT + P&L (schema 540)');
log(` Generated: ${new Date().toISOString()}`);
log(` Deploy merge commit (expected): ${EXPECTED_COMMIT}`);
log('════════════════════════════════════════════════════════════════════════');

log('\n── 1. Git / code fingerprints ──');
const remoteMain = git(['ls-remote', 'https://github.com/wizard-digital/SMART-ERP-POS.git', 'refs/heads/main']).split(/\s+/)[0]?.slice(0, 7);
const localOrigin = git(['rev-parse', '--short', 'origin/main']);
const worktreeHead = fs.existsSync(WT)
  ? git(['rev-parse', '--short', 'HEAD'], WT)
  : '(no SamplePOS-wht worktree)';
const fetchHeadSchema = (() => {
  try {
    // use fetched main tip if available
    const tip = git(['rev-parse', 'FETCH_HEAD']);
    if (!tip) return null;
    const show = spawnSync(
      'git',
      ['show', 'FETCH_HEAD:SamplePOS.Server/src/constants/schemaVersion.ts'],
      { cwd: ROOT, encoding: 'utf8' },
    );
    const m = (show.stdout || '').match(/CURRENT_SCHEMA_VERSION\s*=\s*(\d+)/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
})();

log(` Remote wizard-digital/main tip: ${remoteMain || 'unknown'}`);
log(` Local origin/main tip:          ${localOrigin} (may lag until git pull)`);
log(` WHT worktree HEAD:              ${worktreeHead}`);
assert(
  'Remote main includes deploy merge',
  Boolean(remoteMain && remoteMain.startsWith(EXPECTED_COMMIT.slice(0, 7))),
  `${remoteMain} vs ${EXPECTED_COMMIT}`,
);

const localDirtySchema = readSchemaConstant(ROOT);
const wtSchema = fs.existsSync(WT) ? readSchemaConstant(WT) : null;
log(` Local working-tree schemaVersion.ts: ${localDirtySchema ?? 'n/a'} (dirty WIP may be 549)`);
log(` Worktree schemaVersion.ts:           ${wtSchema ?? 'n/a'}`);
log(` FETCH_HEAD schemaVersion.ts:         ${fetchHeadSchema ?? 'n/a'}`);
assert('Deployed code expects schema 540', fetchHeadSchema === EXPECTED_SCHEMA || wtSchema === EXPECTED_SCHEMA);

log('\n── 2. Production DB (Henber) ──');
if (!DB_URL) {
  assert('HENBER_DATABASE_URL set', false);
} else {
  const pool = new pg.Pool({ connectionString: DB_URL, connectionTimeoutMillis: 20000 });
  try {
    const dbName = (await pool.query('SELECT current_database() AS db')).rows[0].db;
    log(` Connected: ${dbName}`);

    const ver = await pool.query(
      `SELECT MAX(version)::int AS max_version FROM schema_version`,
    );
    const maxVer = Number(ver.rows[0]?.max_version ?? 0);
    assert(`schema_version MAX = ${EXPECTED_SCHEMA}`, maxVer === EXPECTED_SCHEMA, `got ${maxVer}`);

    for (const v of [536, 537, 539, 540]) {
      const r = await pool.query(`SELECT 1 FROM schema_version WHERE version = $1`, [v]);
      assert(`schema_version has ${v}`, r.rowCount > 0);
    }

    const accts = await pool.query(
      `SELECT "AccountCode", "AccountName", "IsActive"
       FROM accounts
       WHERE "AccountCode" IN ('1250','2350')
       ORDER BY "AccountCode"`,
    );
    const codes = new Set(accts.rows.map((r) => r.AccountCode));
    assert('Account 1250 Tax Receivable exists', codes.has('1250'));
    assert('Account 2350 WHT Payable exists', codes.has('2350'));
    for (const row of accts.rows) {
      log(`   ${row.AccountCode} ${row.AccountName} active=${row.IsActive}`);
    }

    const cashSrc = await pool.query(
      `SELECT COUNT(*)::int AS n
       FROM accounts
       WHERE "SystemAccountTag" = 'CASH'
         AND "AllowedSources" @> ARRAY['WHT_REMITTANCE','WHT_RECEIVABLE_RECOVERY']::text[]`,
    );
    assert(
      'Cash accounts allow WHT_REMITTANCE + WHT_RECEIVABLE_RECOVERY',
      Number(cashSrc.rows[0].n) > 0,
      `matching rows=${cashSrc.rows[0].n}`,
    );

    const wht6 = await pool.query(
      `SELECT code, is_active, name FROM tax_definitions WHERE code = 'WHT6'`,
    );
    if (wht6.rowCount === 0) {
      log('✓ tax_definitions.WHT6 absent (or never seeded) — OK');
    } else {
      assert('tax_definitions.WHT6 is inactive (migration 537)', wht6.rows[0].is_active === false, String(wht6.rows[0].is_active));
    }

    const fns = await pool.query(
      `SELECT p.proname
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('fn_get_profit_loss','fn_get_profit_loss_summary','fn_get_profit_loss_by_category')
       ORDER BY 1`,
    );
    const names = new Set(fns.rows.map((r) => r.proname));
    assert('fn_get_profit_loss present', names.has('fn_get_profit_loss'));
    assert('fn_get_profit_loss_summary present', names.has('fn_get_profit_loss_summary'));
    assert('fn_get_profit_loss_by_category present (540)', names.has('fn_get_profit_loss_by_category'));

    const srcDetail = await pool.query(
      `SELECT pg_get_functiondef(p.oid) AS def
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'fn_get_profit_loss'
       LIMIT 1`,
    );
    const detailDef = srcDetail.rows[0]?.def || '';
    assert(
      'fn_get_profit_loss maps 5xxx → COST_OF_GOODS_SOLD',
      detailDef.includes('COST_OF_GOODS_SOLD') && /LIKE\s+'5%'/.test(detailDef),
    );

    const srcSummary = await pool.query(
      `SELECT pg_get_functiondef(p.oid) AS def
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'fn_get_profit_loss_summary'
       LIMIT 1`,
    );
    const summaryDef = srcSummary.rows[0]?.def || '';
    assert(
      'fn_get_profit_loss_summary OpEx excludes 5xxx (NOT LIKE 5%)',
      /NOT\s+LIKE\s+'5%'/.test(summaryDef),
    );
  } finally {
    await pool.end();
  }
}

log('\n── 3. Production API (live) ──');
if (!BASE || !EMAIL || !PASSWORD) {
  assert('BASE_URL + credentials set', false);
} else {
  log(` BASE_URL: ${BASE}`);
  const health = await fetch(`${BASE.replace(/\/$/, '')}/api/health`);
  assert('GET /api/health', health.ok, `HTTP ${health.status}`);

  let token;
  try {
    token = await login(BASE, EMAIL, PASSWORD);
    assert('Tenant login', true);
  } catch (e) {
    assert('Tenant login', false, e instanceof Error ? e.message : String(e));
  }

  if (token) {
    const today = new Date().toISOString().slice(0, 10);
    const from = `${today.slice(0, 7)}-01`;

    const whtTypes = await apiGet(BASE, token, '/api/withholding-tax/types');
    assert('GET /api/withholding-tax/types', whtTypes.status === 200, `HTTP ${whtTypes.status}`);

    const pl = await apiGet(
      BASE,
      token,
      `/api/erp-accounting/reports/profit-loss?dateFrom=${from}&dateTo=${today}`,
    );
    assert('GET /api/erp-accounting/reports/profit-loss', pl.status === 200, `HTTP ${pl.status}`);
    const summary = pl.json?.data?.summary || {};
    const hasNet =
      summary.netIncome != null || summary.netProfit != null || summary.net_income != null;
    assert('P&L summary exposes netIncome/netProfit', hasNet, JSON.stringify(Object.keys(summary)));
    if (pl.json?.data?.sections) {
      assert('P&L response includes sections object', true);
    } else {
      log('⚠ P&L sections object missing (older payload?)');
    }

    const cat = await apiGet(
      BASE,
      token,
      `/api/erp-accounting/reports/profit-loss/by-category?dateFrom=${from}&dateTo=${today}`,
    );
    assert(
      'GET /api/erp-accounting/reports/profit-loss/by-category',
      cat.status === 200,
      `HTTP ${cat.status}`,
    );

    const whtLane = await apiGet(
      BASE,
      token,
      `/api/erp-accounting/reconciliation/lanes/wht/integrity?asOfDate=${today}`,
    );
    assert(
      'GET /api/erp-accounting/reconciliation/lanes/wht/integrity',
      whtLane.status === 200,
      whtLane.status === 200
        ? String(whtLane.json?.data?.status ?? 'ok')
        : `HTTP ${whtLane.status}`,
    );
  }
}

log('\n── 4. Local unit proofs (no production mutation) ──');
const proofWht = path.join(ROOT, 'SamplePOS.Server/scripts/proof-wht-payment-splits.mjs');
const proofPnl = path.join(
  fs.existsSync(WT) ? WT : ROOT,
  'SamplePOS.Server/scripts/proof-pnl-ssot.mjs',
);
if (fs.existsSync(path.join(WT || '', 'SamplePOS.Server/scripts/proof-wht-payment-splits.mjs'))) {
  const r = spawnSync('node', [path.join(WT, 'SamplePOS.Server/scripts/proof-wht-payment-splits.mjs')], {
    cwd: WT,
    encoding: 'utf8',
    env: process.env,
  });
  assert('Local proof:wht (worktree)', r.status === 0, r.status === 0 ? 'PASS' : (r.stderr || r.stdout || '').slice(-200));
} else if (fs.existsSync(proofWht)) {
  log('⚠ proof-wht-payment-splits.mjs present on dirty tree — run via npm run proof:wht after pull');
}

if (fs.existsSync(proofPnl)) {
  const r = spawnSync('node', [proofPnl], {
    cwd: fs.existsSync(WT) ? WT : ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  assert('Local proof:pnl-ssot', r.status === 0, r.status === 0 ? 'PASS' : (r.stderr || r.stdout || '').slice(-200));
}

log('\n════════════════════════════════════════════════════════════════════════');
if (failed === 0) {
  log(' RESULT: PROOF OK — production matches deploy (schema 540, WHT + P&L live)');
} else {
  log(` RESULT: PROOF FAIL — ${failed} check(s) failed`);
}
log('════════════════════════════════════════════════════════════════════════');

const outPath = path.join(ROOT, 'PROOF_LOCAL_VS_PRODUCTION_WHT_PNL.md');
fs.writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`\nWrote ${outPath}`);
process.exit(failed === 0 ? 0 : 1);
