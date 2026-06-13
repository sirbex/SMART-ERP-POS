#!/usr/bin/env node
/**
 * MUoM data-quality audit: products with base_uom_id but no product_uoms rows.
 * Legacy half-MUoM state — POS may show synthetic default-{productId} until fixed.
 *
 * Usage:
 *   node scripts/audit-muom-base-without-product-uoms.mjs
 *   node scripts/audit-muom-base-without-product-uoms.mjs --tenant=henber
 *   HENBER_DATABASE_URL=... node scripts/audit-muom-base-without-product-uoms.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'SamplePOS.Server/package.json'));
const pg = require('pg');

function loadDatabaseUrl() {
  const tenantArg = process.argv.find((a) => a.startsWith('--tenant='));
  const tenant = tenantArg ? tenantArg.slice('--tenant='.length) : null;
  if (tenant === 'henber' && process.env.HENBER_DATABASE_URL) return process.env.HENBER_DATABASE_URL;
  if (process.env.HENBER_DATABASE_URL && !tenant) return process.env.HENBER_DATABASE_URL;
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
    if (!tenant || tenant === 'default' || tenant === 'system') return process.env.DATABASE_URL;
    return process.env.DATABASE_URL.replace(/\/([^/?]+)(\?.*)?$/, `/pos_tenant_${tenant.replace(/-/g, '_')}$2`);
  }
  throw new Error('Set DATABASE_URL or HENBER_DATABASE_URL');
}

const AUDIT_SQL = `
  SELECT p.id, p.name, p.sku, p.base_uom_id,
         u.name AS base_uom_name, u.symbol AS base_uom_symbol
  FROM products p
  LEFT JOIN uoms u ON u.id = p.base_uom_id
  WHERE p.is_active = true
    AND p.base_uom_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM product_uoms pu WHERE pu.product_id = p.id
    )
  ORDER BY p.name
`;

async function main() {
  const pool = new pg.Pool({ connectionString: loadDatabaseUrl() });
  try {
    const { rows } = await pool.query(AUDIT_SQL);
    console.log('=== MUoM audit: base_uom_id set but no product_uoms ===\n');
    console.log(`Found ${rows.length} inconsistent product(s)\n`);
    if (rows.length === 0) {
      console.log('PASS — expected 0 rows');
      return;
    }
    for (const r of rows) {
      console.log(
        `  ${r.sku || '(no sku)'}  ${r.name}  base_uom_id=${r.base_uom_id} (${r.base_uom_symbol || r.base_uom_name || '?'})`,
      );
    }
    console.log('\nFAIL — legacy MUoM inconsistencies; add product_uoms rows or clear base_uom_id');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
