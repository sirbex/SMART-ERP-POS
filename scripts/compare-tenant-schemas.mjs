#!/usr/bin/env node
/**
 * Compare public tables across all tenant DBs vs a reference database.
 * Production: run on server with POSTGRES_CONTAINER set.
 *
 *   POSTGRES_CONTAINER=samplepos-postgres node scripts/compare-tenant-schemas.mjs
 *   POSTGRES_CONTAINER=samplepos-postgres node scripts/compare-tenant-schemas.mjs --json
 */
import { execSync } from 'node:child_process';
import { TENANT_REQUIRED_TABLES } from './lib/migrationTableAnchors.mjs';
import { findPostconditionDriftedMigrationFiles } from './lib/migrationPostconditions.mjs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../SamplePOS.Server/package.json', import.meta.url));
const pg = require('pg');

const JSON_OUT = process.argv.includes('--json');
const REF = process.env.REFERENCE_DB || 'pos_system';
const CONTAINER = process.env.POSTGRES_CONTAINER;
const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system';

function psql(db, sql) {
  if (CONTAINER) {
    const out = execSync(
      `docker exec ${CONTAINER} psql -U postgres -d ${db} -t -A -c ${JSON.stringify(sql)}`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
    );
    return out.trim();
  }
  return null;
}

async function listTablesPool(connectionString, db) {
  const pool = new pg.Pool({ connectionString: connectionString.replace(/\/[^/]+$/, `/${db}`), max: 1 });
  try {
    const { rows } = await pool.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1`,
    );
    return new Set(rows.map((r) => r.tablename));
  } finally {
    await pool.end();
  }
}

async function listTablesDocker(db) {
  const out = psql(db, `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1`);
  return new Set(out.split('\n').filter(Boolean));
}

async function postconditionDocker(db) {
  const cs = DATABASE_URL.replace(/\/[^/]+$/, `/${db}`);
  const pool = new pg.Pool({ connectionString: cs, max: 1 });
  try {
    return await findPostconditionDriftedMigrationFiles(pool);
  } catch {
    return ['(could not connect locally — use docker psql path)'];
  } finally {
    await pool.end().catch(() => {});
  }
}

async function postconditionViaDockerSql(db) {
  const drift = [];
  const doc417 = psql(
    db,
    `SELECT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid AND t.relname = 'invoices'
      WHERE c.conname = 'chk_invoices_document_type'
        AND pg_get_constraintdef(c.oid) ILIKE '%OPENING_BALANCE%'
    )`,
  );
  if (doc417 !== 't') drift.push('417_customer_opening_balance.sql');
  const ar = psql(
    db,
    `SELECT EXISTS (
      SELECT 1 FROM accounts
      WHERE "AccountCode"='1200' AND 'CUTOVER_OB' = ANY(COALESCE("AllowedSources", '{}'))
    )`,
  );
  if (ar !== 't' && !drift.includes('417_customer_opening_balance.sql')) {
    drift.push('417_customer_opening_balance.sql');
  }
  const cutover = psql(
    db,
    `SELECT EXISTS (
      SELECT 1 FROM accounts
      WHERE "AccountCode"='3050' AND 'CUTOVER_OB' = ANY(COALESCE("AllowedSources", '{}'))
    )`,
  );
  if (cutover !== 't') drift.push('20260616_cutover_accounting.sql');

  const legacyInvoice = psql(
    db,
    `SELECT EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = 'invoices' AND NOT t.tgisinternal
        AND t.tgname IN ('trg_sync_customer_on_invoice', 'trg_protect_paid_invoice')
    )`,
  );
  if (legacyInvoice === 't') {
    if (!drift.includes('061_drop_disabled_triggers.sql')) drift.push('061_drop_disabled_triggers.sql');
    if (!drift.includes('064_drop_protection_and_validation_triggers.sql')) {
      drift.push('064_drop_protection_and_validation_triggers.sql');
    }
  }

  const stockCounts = psql(
    db,
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'stock_counts'
    )`,
  );
  if (stockCounts !== 't') drift.push('20251118_create_stock_counts.sql');

  return drift;
}

