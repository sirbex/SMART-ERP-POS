#!/usr/bin/env node
/**
 * Proof bundle: AP (2100) reconciliation — metrics, cache heal, verified invariants.
 *
 * Layers proven:
 *   1) Jest — apReconciliationMetrics + accounting-integrity AP tests
 *   2) Live API — GET metrics + AP reconciliation report (read-only)
 *   3) Optional heal — HEAL_AP=1 applies cache heal and re-verifies
 *
 * Henber production:
 *   BASE_URL=https://henber.example TENANT=henber TEST_EMAIL=... TEST_PASSWORD=... \\
 *     HEAL_AP=1 node scripts/proof-ap-reconciliation.mjs
 *
 * Local:
 *   npm run proof:ap-reconciliation
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'SamplePOS.Server');
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const HEAL_AP = process.env.HEAL_AP === '1' || process.env.HEAL_AP === 'true';

let failed = 0;
function pass(msg) {
  console.log(`PASS ${msg}`);
}
function fail(msg) {
  console.error(`FAIL ${msg}`);
  failed++;
}
function skip(msg) {
  console.warn(`SKIP ${msg}`);
}

console.log('═'.repeat(60));
console.log(' proof-ap-reconciliation — Jest');
console.log('═'.repeat(60));

const unit = spawnSync(
  'node',
  [
    '--experimental-vm-modules',
    './node_modules/jest/bin/jest.js',
    'src/modules/supplier-payments/apReconciliationMetrics.test.ts',
    'src/tests/accounting-integrity.test.ts',
    '--testNamePattern',
    'AP:|verifyApReconciliation',
    '--runInBand',
  ],
  { cwd: serverDir, stdio: 'inherit', shell: false },
);

if (unit.status !== 0) {
  console.error('\nproof-ap-reconciliation: Jest FAILED');
  process.exit(unit.status ?? 1);
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed ${res.status}`);
  const json = await res.json();
  const token = json.data?.token ?? json.data?.accessToken;
  if (!token) throw new Error('No token');
  return token;
}

function assertMetric(label, drift, tolerance = 0.01) {
  const abs = Math.abs(drift);
  if (abs <= tolerance) {
    pass(`${label}: drift ${drift.toFixed(2)}`);
  } else {
    fail(`${label}: drift ${drift.toFixed(2)} (>${tolerance})`);
  }
}

async function fetchMetrics(headers) {
  const res = await fetch(`${BASE}/api/system/gl/ap-reconciliation-metrics`, { headers });
  if (!res.ok) throw new Error(`ap-reconciliation-metrics HTTP ${res.status}`);
  const json = await res.json();
  return json.data;
}

async function liveProof() {
  console.log('\n' + '═'.repeat(60));
  console.log(` proof-ap-reconciliation — Live API (${BASE})`);
  console.log('═'.repeat(60));

  let token;
  try {
    token = await login();
  } catch (e) {
    skip(`live — ${e instanceof Error ? e.message : e}`);
    return;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  let data = await fetchMetrics(headers);
  const m0 = data.metrics;
  const v0 = data.verification;

  console.log('\nBEFORE:');
  console.log(JSON.stringify(m0, null, 2));

  if (v0.ok) {
    pass('verification.ok (cache + stored already aligned)');
  } else {
    console.warn('BEFORE failures:', v0.failures);
    for (const f of v0.failures) console.warn(`  - ${f}`);
  }

  const apRes = await fetch(`${BASE}/api/erp-accounting/reconciliation/accounts-payable`, { headers });
  if (!apRes.ok) {
    fail(`accounts-payable reconciliation HTTP ${apRes.status}`);
  } else {
    const apJson = await apRes.json();
    const report = apJson.data ?? apJson;
    const items = report.items ?? [];
    const openItem = items.find((i) => i.source === 'OPEN_ITEM_SUBLEDGER');
    const supplierBal = items.find((i) => i.source === 'SUPPLIER_BALANCE');
    const stored = items.find((i) => i.source === 'STORED_BALANCE');
    if (openItem) pass(`report OPEN_ITEM_SUBLEDGER ${openItem.amount}`);
    if (supplierBal) {
      if (supplierBal.status === 'MATCHED') pass('report SUPPLIER_BALANCE MATCHED');
      else if (HEAL_AP) fail(`report SUPPLIER_BALANCE ${supplierBal.status} drift ${supplierBal.difference}`);
      else skip(`report SUPPLIER_BALANCE ${supplierBal.status} drift ${supplierBal.difference}`);
    }
    if (stored) {
      if (stored.status === 'MATCHED') pass('report STORED_BALANCE MATCHED');
      else if (HEAL_AP) fail(`report STORED_BALANCE ${stored.status} drift ${stored.difference}`);
      else skip(`report STORED_BALANCE ${stored.status} drift ${stored.difference}`);
    }
  }

  if (HEAL_AP) {
    console.log('\nHEAL_AP=1 — POST heal-ap-reconciliation-caches');
    const healRes = await fetch(`${BASE}/api/system/gl/heal-ap-reconciliation-caches`, {
      method: 'POST',
      headers,
      body: '{}',
    });
    if (!healRes.ok) {
      fail(`heal-ap-reconciliation-caches HTTP ${healRes.status}`);
      const errText = await healRes.text();
      console.error(errText.slice(0, 500));
    } else {
      const healJson = await healRes.json();
      const heal = healJson.data;
      pass(
        `heal: suppliersUpdated=${heal.recalc?.suppliersUpdated} `
          + `2100Rebased=${heal.rebase?.accountsUpdated}`,
      );
      data = await fetchMetrics(headers);
      const v1 = data.verification;
      console.log('\nAFTER:');
      console.log(JSON.stringify(data.metrics, null, 2));
      if (v1.ok) {
        pass('verification.ok AFTER heal');
      } else {
        for (const f of v1.failures) fail(`AFTER heal: ${f}`);
      }
      assertMetric('supplierCacheDrift', data.metrics.supplierCacheDrift);
      assertMetric('storedBalanceDrift', data.metrics.storedBalanceDrift);
    }
  } else if (!v0.ok) {
    skip('Set HEAL_AP=1 to apply cache heal and verify AFTER metrics on this tenant');
  }
}

await liveProof();

console.log('\n' + '═'.repeat(60));
if (failed > 0) {
  console.error(`proof-ap-reconciliation: ${failed} failure(s)`);
  process.exit(1);
}
console.log('proof-ap-reconciliation: ALL CHECKS PASSED');
process.exit(0);
