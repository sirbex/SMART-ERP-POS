#!/usr/bin/env node
/**
 * Read inventory ↔ GL integrity from balance-sheet API (no DB required).
 *
 *   node scripts/proof-inventory-gl-integrity.mjs
 *   BASE_URL=https://henber.example node scripts/proof-inventory-gl-integrity.mjs
 */
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login ${res.status}`);
  const json = await res.json();
  const token = json.data?.token ?? json.data?.accessToken;
  if (!token) throw new Error('No token');
  return token;
}

async function main() {
  console.log('\n=== Inventory GL integrity (balance-sheet API) ===\n');
  const token = await login();
  const res = await fetch(`${BASE}/api/accounting/balance-sheet`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`balance-sheet ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const checks = json.data?.integrity?.checks ?? [];
  const inv = checks.find((c) => c.id === 'inventory_reconciliation');
  if (!inv) {
    console.log('No inventory_reconciliation check in response.');
    process.exit(1);
  }

  console.log(`Status: ${inv.status}`);
  console.log(inv.message);
  if (inv.glBalance != null) {
    console.log(`  GL 1300:     ${Number(inv.glBalance).toLocaleString()}`);
    console.log(`  Batches:     ${Number(inv.subledgerBalance).toLocaleString()}`);
    console.log(`  Drift (GL−Sub): ${Number(inv.difference).toLocaleString()}`);
    console.log(`  Threshold:   ${Number(inv.threshold).toLocaleString()}`);
  }
  if (inv.remediation) console.log(`\nRemediation: ${inv.remediation}`);

  if (inv.status === 'FAIL') {
    console.log('\nNext: run classify on tenant DB:');
    console.log('  cd SamplePOS.Server && DATABASE_URL=... node scripts/classify-inventory-gl-drift.mjs');
    console.log('  psql ... -f scripts/diag-inventory-gl-henber.sql\n');
    process.exit(1);
  }
  console.log('\nPASS\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
