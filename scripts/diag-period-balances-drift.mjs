#!/usr/bin/env node
/**
 * Diagnose gl_period_balances vs ledger_entries drift.
 *
 * Compares:
 *   A) WRONG (legacy integrity): all ledger_entries rows
 *   B) CORRECT (rebuild / audit): net-active POSTED only
 *
 * Heal: POST /api/system/gl/rebuild-period-balances
 *
 * Usage:
 *   node scripts/diag-period-balances-drift.mjs
 *   BASE_URL=https://... TEST_EMAIL=... TEST_PASSWORD=... node scripts/diag-period-balances-drift.mjs --heal
 */
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const HEAL = process.argv.includes('--heal');

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

function driftFromAudit(report) {
  const finding = report?.findings?.find((f) => f.check === 'period_balances_reconciliation');
  return finding;
}

async function main() {
  console.log('\n=== Period balances drift diagnostic ===\n');
  const token = await login();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const auditRes = await fetch(`${BASE}/api/enterprise-accounting/integrity/full-audit`, { headers });
  if (!auditRes.ok) throw new Error(`full-audit ${auditRes.status}: ${await auditRes.text()}`);
  const auditJson = await auditRes.json();
  const report = auditJson.data;
  const finding = driftFromAudit(report);

  console.log(`Audit status: ${report?.status} (${report?.errorCount ?? 0} errors)`);
  const proj = report?.findings?.find((f) => f.check?.startsWith('gl_projection_events'));
  if (proj) console.log(`Projection queue: ${proj.message}`);

  if (!finding || finding.severity === 'INFO') {
    console.log('\nNo period_balances_reconciliation drift (net-active comparison).');
    return;
  }

  console.log(`\nDrift: ${finding.message}`);
  if (finding.details?.remediation) console.log(`Remediation: ${finding.details.remediation}`);
  const samples = finding.details?.samples ?? [];
  for (const s of samples.slice(0, 8)) {
    console.log(
      `  ${s.accountCode} ${s.year}-P${String(s.period).padStart(2, '0')}: ` +
        `ledger D${s.ledgerDebits} C${s.ledgerCredits} vs gpb D${s.totalsDebits} C${s.totalsCredits} ` +
        `(Δ D${s.debitDrift} C${s.creditDrift})`,
    );
  }

  console.log(
    '\nRoot causes (in order of likelihood):',
    '\n  1. Stale gl_period_balances — async projection lag or FAILED gl_projection_events',
    '\n  2. Manual SQL on ledger without rebuild',
    '\n  3. (Fixed in code) Integrity check previously counted REVERSED rows — redeploy server',
  );

  if (!HEAL) {
    console.log('\nRun with --heal to POST /api/system/gl/rebuild-period-balances\n');
    process.exit(1);
  }

  console.log('\nHealing: rebuild-period-balances...');
  const healRes = await fetch(`${BASE}/api/system/gl/rebuild-period-balances`, {
    method: 'POST',
    headers,
  });
  if (!healRes.ok) throw new Error(`rebuild ${healRes.status}: ${await healRes.text()}`);
  const healJson = await healRes.json();
  console.log(healJson.message ?? JSON.stringify(healJson.data));

  const audit2Res = await fetch(`${BASE}/api/enterprise-accounting/integrity/full-audit`, { headers });
  const audit2Json = await audit2Res.json();
  const finding2 = driftFromAudit(audit2Json.data);
  if (!finding2 || finding2.severity === 'INFO') {
    console.log('\nPASS — period balances match ledger after rebuild.\n');
    return;
  }
  console.log('\nFAIL — drift remains after rebuild (investigate ledger vs subledger):');
  console.log(finding2.message);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