function triggerCountDocker(db) {
  const out = psql(
    db,
    `SELECT count(*) FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND NOT t.tgisinternal`,
  );
  return Number(out) || 0;
}

async function main() {
  let databases = [];
  if (CONTAINER) {
    const list = psql(
      'postgres',
      `SELECT datname FROM pg_database WHERE datistemplate=false AND (datname='pos_system' OR datname LIKE 'pos_tenant_%') ORDER BY 1`,
    );
    databases = list.split('\n').filter(Boolean);
  } else {
    const pool = new pg.Pool({ connectionString: DATABASE_URL });
    const { rows } = await pool.query(
      `SELECT datname FROM pg_database WHERE datistemplate=false AND (datname='pos_system' OR datname LIKE 'pos_tenant_%') ORDER BY 1`,
    );
    databases = rows.map((r) => r.datname);
    await pool.end();
  }

  if (!databases.includes(REF)) {
    console.error(`Reference DB ${REF} not found`);
    process.exit(1);
  }

  const tableMap = {};
  for (const db of databases) {
    tableMap[db] = CONTAINER ? await listTablesDocker(db) : await listTablesPool(DATABASE_URL, db);
  }

  const refTables = tableMap[REF];
  const refTriggerCount = CONTAINER ? triggerCountDocker(REF) : null;
  const allTables = new Set(refTables);
  for (const db of databases) {
    for (const t of tableMap[db]) allTables.add(t);
  }

  const report = [];
  for (const db of databases) {
    if (db === REF) continue;
    const missingVsRef = [...refTables].filter((t) => !tableMap[db].has(t)).sort();
    const extraVsRef = [...tableMap[db]].filter((t) => !refTables.has(t)).sort();
    const missingRequired = TENANT_REQUIRED_TABLES.filter((t) => !tableMap[db].has(t));
    const postDrift = CONTAINER ? await postconditionViaDockerSql(db) : await postconditionDocker(db);
    const triggerCount = CONTAINER ? triggerCountDocker(db) : null;
    report.push({
      db,
      tableCount: tableMap[db].size,
      triggerCount,
      refTriggerCount,
      missingVsRef,
      extraVsRef,
      missingRequired,
      postconditionDrift: postDrift,
      ok: missingRequired.length === 0 && missingVsRef.length === 0 && postDrift.length === 0,
    });
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ reference: REF, refTableCount: refTables.size, report }, null, 2));
    return;
  }

  console.log(`\n=== Tenant schema comparison (reference: ${REF}, ${refTables.size} tables${refTriggerCount != null ? `, ${refTriggerCount} triggers` : ''}) ===\n`);
  for (const r of report) {
    const status = r.ok ? 'PASS' : 'FAIL';
    const trig =
      r.triggerCount != null && r.refTriggerCount != null
        ? `, ${r.triggerCount} triggers (ref ${r.refTriggerCount})`
        : '';
    console.log(`${status}  ${r.db} (${r.tableCount} tables${trig})`);
    if (r.missingRequired.length) {
      console.log(`        REQUIRED missing: ${r.missingRequired.join(', ')}`);
    }
    if (r.missingVsRef.length) {
      console.log(`        vs ${REF} missing: ${r.missingVsRef.slice(0, 15).join(', ')}${r.missingVsRef.length > 15 ? ` (+${r.missingVsRef.length - 15})` : ''}`);
    }
    if (r.extraVsRef.length) {
      console.log(`        vs ${REF} extra: ${r.extraVsRef.slice(0, 10).join(', ')}${r.extraVsRef.length > 10 ? '...' : ''}`);
    }
    if (r.postconditionDrift.length) {
      console.log(`        postcondition drift: ${r.postconditionDrift.join(', ')}`);
    }
  }

  const failed = report.filter((r) => !r.ok);
  console.log(`\n${report.length} tenant DB(s) compared, ${failed.length} with gaps\n`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
