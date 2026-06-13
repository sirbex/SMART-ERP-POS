#!/usr/bin/env node
/**
 * Heal legacy MUoM: insert missing product_uoms for products that already have base_uom_id.
 *
 * Safe scope (default):
 *   - products.base_uom_id IS NOT NULL
 *   - no product_uoms rows yet
 *   - inserts one default row (factor=1) pointing at base_uom_id
 *
 * Does NOT change base_uom_id or rebase existing items.
 *
 * Usage:
 *   node scripts/heal-muom-base-without-product-uoms.mjs
 *   node scripts/heal-muom-base-without-product-uoms.mjs --tenant=henber
 *   node scripts/heal-muom-base-without-product-uoms.mjs --tenant=henber --execute
 *   node scripts/heal-muom-base-without-product-uoms.mjs --tenant=henber --execute --product=ff0c86f8-bf99-4bb9-a46f-f33d25db6924
 *
 * Production (on server):
 *   docker exec -w /app smarterp-backend node scripts/heal-muom-base-without-product-uoms.mjs --execute
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'SamplePOS.Server/package.json'));
const pg = require('pg');

const EXECUTE = process.argv.includes('--execute');
const productFilter = (() => {
  const m = process.argv.find((a) => a.startsWith('--product='));
  return m ? m.slice('--product='.length) : null;
})();

const TENANT_DB = {
  henber: 'pos_tenant_henber_pharmacy',
  dynamics: 'pos_tenant_dynamics',
};

function loadDatabaseUrl() {
  const tenantArg = process.argv.find((a) => a.startsWith('--tenant='));
  const tenantKey = (tenantArg ? tenantArg.slice('--tenant='.length) : (process.env.TENANT || process.env.TENANT_DB || '')).toLowerCase();
  if (tenantKey === 'henber' && process.env.HENBER_DATABASE_URL) return process.env.HENBER_DATABASE_URL;
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
    if (!tenantKey || tenantKey === 'default' || tenantKey === 'system') return process.env.DATABASE_URL;
    const tenantDb = TENANT_DB[tenantKey] || tenantKey;
    return process.env.DATABASE_URL.replace(/\/([^/?]+)(\?.*)?$/, `/${tenantDb}$2`);
  }
  if (tenantKey && TENANT_DB[tenantKey]) {
    return `postgresql://postgres:password@localhost:5432/${TENANT_DB[tenantKey]}`;
  }
  throw new Error('Set DATABASE_URL or HENBER_DATABASE_URL (with --tenant=henber)');
}

const FIND_SQL = `
  SELECT p.id, p.name, p.sku, p.base_uom_id,
         u.name AS base_uom_name, u.symbol AS base_uom_symbol
  FROM products p
  JOIN uoms u ON u.id = p.base_uom_id
  WHERE p.is_active = true
    AND p.base_uom_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM product_uoms pu WHERE pu.product_id = p.id)
    ${productFilter ? 'AND p.id = $1' : ''}
  ORDER BY p.name
`;

async function main() {
  const dbUrl = loadDatabaseUrl();
  const pool = new pg.Pool({ connectionString: dbUrl });
  const params = productFilter ? [productFilter] : [];

  console.log(`=== heal-muom-base-without-product-uoms [${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}] ===`);
  console.log('DB:', dbUrl.replace(/\/\/[^@]+@/, '//***@'));

  const client = await pool.connect();
  try {
    const { rows } = await client.query(FIND_SQL, params);
    console.log(`\nCandidates: ${rows.length} product(s) with base_uom_id but no product_uoms\n`);

    if (rows.length === 0) {
      console.log('Nothing to heal.');
      return;
    }

    for (const r of rows) {
      console.log(
        `  ${r.sku || '(no sku)'}  ${r.name}  → product_uoms(${r.base_uom_symbol || r.base_uom_name}, factor=1, default=true)`,
      );
    }

    if (!EXECUTE) {
      console.log('\nDry run — pass --execute to insert product_uoms rows');
      return;
    }

    await client.query('BEGIN');
    let healed = 0;
    for (const r of rows) {
      const ins = await client.query(
        `INSERT INTO product_uoms (product_id, uom_id, conversion_factor, is_default, created_at, updated_at)
         VALUES ($1, $2, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`,
        [r.id, r.base_uom_id],
      );
      if ((ins.rowCount ?? 0) > 0) healed += 1;
    }
    await client.query('COMMIT');
    console.log(`\nHealed ${healed} product(s)`);

    const verify = await client.query(
      `SELECT COUNT(*)::int AS n FROM products p
       WHERE p.is_active = true AND p.base_uom_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM product_uoms pu WHERE pu.product_id = p.id)`,
    );
    console.log(`Remaining inconsistent: ${verify.rows[0].n} (expected 0)`);
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
