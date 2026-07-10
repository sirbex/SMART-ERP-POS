/**
 * Apply 535 Administrator full-catalog grants to HENBER_DATABASE_URL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const url = process.env.HENBER_DATABASE_URL;
if (!url) {
  console.error('HENBER_DATABASE_URL required');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sqlPath = path.join(root, 'shared/sql/535_rbac_administrator_full_grants.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const c = new pg.Client({ connectionString: url });
await c.connect();
try {
  await c.query('BEGIN');
  await c.query(sql);
  await c.query(
    `INSERT INTO schema_migrations (filename, checksum)
     VALUES ($1, $2)
     ON CONFLICT (filename) DO NOTHING`,
    ['535_rbac_administrator_full_grants.sql', 'manual-apply-535']
  );
  await c.query('COMMIT');
  const row = await c.query(`
    SELECT count(*)::int AS perms FROM rbac_role_permissions rp
    JOIN rbac_roles r ON r.id = rp.role_id WHERE r.name = 'Administrator'
  `);
  console.log('535 applied. Administrator perms:', row.rows[0].perms);
} catch (e) {
  await c.query('ROLLBACK');
  console.error(e);
  process.exit(1);
} finally {
  await c.end();
}
