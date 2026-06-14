#!/usr/bin/env node
/**
 * Full MUoM master-data integrity audit (read-only).
 *
 * Categories:
 *   A — base_uom_id NULL, product_uoms present
 *   B — base_uom_id set, product_uoms missing
 *   C — both missing (orphan — POS synthetic PIECE)
 *   D — invalid purchase_uom_id (not in product_uoms or no path to base)
 *   E — broken conversion graph (purchase/base set but no canonical path)
 *   OK — canonical MUoM complete
 *
 * Usage:
 *   node scripts/audit-muom-integrity-full.mjs
 *   node scripts/audit-muom-integrity-full.mjs --tenant=henber
 *   node scripts/audit-muom-integrity-full.mjs --tenant=henber --csv=out.csv
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'SamplePOS.Server/package.json'));
const pg = require('pg');

const csvArg = process.argv.find((a) => a.startsWith('--csv='));
const csvPath = csvArg ? csvArg.slice('--csv='.length) : null;

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
WITH pu_counts AS (
  SELECT product_id, COUNT(*)::int AS product_uoms_count
  FROM product_uoms GROUP BY product_id
),
conv_counts AS (
  SELECT item_id AS product_id, COUNT(*)::int AS conversion_count
  FROM item_uom_conversions GROUP BY item_id
),
base AS (
  SELECT
    p.id AS product_id,
    p.name AS product_name,
    p.sku,
    p.product_type,
    p.base_uom_id,
    bu.symbol AS base_uom,
    p.purchase_uom_id,
    pu_sym.symbol AS purchase_uom,
    COALESCE(pc.product_uoms_count, 0) AS product_uoms_count,
    COALESCE(cc.conversion_count, 0) AS conversion_count,
    p.created_at,
    p.updated_at,
    p.is_active
  FROM products p
  LEFT JOIN uoms bu ON bu.id = p.base_uom_id
  LEFT JOIN uoms pu_sym ON pu_sym.id = p.purchase_uom_id
  LEFT JOIN pu_counts pc ON pc.product_id = p.id
  LEFT JOIN conv_counts cc ON cc.product_id = p.id
  WHERE p.is_active = true
),
classified AS (
  SELECT b.*,
    CASE
      WHEN b.base_uom_id IS NULL AND b.product_uoms_count = 0 THEN 'C'
      WHEN b.base_uom_id IS NULL AND b.product_uoms_count > 0 THEN 'A'
      WHEN b.base_uom_id IS NOT NULL AND b.product_uoms_count = 0 THEN 'B'
      WHEN b.purchase_uom_id IS NOT NULL
        AND b.purchase_uom_id IS DISTINCT FROM b.base_uom_id
        AND NOT EXISTS (
          SELECT 1 FROM product_uoms pu
          WHERE pu.product_id = b.product_id AND pu.uom_id = b.purchase_uom_id
        ) THEN 'D'
      WHEN b.purchase_uom_id IS NOT NULL
        AND b.purchase_uom_id IS DISTINCT FROM b.base_uom_id
        AND b.base_uom_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM item_uom_conversions iuc
          WHERE iuc.item_id = b.product_id
            AND iuc.from_uom_id = b.purchase_uom_id
            AND iuc.to_uom_id = b.base_uom_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM product_uoms pu
          WHERE pu.product_id = b.product_id
            AND pu.uom_id = b.purchase_uom_id
            AND pu.uom_id = b.base_uom_id
        ) THEN 'E'
      ELSE 'OK'
    END AS category
  FROM base b
)
SELECT * FROM classified
ORDER BY category DESC, product_name
`;

const SUMMARY_SQL = `
SELECT category, COUNT(*)::int AS cnt
FROM (${AUDIT_SQL}) sub
GROUP BY category
ORDER BY category
`;

function escapeCsv(v) {
  const s = v == null ? '' : String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const dbUrl = loadDatabaseUrl();
  const pool = new pg.Pool({ connectionString: dbUrl });
  console.log('=== MUoM FULL INTEGRITY AUDIT ===');
  console.log('DB:', dbUrl.replace(/\/\/[^@]+@/, '//***@'));
  console.log('');

  try {
    const summary = await pool.query(SUMMARY_SQL);
    console.log('Category summary (active products):');
    console.log('  A = missing base_uom_id only');
    console.log('  B = missing product_uoms only');
    console.log('  C = missing both (POS synthetic PIECE)');
    console.log('  D = invalid purchase_uom_id (not in product_uoms)');
    console.log('  E = broken conversion graph');
    console.log('  OK = canonical complete');
    console.log('');
    for (const r of summary.rows) {
      console.log(`  ${r.category}: ${r.cnt}`);
    }
    const total = summary.rows.reduce((n, r) => n + r.cnt, 0);
    console.log(`  TOTAL active: ${total}`);
    console.log('');

    const { rows } = await pool.query(AUDIT_SQL);
    const orphans = rows.filter((r) => r.category === 'C');
    console.log(`Category C (orphan — matches offlineCatalog warning): ${orphans.length}`);
    if (orphans.length > 0 && orphans.length <= 15) {
      for (const r of orphans) {
        console.log(`  ${r.sku || '(no sku)'}  ${r.product_name}  created=${r.created_at?.toISOString?.()?.slice(0, 10) ?? r.created_at}`);
      }
    } else if (orphans.length > 15) {
      for (const r of orphans.slice(0, 10)) {
        console.log(`  ${r.sku || '(no sku)'}  ${r.product_name}`);
      }
      console.log(`  ... and ${orphans.length - 10} more`);
    }

    if (csvPath) {
      const header = [
        'product_id', 'product_name', 'sku', 'product_type', 'category',
        'base_uom', 'purchase_uom', 'product_uoms_count', 'conversion_count',
        'created_at', 'updated_at',
      ];
      const lines = [header.join(',')];
      for (const r of rows) {
        lines.push(
          header.map((h) => escapeCsv(r[h === 'base_uom' ? 'base_uom' : h === 'purchase_uom' ? 'purchase_uom' : h])).join(','),
        );
      }
      writeFileSync(csvPath, lines.join('\n'), 'utf8');
      console.log(`\nWrote ${rows.length} rows to ${csvPath}`);
    }

    const bad = rows.filter((r) => r.category !== 'OK').length;
    if (bad > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
