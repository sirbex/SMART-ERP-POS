#!/usr/bin/env node
/**
 * Global tenant schema drift audit.
 *
 * Scans every ACTIVE tenant (and optionally pos_template) for:
 *   1. Missing required tables (TENANT_REQUIRED_TABLES)
 *   2. Migration-record drift (schema_migrations says applied but anchor tables missing)
 *
 * Usage:
 *   DATABASE_URL=postgresql://postgres:pass@localhost:5432/pos_system node scripts/audit-tenant-schema-drift.mjs
 *   node scripts/audit-tenant-schema-drift.mjs --heal   # apply idempotent DDL repairs
 *   node scripts/audit-tenant-schema-drift.mjs --json   # machine-readable output
 *
 * Production (docker):
 *   POSTGRES_CONTAINER=samplepos-postgres node scripts/audit-tenant-schema-drift.mjs
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import {
  buildMigrationTableAnchors,
  findDriftedMigrationFiles,
  relationSatisfiesAnchor,
  TENANT_REQUIRED_TABLES,
  resolveSqlDir,
} from './lib/migrationTableAnchors.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, '..', 'SamplePOS.Server', 'package.json'));
const pg = require('pg');

const HEAL = process.argv.includes('--heal');
const JSON_OUT = process.argv.includes('--json');
const INCLUDE_TEMPLATE = process.argv.includes('--include-template');

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD || 'password';

async function applyMigration(pool, slug, filename, sqlDir) {
  const filePath = path.join(sqlDir, filename);
  const sql = fs.readFileSync(filePath, 'utf-8');
  const checksum = crypto.createHash('sha256').update(sql).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      `INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)
       ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum, executed_at = now()`,
      [filename, checksum],
    );
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function auditTenant(pool, label, sqlDir, anchors) {
  const { rows } = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const { rows: viewRows } = await pool.query(
    `SELECT viewname FROM pg_views WHERE schemaname = 'public'`,
  );
  const existing = new Set(rows.map((r) => r.tablename));
  const views = new Set(viewRows.map((r) => r.viewname));

  const missingRequired = TENANT_REQUIRED_TABLES.filter((t) => !existing.has(t));
  const driftedMigrations = findDriftedMigrationFiles(existing, anchors, views);

  const driftDetails = driftedMigrations.map((filename) => ({
    migration: filename,
    missingTables: anchors[filename].filter(
      (t) => !relationSatisfiesAnchor(t, existing, views),
    ),
  }));

  let healed = [];
  if (HEAL && driftedMigrations.length > 0) {
    for (const filename of driftedMigrations) {
      await applyMigration(pool, label, filename, sqlDir);
      healed.push(filename);
      for (const t of anchors[filename]) existing.add(t);
    }
  }

  return {
    label,
    tableCount: existing.size,
    missingRequired,
    driftedMigrations,
    driftDetails,
    healed,
    ok: missingRequired.length === 0 && driftedMigrations.length === 0,
  };
}

async function main() {
  const sqlDir = resolveSqlDir();
  const anchors = buildMigrationTableAnchors(sqlDir);
  const anchorCount = Object.keys(anchors).length;

  const masterPool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    const { rows: tenants } = await masterPool.query(
      `SELECT slug, database_name, database_host, database_port
       FROM tenants WHERE status = 'ACTIVE' ORDER BY slug`,
    );

    const targets = tenants.map((t) => ({
      label: t.slug,
      database_name: t.database_name,
      database_host: t.database_host,
      database_port: t.database_port,
    }));

    if (INCLUDE_TEMPLATE) {
      targets.unshift({
        label: '__template__',
        database_name: 'pos_template',
        database_host: process.env.DB_HOST || 'localhost',
        database_port: parseInt(process.env.DB_PORT || '5432', 10),
      });
    }

    if (targets.length === 0) {
      console.log('No active tenants found.');
      return;
    }

    const results = [];
    for (const t of targets) {
      const pool = new pg.Pool({
        host: t.database_host,
        port: t.database_port,
        database: t.database_name,
        user: DB_USER,
        password: DB_PASSWORD,
        max: 2,
      });
      try {
        results.push(await auditTenant(pool, t.label, sqlDir, anchors));
      } catch (err) {
        results.push({
          label: t.label,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        await pool.end().catch(() => {});
      }
    }

    const failed = results.filter((r) => !r.ok);

    if (JSON_OUT) {
      console.log(JSON.stringify({ anchorCount, results, failed: failed.length }, null, 2));
    } else {
      console.log(`\n=== Tenant schema drift audit ===`);
      console.log(`SQL dir: ${sqlDir}`);
      console.log(`Idempotent migration anchors: ${anchorCount}`);
      console.log(`Required tables checked: ${TENANT_REQUIRED_TABLES.length}\n`);

      for (const r of results) {
        if (r.error) {
          console.log(`  FAIL  ${r.label}: ${r.error}`);
          continue;
        }
        if (r.ok) {
          console.log(`  PASS  ${r.label} (${r.tableCount} tables)`);
          continue;
        }
        console.log(`  FAIL  ${r.label}`);
        if (r.missingRequired?.length) {
          console.log(`        missing required: ${r.missingRequired.join(', ')}`);
        }
        for (const d of r.driftDetails ?? []) {
          console.log(
            `        drift ${d.migration}: missing ${d.missingTables.join(', ')}`,
          );
        }
        if (r.healed?.length) {
          console.log(`        healed: ${r.healed.join(', ')}`);
        }
      }

      console.log(`\n${results.length} tenant(s), ${failed.length} with drift/issues`);
      if (HEAL) console.log('( --heal applied idempotent migration DDL where drift detected )');
    }

    if (failed.length > 0) process.exit(1);
  } finally {
    await masterPool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
