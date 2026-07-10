/**
 * Gate F — Upgrade proof.
 * Structural checks always run; live schema checks run with DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { CURRENT_SCHEMA_VERSION } from '../../constants/schemaVersion.js';
import { findPostconditionDriftedMigrationFiles } from '../system/migrationPostconditions.js';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RUN_LIVE = !!process.env.DATABASE_URL;

function src(rel: string): string {
  return readFileSync(resolve(serverRoot, rel), 'utf8');
}

describe('Gate F — upgrade proof (structural)', () => {
  it('schema version SSOT is defined for tenant migration checks', () => {
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThan(0);
    const versionSrc = src('src/constants/schemaVersion.ts');
    expect(versionSrc).toContain('CURRENT_SCHEMA_VERSION');
  });

  it('migration postcondition verifier is wired for drift detection', () => {
    const migrationSrc = src('src/modules/system/migrationPostconditions.ts');
    expect(migrationSrc).toContain('findPostconditionDriftedMigrationFiles');
    expect(migrationSrc).toContain('verifyMigrationPostcondition');
  });

  it('lot schema anchors exist in migrations', () => {
    const auditMigration = src('db/migrations/012_batch_expiry_audit.sql');
    expect(auditMigration).toContain('CREATE TABLE IF NOT EXISTS batch_expiry_audit');
    expect(auditMigration).toContain('batch_id');
  });
});

describe('Gate F — upgrade proof (live DB)', () => {
  let pool: pg.Pool;

  beforeAll(() => {
    if (!RUN_LIVE) return;
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it(RUN_LIVE ? 'database schema_version is at current head' : 'live upgrade proof skipped', async () => {
    if (!RUN_LIVE) {
      expect(process.env.DATABASE_URL).toBeFalsy();
      return;
    }

    const maxVersion = await pool.query<{ version: number }>(
      `SELECT COALESCE(MAX(version), 0)::int AS version FROM schema_version`,
    );
    expect(maxVersion.rows[0]?.version).toBe(CURRENT_SCHEMA_VERSION);
  });

  it(RUN_LIVE ? 'lot schema columns required after upgrade exist' : 'live schema columns skipped', async () => {
    if (!RUN_LIVE) return;

    const columns = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (
           (table_name = 'inventory_batches' AND column_name IN ('expiry_date', 'source_type', 'status'))
           OR
           (table_name = 'product_lots' AND column_name IN ('inventory_batch_id', 'expiry_date', 'status'))
           OR
           (table_name = 'batch_expiry_audit' AND column_name IN ('batch_id', 'old_expiry_date', 'new_expiry_date'))
         )`,
    );

    const keys = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));
    expect(keys.has('inventory_batches.expiry_date')).toBe(true);
    expect(keys.has('inventory_batches.source_type')).toBe(true);
    expect(keys.has('product_lots.inventory_batch_id')).toBe(true);
    expect(keys.has('product_lots.expiry_date')).toBe(true);
    expect(keys.has('batch_expiry_audit.batch_id')).toBe(true);
  });

  it(RUN_LIVE ? 'migration postconditions show no drift after upgrade' : 'live postconditions skipped', async () => {
    if (!RUN_LIVE) return;
    const drifted = await findPostconditionDriftedMigrationFiles(pool);
    expect(drifted).toEqual([]);
  });
});
