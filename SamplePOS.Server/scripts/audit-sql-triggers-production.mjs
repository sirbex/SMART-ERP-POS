#!/usr/bin/env node
/**
 * Production SQL trigger audit — verify GL posting triggers are disabled/dropped.
 * Requires HENBER_DATABASE_URL or DATABASE_URL.
 */
import pg from 'pg';
import { resolveVerificationEnvironment } from '../../scripts/lib/production-verification-guard.mjs';

const { mode, henberDatabaseUrl } = resolveVerificationEnvironment({
  scriptName: 'SQL trigger production audit',
  requireHenberDatabase: false,
});

const url = henberDatabaseUrl || process.env.DATABASE_URL;
if (!url) {
  console.error('Set HENBER_DATABASE_URL or DATABASE_URL');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });

try {
  const res = await pool.query(`
    SELECT t.tgname AS trigger_name,
           c.relname AS table_name,
           CASE t.tgenabled
             WHEN 'O' THEN 'ENABLED'
             WHEN 'D' THEN 'DISABLED'
             ELSE t.tgenabled::text
           END AS status
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal
      AND n.nspname = 'public'
      AND t.tgname LIKE '%post%ledger%'
    ORDER BY c.relname, t.tgname
  `);

  console.log(`# SQL GL posting triggers (${mode})\n`);
  if (!res.rows.length) {
    console.log('✅ No trg_post_*_to_ledger triggers present (expected after migration 061)');
    process.exit(0);
  }

  console.table(res.rows);
  const enabled = res.rows.filter((r) => r.status === 'ENABLED');
  if (enabled.length) {
    console.error(`\n❌ ${enabled.length} GL posting trigger(s) still ENABLED — bypass risk`);
    process.exit(1);
  }
  console.log('\n✅ All GL posting triggers disabled or inactive');
} finally {
  await pool.end();
}
