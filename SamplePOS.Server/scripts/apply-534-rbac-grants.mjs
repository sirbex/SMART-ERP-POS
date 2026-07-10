/**
 * Apply 534 Manager/Accountant grant alignment to HENBER_DATABASE_URL (read-write).
 * Usage: load .env.proof.production then: node SamplePOS.Server/scripts/apply-534-rbac-grants.mjs
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
const sqlPath = path.join(root, 'shared/sql/534_rbac_manager_accountant_grant_align.sql');
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
    ['534_rbac_manager_accountant_grant_align.sql', 'manual-apply-534']
  );
  await c.query('COMMIT');

  const checks = await c.query(`
    SELECT r.name,
      EXISTS (
        SELECT 1 FROM rbac_role_permissions rp
        WHERE rp.role_id = r.id AND rp.permission_key = 'accounting.read'
      ) AS has_accounting_read,
      EXISTS (
        SELECT 1 FROM rbac_role_permissions rp
        WHERE rp.role_id = r.id AND rp.permission_key = 'customers.update'
      ) AS has_customers_update,
      EXISTS (
        SELECT 1 FROM rbac_role_permissions rp
        WHERE rp.role_id = r.id AND rp.permission_key = 'quotations.read'
      ) AS has_quotations_read,
      EXISTS (
        SELECT 1 FROM rbac_role_permissions rp
        WHERE rp.role_id = r.id AND rp.permission_key = 'distribution.read'
      ) AS has_distribution_read,
      (SELECT count(*)::int FROM rbac_role_permissions rp WHERE rp.role_id = r.id) AS total
    FROM rbac_roles r
    WHERE r.name IN ('Manager', 'Accountant')
    ORDER BY r.name
  `);
  console.log('534 applied. Verification:');
  for (const row of checks.rows) {
    console.log(JSON.stringify(row));
  }
} catch (e) {
  await c.query('ROLLBACK');
  console.error(e);
  process.exit(1);
} finally {
  await c.end();
}
