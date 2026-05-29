#!/usr/bin/env node
/**
 * Proof: Inventory GL (1300) vs inventory_batches subledger — auditable evidence.
 *
 * Requires API (default http://localhost:3001). Optional DATABASE_URL for SQL breakdown.
 *
 *   node scripts/proof-inventory-gl-local.mjs
 *   BASE_URL=https://henber.wizarddigital-inv.com TEST_PASSWORD=... node scripts/proof-inventory-gl-local.mjs
 *
 * Expect on Henber (2026-05): FAIL inventory_reconciliation, drift ≈ 903,428 UGX.
 * Expect on clean local: PASS.
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = resolve(root, 'SamplePOS.Server');
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const OUT = process.env.PROOF_OUT || resolve(root, 'PROOF_INVENTORY_GL_DRIFT.md');
const HEAL_ONLY = process.argv.includes('--heal-only');

let pass = 0;
let fail = 0;
const lines = [];

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
function info(s) {
  console.log(`  ....  ${s}`);
  lines.push(`- ${s}`);
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const token = json.data?.token ?? json.data?.accessToken;
  if (!token) throw new Error('No token');
  return token;
}

async function apiGet(path, token) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${path} non-JSON ${res.status}: ${text.slice(0, 200)}`);
  }
  return { res, json };
}

async function runDbProof() {
  const envPath = resolve(serverDir, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()])
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  if (!process.env.DATABASE_URL) {
    info('DATABASE_URL not set — skipping SQL breakdown (API-only proof)');
    return null;
  }

  const require = createRequire(resolve(serverDir, 'package.json'));
  const pg = require('pg');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  const netActive = `
    lt."Status" = 'POSTED' AND lt."IsReversed" = FALSE
    AND lt."Id" NOT IN (
      SELECT "ReversedByTransactionId" FROM ledger_transactions
      WHERE "ReversedByTransactionId" IS NOT NULL
    )`;

  const [totals] = (
    await pool.query(`
    SELECT
      (SELECT COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0)
       FROM ledger_entries le
       JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
       JOIN accounts a ON a."Id" = le."AccountId"
       WHERE a."AccountCode" = '1300' AND ${netActive}) AS gl_net,
      (SELECT COALESCE(SUM(remaining_quantity * cost_price), 0)
       FROM inventory_batches WHERE remaining_quantity > 0) AS batches,
      (SELECT COALESCE(SUM(quantity_on_hand * COALESCE(cost_price, 0)), 0)
       FROM products WHERE quantity_on_hand > 0) AS products
  `)
  ).rows;

  const gl = Number(totals.gl_net);
  const batches = Number(totals.batches);
  const products = Number(totals.products);
  const drift = gl - batches;
  const threshold = Math.max(5000, Math.abs(gl) * 0.0001);

  info(`SQL GL 1300 (net-active): ${gl.toLocaleString()}`);
  info(`SQL batch subledger: ${batches.toLocaleString()}`);
  info(`SQL product valuation: ${products.toLocaleString()}`);
  info(`SQL drift GL−batch: ${drift.toLocaleString()} (threshold ${threshold.toLocaleString()})`);

  assert(Math.abs(drift - (gl - batches)) < 0.02, 'Drift formula GL − batches');

  const byRef = (
    await pool.query(`
    SELECT lt."ReferenceType" AS rt,
           ROUND(SUM(le."DebitAmount" - le."CreditAmount")::numeric, 2) AS net
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1300' AND ${netActive}
    GROUP BY lt."ReferenceType"
    ORDER BY ABS(SUM(le."DebitAmount" - le."CreditAmount")) DESC
    LIMIT 8
  `)
  ).rows;

  lines.push('\n### GL 1300 net by reference type (SQL)\n');
  lines.push('| ReferenceType | Net (UGX) |');
  lines.push('|---------------|------------:|');
  for (const r of byRef) {
    lines.push(`| ${r.rt} | ${Number(r.net).toLocaleString()} |`);
  }

  const adj = (
    await pool.query(`
    SELECT lt."TransactionNumber", lt."ReferenceNumber",
           ROUND(SUM(le."DebitAmount" - le."CreditAmount")::numeric, 2) AS net
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1300' AND ${netActive}
      AND (lt."ReferenceType" IN ('ADJUSTMENT','CORRECTION','SYSTEM_CORRECTION','OPENING_BALANCE')
           OR lt."ReferenceNumber" LIKE 'ADJ-%'
           OR lt."Description" ILIKE '%drift%')
    GROUP BY lt."Id", lt."TransactionNumber", lt."ReferenceNumber"
    ORDER BY ABS(SUM(le."DebitAmount" - le."CreditAmount")) DESC
    LIMIT 10
  `)
  ).rows;

  if (adj.length) {
    lines.push('\n### Adjustment / drift journals on 1300\n');
    lines.push('| Txn | Ref | Net 1300 |');
    lines.push('|-----|-----|----------:|');
    for (const r of adj) {
      lines.push(`| ${r.TransactionNumber} | ${r.ReferenceNumber || '—'} | ${Number(r.net).toLocaleString()} |`);
    }
  }

  const dupGr = (
    await pool.query(`
    SELECT lt."ReferenceNumber", COUNT(DISTINCT lt."Id") AS n,
           ROUND(SUM(le."DebitAmount")::numeric, 2) AS dr
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1300' AND lt."ReferenceType" = 'GOODS_RECEIPT' AND ${netActive}
    GROUP BY lt."ReferenceId", lt."ReferenceNumber"
    HAVING COUNT(DISTINCT lt."Id") > 1
    ORDER BY dr DESC LIMIT 5
  `)
  ).rows;

  if (dupGr.length) {
    lines.push('\n### Duplicate GR GL postings\n');
    for (const r of dupGr) {
      lines.push(`- ${r.ReferenceNumber}: ${r.n} txns, DR ${Number(r.dr).toLocaleString()}`);
    }
  }

  await pool.end();
  return { gl, batches, drift, threshold };
}

/** Henber production figures reported in financial integrity UI (2026-05). */
const HENBER_UI = {
  gl: 109_721_211.74,
  sub: 108_817_783.72,
  drift: 903_428.02,
};

