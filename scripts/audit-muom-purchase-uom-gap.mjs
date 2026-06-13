#!/usr/bin/env node
/**
 * MUoM audit: purchase_uom_id without valid product_uoms + conversion path.
 *
 * Usage:
 *   npm run audit:muom-purchase-uom-gap
 *   node scripts/audit-muom-purchase-uom-gap.mjs --tenant=henber
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'SamplePOS.Server/package.json'));
const pg = require('pg');

const TENANT_DB = {
  henber: 'pos_tenant_henber_pharmacy',
  dynamics: 'pos_tenant_dynamics',
};

function loadDatabaseUrl() {
  const tenantArg = process.argv.find((a) => a.startsWith('--tenant='));
  const tenant = tenantArg ? tenantArg.slice('--tenant='.length) : (process.env.TENANT || process.env.TENANT_DB || null);
  if (tenant === 'henber' && process.env.HENBER_DATABASE_URL) {
    return process.env.HENBER_DATABASE_URL;
  }
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
  throw new Error('Set DATABASE_URL or HENBER_DATABASE_URL');
}

const AUDIT_SQL = `
  SELECT p.id, p.sku, p.name,
         COALESCE(pu.symbol, pu.name) AS purchase_uom,
         COALESCE(bu.symbol, bu.name) AS base_uom,
         p.purchase_uom_id,
         p.base_uom_id,
         NOT EXISTS (
           SELECT 1 FROM product_uoms pum
           WHERE pum.product_id = p.id AND pum.uom_id = p.purchase_uom_id
         ) AS missing_product_uoms_row,
         NOT EXISTS (
           SELECT 1 FROM item_uom_conversions iuc
           WHERE iuc.item_id = p.id
             AND iuc.from_uom_id = p.purchase_uom_id
             AND iuc.to_uom_id = p.base_uom_id
         ) AS missing_conversion_path
  FROM products p
  JOIN uoms bu ON bu.id = p.base_uom_id
  JOIN uoms pu ON pu.id = p.purchase_uom_id
  WHERE p.is_active = true
    AND p.base_uom_id IS NOT NULL
    AND p.purchase_uom_id IS NOT NULL
    AND p.purchase_uom_id <> p.base_uom_id
    AND (
      NOT EXISTS (
        SELECT 1 FROM product_uoms pum
        WHERE pum.product_id = p.id AND pum.uom_id = p.purchase_uom_id
      )
      OR NOT EXISTS (
        SELECT 1 FROM item_uom_conversions iuc
        WHERE iuc.item_id = p.id
          AND iuc.from_uom_id = p.purchase_uom_id
          AND iuc.to_uom_id = p.base_uom_id
      )
    )
  ORDER BY p.sku NULLS LAST, p.name
`;

function yn(v) {
  return v ? 'Yes' : 'No';
}

async function main() {
  const pool = new pg.Pool({ connectionString: loadDatabaseUrl() });
  try {
    const { rows } = await pool.query(AUDIT_SQL);
    console.log('=== MUoM audit: purchase UoM integrity gaps ===\n');
    console.log(`Found ${rows.length} product(s)\n`);

    if (rows.length === 0) {
      console.log('PASS — expected 0 rows');
      return;
    }

    const header = ['Product', 'Purchase UoM', 'Base UoM', 'Missing product_uoms', 'Missing conversion'];
    const colWidths = [28, 14, 10, 20, 20];
    console.log(
      header.map((h, i) => h.padEnd(colWidths[i])).join('  '),
    );
    console.log(colWidths.map((w) => '-'.repeat(w)).join('  '));

    for (const r of rows) {
      const label = `${r.sku || '(no sku)'} ${r.name}`.slice(0, colWidths[0]);
      console.log(
        [
          label.padEnd(colWidths[0]),
          String(r.purchase_uom).padEnd(colWidths[1]),
          String(r.base_uom).padEnd(colWidths[2]),
          yn(r.missing_product_uoms_row).padEnd(colWidths[3]),
          yn(r.missing_conversion_path).padEnd(colWidths[4]),
        ].join('  '),
      );
    }

    console.log('\nFAIL — fix via Product UoMs UI or: npm run preview:muom-purchase-uom-gap');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
