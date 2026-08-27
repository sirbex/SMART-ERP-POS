#!/usr/bin/env npx tsx
/**
 * Repair INV-POS gaps on all multistore tenant DBs (or one TARGET_DB).
 *
 *   npx tsx scripts/repair-pos-sellable-coverage-all-tenants.ts
 *   npx tsx scripts/repair-pos-sellable-coverage-all-tenants.ts --execute
 *   TARGET_DB=pos_tenant_foo npx tsx scripts/repair-pos-sellable-coverage-all-tenants.ts --execute
 */
import pg from 'pg';
import { multistoreSellableBackfillService } from '../src/modules/inventory/warehouse/multistoreSellableBackfillService.js';
import { findPosSellableCoverageGaps } from '../src/modules/inventory/warehouse/posSellableCoverage.js';

const execute = process.argv.includes('--execute');
const host =
  process.env.PROD_PG_BASE ||
  'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@209.38.203.138:5432';

async function listTenantDbs(admin: pg.Pool): Promise<string[]> {
  if (process.env.TARGET_DB) return [process.env.TARGET_DB];
  const r = await admin.query(`
    SELECT datname FROM pg_database
    WHERE datname LIKE 'pos_tenant_%'
      AND datallowconn
    ORDER BY datname`);
  return r.rows.map((x) => x.datname as string);
}

const admin = new pg.Pool({ connectionString: `${host}/postgres`, connectionTimeoutMillis: 20000 });
const dbs = await listTenantDbs(admin);
await admin.end();

console.log(`mode=${execute ? 'EXECUTE' : 'DRY-RUN'} tenants=${dbs.length}`);

const summary: Array<Record<string, unknown>> = [];
for (const db of dbs) {
  const pool = new pg.Pool({
    connectionString: `${host}/${db}`,
    connectionTimeoutMillis: 25000,
  });
  try {
    const hasCol = await pool.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name='system_settings' AND column_name='is_multistore_enabled'`);
    if (!hasCol.rowCount) {
      summary.push({ db, skip: 'no multistore column' });
      continue;
    }
    const flag = await pool.query(
      `SELECT COALESCE(is_multistore_enabled,false) AS on FROM system_settings LIMIT 1`,
    );
    if (!flag.rows[0]?.on) {
      summary.push({ db, skip: 'multistore off' });
      continue;
    }

    const before = await findPosSellableCoverageGaps(pool);
    console.log(`\n${db}: gaps_before=${before.length}`);

    if (!execute) {
      summary.push({ db, gapsBefore: before.length, sample: before.slice(0, 3) });
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await multistoreSellableBackfillService.ensurePosSellableFromBatches(client);
      await client.query('COMMIT');
      const after = await findPosSellableCoverageGaps(pool);
      console.log(`${db}: repaired`, result, `gaps_after=${after.length}`);
      summary.push({ db, gapsBefore: before.length, gapsAfter: after.length, result });
      if (after.length > 0) process.exitCode = 1;
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      console.error(`${db}: FAILED`, e instanceof Error ? e.message : e);
      summary.push({ db, error: e instanceof Error ? e.message : String(e) });
      process.exitCode = 1;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(`${db}: ERROR`, e instanceof Error ? e.message : e);
    summary.push({ db, error: e instanceof Error ? e.message : String(e) });
  } finally {
    await pool.end();
  }
}

console.log('\nSUMMARY', JSON.stringify(summary, null, 2));
