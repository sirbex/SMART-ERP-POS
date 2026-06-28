#!/usr/bin/env npx tsx
/**
 * Scheduled / post-deploy governance snapshot capture.
 *
 * Usage:
 *   HENBER_DATABASE_URL=... npx tsx scripts/capture-governance-snapshot.ts
 *   CAPTURE_SOURCE=deploy FRAMEWORK_COMMIT=abc123 ...
 */
import pg from 'pg';
import { captureSnapshotWithAlerts } from '../src/modules/financial-governance/financialGovernanceService.js';
import { getBusinessDate } from '../src/utils/dateRange.js';

const pool = new pg.Pool({
  connectionString:
    process.env.HENBER_DATABASE_URL
    || process.env.DATABASE_URL
    || 'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@209.38.203.138:5432/pos_tenant_henber_pharmacy',
});

async function main() {
  const asOfDate = process.env.AS_OF_DATE || getBusinessDate();
  const captureSource = (process.env.CAPTURE_SOURCE || 'scheduled') as
    | 'manual'
    | 'scheduled'
    | 'signoff'
    | 'deploy'
    | 'stabilization';

  const result = await captureSnapshotWithAlerts(pool, {
    asOfDate,
    captureSource,
    frameworkCommit: process.env.FRAMEWORK_COMMIT,
    includeParity: true,
  });

  console.log(JSON.stringify({
    ok: true,
    snapshotId: result.snapshot.id,
    asOfDate: result.snapshot.asOfDate,
    periodCloseBlocked: result.snapshot.periodCloseBlocked,
    blockedDomains: result.snapshot.blockedDomains,
    alertsCreated: result.alertsCreated,
  }, null, 2));

  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
