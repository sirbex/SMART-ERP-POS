#!/usr/bin/env node
/**
 * Heal Category A MUoM: product_uoms exist but products.base_uom_id is NULL.
 * Sets base_uom_id from the default product_uoms row (or first row).
 *
 * Usage:
 *   node scripts/heal-muom-set-base-from-product-uoms.mjs --tenant=henber
 *   node scripts/heal-muom-set-base-from-product-uoms.mjs --tenant=henber --execute
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXECUTE = process.argv.includes('--execute');

const TENANT_DB = {
  henber: 'pos_tenant_henber_pharmacy',
  dynamics: 'pos_tenant_dynamics',
};

function loadDatabaseUrl() {
  const tenantArg = process.argv.find((a) => a.startsWith('--tenant='));
  const tenant = tenantArg ? tenantArg.slice('--tenant='.length) : (process.env.TENANT || process.env.TENANT_DB || null);
  if (tenant === 'henber' && process.env.HENBER_DATABASE_URL) return process.env.HENBER_DATABASE_URL;
  const envPath = resolve(root, 'SamplePOS.Server/.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  if (process.env.DATABASE_URL) {
    const tenantDb = tenant ? (TENANT_DB[tenant.toLowerCase()] || tenant) : null;
    if (!tenantDb || tenantDb === 'default' || tenantDb === 'system') return process.env.DATABASE_URL;
    return process.env.DATABASE_URL.replace(/\/([^/?]+)(\?.*)?$/, `/${tenantDb}$2`);
  }
  const tenantDb = tenant ? (TENANT_DB[tenant.toLowerCase()] || tenant) : 'pos_tenant_henber_pharmacy';
  return `postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@postgres:5432/${tenantDb}`;
}

const FIND_SQL = `
  SELECT p.id, p.name, p.sku,
         pu.uom_id, u.symbol AS uom_symbol, u.name AS uom_name, pu.is_default
  FROM products p
  JOIN LATERAL (
    SELECT uom_id, is_default
    FROM product_uoms
    WHERE product_id = p.id
    ORDER BY is_default DESC, conversion_factor ASC
    LIMIT 1
  ) pu ON true
  JOIN uoms u ON u.id = pu.uom_id
  WHERE p.is_active = true
    AND p.base_uom_id IS NULL
  ORDER BY p.name
`;

async function main() {
  const dbUrl = loadDatabaseUrl();
  const pool = new pg.Pool({ connectionString: dbUrl });
  console.log(`=== heal-muom-set-base-from-product-uoms [${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}] ===`);
  console.log('DB:', dbUrl.replace(/\/\/[^@]+@/, '//***@'));

  const client = await pool.connect();
  try {
    const { rows } = await client.query(FIND_SQL);
    console.log(`\nCategory A candidates: ${rows.length}\n`);
    for (const r of rows) {
      console.log(`  ${r.sku || '(no sku)'}  ${r.name}  → base=${r.uom_symbol || r.uom_name}`);
    }
    if (rows.length === 0) {
      console.log('Nothing to heal.');
      return;
    }
    if (!EXECUTE) {
      console.log('\nDry run — pass --execute to set base_uom_id');
      return;
    }
    await client.query('BEGIN');
    for (const r of rows) {
      await client.query(
        `UPDATE products SET base_uom_id = $2, updated_at = NOW() WHERE id = $1`,
        [r.id, r.uom_id],
      );
    }
    await client.query('COMMIT');
    console.log(`\nHealed ${rows.length} product(s)`);
    const verify = await client.query(
      `SELECT COUNT(*)::int AS n FROM products p
       WHERE p.is_active = true AND p.base_uom_id IS NULL
         AND EXISTS (SELECT 1 FROM product_uoms pu WHERE pu.product_id = p.id)`,
    );
    console.log(`Remaining Category A: ${verify.rows[0].n} (expected 0)`);
    if (Number(verify.rows[0].n) > 0) process.exitCode = 1;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
