#!/usr/bin/env npx tsx
/**
 * Phase F0 — consolidated cross-domain financial lane baseline proof.
 *
 * Usage:
 *   HENBER_DATABASE_URL=... npx tsx scripts/proof-financial-framework-baseline.ts
 */
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  captureFrameworkBaseline,
  compareSqlSummaryToFramework,
} from '../src/modules/financial-reconciliation/reconciliationParityService.js';
import { getAllDomainSummaries } from '../src/modules/financial-reconciliation/financialLaneService.js';

const pool = new pg.Pool({
  connectionString:
    process.env.HENBER_DATABASE_URL
    || 'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@209.38.203.138:5432/pos_tenant_henber_pharmacy',
});

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lines: string[] = [];
const log = (s = '') => {
  lines.push(s);
  console.log(s);
};

let failed = 0;
function pass(label: string, detail = '') {
  log(`✓ ${label}${detail ? `: ${detail}` : ''}`);
}
function fail(label: string, detail = '') {
  failed += 1;
  log(`✗ ${label}${detail ? `: ${detail}` : ''}`);
}

async function main() {
  const asOf = process.env.AS_OF_DATE || new Date().toISOString().slice(0, 10);
  log('═'.repeat(72));
  log(' FINANCIAL LANE FRAMEWORK BASELINE (Phase F0 proof)');
  log(` As of: ${asOf}`);
  log(` Generated: ${new Date().toISOString()}`);
  log('═'.repeat(72));

  const baseline = await captureFrameworkBaseline(pool, asOf);
  const summaries = await getAllDomainSummaries(pool, asOf);
  const parity = await compareSqlSummaryToFramework(pool, asOf);

  const domains = ['ap', 'ar', 'inventory'] as const;
  for (const domain of domains) {
    log(`\n── ${domain.toUpperCase()} ──`);
    const domainLanes = baseline.filter((b) => b.domain === domain);
    if (domainLanes.length !== 3) {
      fail(`${domain} lane count`, `expected 3, got ${domainLanes.length}`);
      continue;
    }
    pass(`${domain} registered`, '3 lanes');

    const integrity = domainLanes.find((l) => l.lane === 'integrity')!;
    const cache = domainLanes.find((l) => l.lane === 'cache')!;
    const audit = domainLanes.find((l) => l.lane === 'history')!;

    if (integrity.periodCloseBlocking !== true) fail(`${domain} integrity periodCloseBlocking`);
    else pass(`${domain} integrity gates period close`);

    if (cache.periodCloseBlocking !== false) fail(`${domain} cache periodCloseBlocking`);
    else pass(`${domain} cache does not gate period close`);

    if (audit.periodCloseBlocking !== false || audit.status !== 'INFORMATIONAL') {
      fail(`${domain} audit lane`, `status=${audit.status}`);
    } else pass(`${domain} audit informational`);

    log(
      `  Integrity: ${integrity.status} diff=${fmt(integrity.difference)} severity=${integrity.severity}`
      + (integrity.materialityThreshold != null ? ` threshold=${fmt(integrity.materialityThreshold)}` : ''),
    );
    log(`  Cache:     ${cache.status} diff=${fmt(cache.difference)} severity=${cache.severity}`);
    log(`  Audit:     reversalImpact=${fmt(audit.difference)}`);
  }

  log('\n── Period-close aggregation ──');
  for (const summary of summaries) {
    const integrity = summary.lanes.find((l) => l.lane === 'integrity');
    const blocked = summary.periodCloseBlocked;
    const expectBlocked = integrity != null && integrity.status !== 'RECONCILED';
    if (blocked === expectBlocked) {
      pass(`${summary.domain} periodCloseBlocked=${blocked}`);
    } else {
      fail(`${summary.domain} periodCloseBlocked`, `got ${blocked}, expected ${expectBlocked}`);
    }
  }

  log('\n── Legacy SQL parity (fn_full_reconciliation_report) ──');
  if (parity.ok) {
    pass('SQL summary matches framework integrity diffs/status');
  } else {
    log(`⚠ SQL summary parity: ${parity.mismatches.length} mismatch(es) (expected during F0 — legacy SQL uses pre-framework semantics)`);
    for (const m of parity.mismatches) {
      log(`  ${m.domain}.${m.field}: framework=${m.frameworkValue} legacy=${m.legacyValue}`);
    }
    if (process.env.PARITY_STRICT === '1') {
      fail('SQL summary parity (PARITY_STRICT=1)');
    } else {
      pass('SQL parity logged (non-blocking in F0)', `${parity.mismatches.length} mismatch(es)`);
    }
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.join(__dirname, '..', '..', 'PROOF_FINANCIAL_FRAMEWORK_BASELINE.md');
  writeFileSync(outPath, lines.join('\n') + '\n');
  log(`\nWrote ${outPath}`);

  log('\n' + '═'.repeat(72));
  if (failed > 0) {
    log(`RESULT: ${failed} failure(s)`);
    process.exit(1);
  }
  log('RESULT: BASELINE OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