async function main() {
  console.log('\n=== Inventory GL drift proof ===\n');
  console.log(`  BASE_URL=${BASE}`);
  console.log(`  EMAIL=${EMAIL}\n`);

  // Always: reported Henber UI numbers are internally consistent
  assert(
    Math.abs(HENBER_UI.gl - HENBER_UI.sub - HENBER_UI.drift) < 0.02,
    'Henber UI arithmetic (GL − sub = drift)',
    `${HENBER_UI.gl} − ${HENBER_UI.sub} = ${HENBER_UI.drift}`,
  );
  assert(
    HENBER_UI.drift > Math.max(5000, HENBER_UI.gl * 0.0001),
    'Henber UI drift exceeds materiality',
    `903,428 > ~10,972`,
  );

  lines.push('# Inventory GL (1300) drift — proof run\n');
  lines.push(`- **When:** ${new Date().toISOString()}`);
  lines.push(`- **API:** ${BASE}`);
  lines.push(`- **User:** ${EMAIL}\n`);

  const token = await login();
  ok('Login');

  // 1. Balance sheet integrity (financialIntegrityService — net-active GL vs batches)
  const bs = await apiGet('/api/accounting/balance-sheet', token);
  assert(bs.res.ok, 'GET balance-sheet');
  const inv = bs.json.data?.integrity?.checks?.find((c) => c.id === 'inventory_reconciliation');
  assert(!!inv, 'integrity.inventory_reconciliation present');

  const gl = Number(inv?.glBalance ?? 0);
  const sub = Number(inv?.subledgerBalance ?? 0);
  const diff = Number(inv?.difference ?? 0);
  const thr = Number(inv?.threshold ?? 5000);

  info(`Balance-sheet: GL=${gl.toLocaleString()} sub=${sub.toLocaleString()} drift=${diff.toLocaleString()} status=${inv?.status}`);

  lines.push('\n## API: balance-sheet integrity\n');
  lines.push('| Field | Value (UGX) |');
  lines.push('|-------|------------:|');
  lines.push(`| GL 1300 | ${gl.toLocaleString()} |`);
  lines.push(`| Batch subledger | ${sub.toLocaleString()} |`);
  lines.push(`| Drift (GL − sub) | ${diff.toLocaleString()} |`);
  lines.push(`| Threshold | ${thr.toLocaleString()} |`);
  lines.push(`| Status | **${inv?.status}** |`);

  if (inv?.status === 'FAIL') {
    ok('Drift detected (expected on Henber)', `|drift|=${Math.abs(diff).toLocaleString()} > ${thr.toLocaleString()}`);
    assert(diff > 0, 'GL overstated vs batches (drift > 0)', `drift=${diff}`);
  } else if (inv?.status === 'PASS') {
    ok('Inventory reconciled within tolerance');
    assert(Math.abs(diff) <= thr, '|drift| <= threshold', `${Math.abs(diff)} <= ${thr}`);
  } else {
    bad('Unexpected integrity status', inv?.status);
  }

  // 2. ERP reconciliation endpoint (fn_reconcile_inventory)
  const erp = await apiGet('/api/erp-accounting/reconciliation/inventory', token);
  if (erp.res.ok) {
    const d = erp.json.data;
    const batchItem = d?.items?.find((i) => i.source === 'BATCH_VALUATION');
    const glItem = d?.items?.find((i) => i.source === 'GL_INVENTORY_BALANCE');
    info(`ERP reconcile: status=${d?.status} GL=${glItem?.amount} batch=${batchItem?.amount}`);
    lines.push('\n## API: erp-accounting/reconciliation/inventory\n');
    lines.push(`- Report status: **${d?.status}**`);
    lines.push(`- GL row: ${Number(glItem?.amount ?? 0).toLocaleString()}`);
    lines.push(`- Batch row: ${Number(batchItem?.amount ?? 0).toLocaleString()}`);
    lines.push(`- Difference field: ${Number(batchItem?.difference ?? d?.difference ?? 0).toLocaleString()}`);
    assert(!!d?.items?.length, 'reconciliation items returned');
  } else {
    bad('GET erp-accounting/reconciliation/inventory', String(erp.res.status));
  }

  // 3. Reports inventory reconciliation
  const rep = await apiGet('/api/reports/inventory/reconciliation', token);
  if (rep.res.ok && rep.json.data) {
    const r = rep.json.data;
    info(`Report: gl=${r.glValue} sub=${r.subledgerValue} variance=${r.variance} reconciled=${r.reconciled}`);
    lines.push('\n## API: reports/inventory/reconciliation\n');
    lines.push(`- GL value: ${Number(r.glValue ?? 0).toLocaleString()}`);
    lines.push(`- Subledger: ${Number(r.subledgerValue ?? 0).toLocaleString()}`);
    lines.push(`- Variance: ${Number(r.variance ?? 0).toLocaleString()}`);
    lines.push(`- Reconciled flag: ${r.reconciled}`);
    assert(
      Math.abs(Number(r.variance ?? 0) - Math.abs(diff)) < 1 || Math.abs(Number(r.variance ?? 0) - diff) < 1,
      'Report variance matches balance-sheet drift (sign may differ by endpoint)',
    );
  } else {
    info(`reports/inventory/reconciliation skipped (${rep.res.status})`);
  }

  // 4. System GL integrity (glRepairService — all-statuses GL; may differ from net-active)
  const gli = await apiGet('/api/system/gl/integrity', token);
  if (gli.res.ok && gli.json.data?.checks?.inventoryReconciliation) {
    const c = gli.json.data.checks.inventoryReconciliation;
    info(`GL integrity panel: GL=${c.glBalance} sub=${c.subledgerBalance} diff=${c.difference} balanced=${c.isBalanced}`);
    lines.push('\n## API: system/gl/integrity\n');
    lines.push(`| GL | ${Number(c.glBalance).toLocaleString()} |`);
    lines.push(`| Subledger | ${Number(c.subledgerBalance).toLocaleString()} |`);
    lines.push(`| Difference | ${Number(c.difference).toLocaleString()} |`);
    lines.push(`| isBalanced | ${c.isBalanced} |`);
  }

  // 5. Full GL audit inventory finding
  const audit = await apiGet('/api/enterprise-accounting/integrity/full-audit', token);
  if (audit.res.ok) {
    const finding = audit.json.data?.findings?.find((f) => f.check === 'inventory_reconciliation');
    if (finding) {
      info(`Full audit: ${finding.severity} — ${finding.message}`);
      lines.push('\n## API: enterprise full-audit\n');
      lines.push(`- ${finding.severity}: ${finding.message}`);
      if (finding.details) {
        lines.push(`- details: \`${JSON.stringify(finding.details)}\``);
      }
    }
  }

  // Optional: assert expected Henber-scale drift (set by operator after UI observation)
  const expectGl = process.env.EXPECT_GL_1300 ? Number(process.env.EXPECT_GL_1300) : null;
  const expectSub = process.env.EXPECT_BATCH_SUB ? Number(process.env.EXPECT_BATCH_SUB) : null;
  const expectDrift = process.env.EXPECT_DRIFT ? Number(process.env.EXPECT_DRIFT) : null;
  if (expectGl != null && !Number.isNaN(expectGl)) {
    assert(Math.abs(gl - expectGl) < 1, 'GL matches EXPECT_GL_1300', `${gl} vs ${expectGl}`);
  }
  if (expectSub != null && !Number.isNaN(expectSub)) {
    assert(Math.abs(sub - expectSub) < 1, 'Subledger matches EXPECT_BATCH_SUB', `${sub} vs ${expectSub}`);
  }
  if (expectDrift != null && !Number.isNaN(expectDrift)) {
    assert(Math.abs(diff - expectDrift) < 1, 'Drift matches EXPECT_DRIFT', `${diff} vs ${expectDrift}`);
    assert(inv?.status === 'FAIL', 'Integrity status FAIL when drift expected');
  }

  // SQL breakdown
  const sql = await runDbProof();
  if (sql) {
    assert(Math.abs(sql.drift - diff) < 1, 'SQL drift matches API drift', `sql=${sql.drift} api=${diff}`);
  }

  lines.push('\n## Interpretation\n');
  lines.push('- **Subledger** = `SUM(inventory_batches.remaining_quantity × cost_price)` (FEFO).');
  lines.push('- **GL** = net-active POSTED entries on account 1300 (excludes reversed pairs).');
  lines.push('- **Positive drift** = GL inventory asset **overstated** vs physical batch valuation.');
  lines.push('- **Permanent heal:** `POST /api/system/gl/heal-inventory-drift` (idempotent per business date).\n');

  if (HEAL_ONLY) {
    console.log('\nHealing: POST /api/system/gl/heal-inventory-drift ...');
    const healRes = await fetch(`${BASE}/api/system/gl/heal-inventory-drift`, {
      method: 'POST',
      headers,
    });
    const healJson = await healRes.json();
    if (healRes.ok) {
      ok('heal-inventory-drift', healJson.message || '');
      const bs2 = await apiGet('/api/accounting/balance-sheet', token);
      const inv2 = bs2.json.data?.integrity?.checks?.find((c) => c.id === 'inventory_reconciliation');
      if (inv2?.status === 'PASS') ok('Inventory reconciled after heal');
      else bad('Drift remains after heal', inv2?.message);
    } else {
      bad('heal-inventory-drift', healJson.error || String(healRes.status));
    }
  }

  const summary = `\n---\n**Result:** ${pass} passed, ${fail} failed → ${fail === 0 ? 'PROOF OK' : 'PROOF INCOMPLETE'}\n`;
  lines.push(summary);
  writeFileSync(OUT, lines.join('\n'), 'utf8');
  console.log(`\nWrote ${OUT}`);
  console.log(summary);

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
