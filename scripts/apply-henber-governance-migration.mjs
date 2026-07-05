#!/usr/bin/env node
/**
 * Apply migration 533_financial_governance.sql to Henber production tenant.
 * Fixes: GET /governance/dashboard 500 — missing financial_materiality_config table.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../SamplePOS.Server/package.json'));
const pg = require('pg');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIGRATION = '533_financial_governance.sql';
const SQL_PATH = path.join(ROOT, 'shared', 'sql', MIGRATION);

const url =
  process.env.HENBER_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!url) {
  console.error('Set HENBER_DATABASE_URL');
  process.exit(2);
}

const sql = fs.readFileSync(SQL_PATH, 'utf8');
const pool = new pg.Pool({ connectionString: url });

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      checksum TEXT
    );
  `);

  const applied = await pool.query(
    'SELECT 1 FROM schema_migrations WHERE filename = $1',
    [MIGRATION],
  );
  if (applied.rowCount) {
    console.log(`SKIP  ${MIGRATION} already applied`);
  } else {
    console.log(`APPLY ${MIGRATION}...`);
    await pool.query(sql);
    await pool.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
      [MIGRATION],
    );
    console.log(`DONE  ${MIGRATION}`);
  }

  const tables = await pool.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'financial_materiality_config',
        'financial_reconciliation_snapshots',
        'financial_period_close_signoffs',
        'financial_integrity_alerts'
      )
    ORDER BY 1
  `);
  console.log('Tables:', tables.rows.map((r) => r.tablename).join(', '));
} finally {
  await pool.end();
}
