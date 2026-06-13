#!/usr/bin/env node
/**
 * Repair PREVIEW for purchase_uom_id gaps — does NOT apply conversion factors.
 * Operator must supply --factor on --execute after verifying pack size.
 *
 * Usage:
 *   npm run preview:muom-purchase-uom-gap
 *   node scripts/preview-muom-purchase-uom-gap.mjs --sku=5551
 *   node scripts/preview-muom-purchase-uom-gap.mjs --sku=13 --factor=10 --execute
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'SamplePOS.Server/package.json'));
const pg = require('pg');

const EXECUTE = process.argv.includes('--execute');
const skuFilter = process.argv.find((a) => a.startsWith('--sku='))?.slice('--sku='.length);
const factorArg = process.argv.find((a) => a.startsWith('--factor='))?.slice('--factor='.length);
const factor = factorArg ? Number(factorArg) : null;

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

const GAP_SQL = `
  SELECT p.id, p.sku, p.name, p.base_uom_id, p.purchase_uom_id,
         COALESCE(pu.symbol, pu.name) AS purchase_uom,
         COALESCE(bu.symbol, bu.name) AS base_uom,
         pum.conversion_factor AS existing_factor
  FROM products p
  JOIN uoms bu ON bu.id = p.base_uom_id
  JOIN uoms pu ON pu.id = p.purchase_uom_id
  LEFT JOIN product_uoms pum ON pum.product_id = p.id AND pum.uom_id = p.purchase_uom_id
  WHERE p.is_active = true
    AND p.base_uom_id IS NOT NULL
    AND p.purchase_uom_id IS NOT NULL
    AND p.purchase_uom_id <> p.base_uom_id
    AND (
      pum.id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM item_uom_conversions iuc
        WHERE iuc.item_id = p.id
          AND iuc.from_uom_id = p.purchase_uom_id
          AND iuc.to_uom_id = p.base_uom_id
      )
    )
    ${skuFilter ? 'AND p.sku = $1' : ''}
  ORDER BY p.name
`;

function previewSql(row, f) {
  const hasRow = row.existing_factor != null;
  const lines = [`-- ${row.sku || row.name}: purchase ${row.purchase_uom} → base ${row.base_uom} (factor=${f})`];
  if (!hasRow) {
    lines.push(`INSERT INTO product_uoms (product_id, uom_id, conversion_factor, is_default, created_at, updated_at)
VALUES ('${row.id}', '${row.purchase_uom_id}', ${f}, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`);
  } else {
    lines.push(`-- product_uoms row exists (factor=${row.existing_factor}); sync conversion edge only`);
  }
  lines.push(`INSERT INTO item_uom_conversions (item_id, from_uom_id, to_uom_id, factor, is_canonical, created_at, updated_at)
VALUES ('${row.id}', '${row.purchase_uom_id}', '${row.base_uom_id}', ${f}, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (item_id, from_uom_id) DO UPDATE SET
  to_uom_id = EXCLUDED.to_uom_id,
  factor = EXCLUDED.factor,
  is_canonical = true,
  updated_at = CURRENT_TIMESTAMP;`);
  return lines.join('\n');
}

async function main() {
  const pool = new pg.Pool({ connectionString: loadDatabaseUrl() });
  const params = skuFilter ? [skuFilter] : [];
  const client = await pool.connect();

  try {
    const { rows } = await client.query(GAP_SQL, params);
    console.log(`=== preview-muom-purchase-uom-gap [${EXECUTE ? 'EXECUTE' : 'PREVIEW'}] ===\n`);
    console.log(`Gaps: ${rows.length}\n`);

    if (rows.length === 0) {
      console.log('Nothing to repair.');
      return;
    }

    if (EXECUTE && (factor == null || !Number.isFinite(factor) || factor <= 0)) {
      const needsFactor = rows.some((r) => r.existing_factor == null);
      if (needsFactor) {
        throw new Error('--execute requires explicit --factor=N when product_uoms row is missing.');
      }
    }

    for (const row of rows) {
      const f = EXECUTE
        ? row.existing_factor != null
          ? Number(row.existing_factor)
          : factor
        : row.existing_factor != null
          ? Number(row.existing_factor)
          : '<SET_FACTOR>';
      console.log(previewSql(row, f));
      console.log('');
    }

    if (!EXECUTE) {
      console.log('Preview only. To apply ONE product:');
      console.log('  node scripts/preview-muom-purchase-uom-gap.mjs --sku=5551 --factor=30 --execute');
      return;
    }

    if (rows.length > 1 && skuFilter == null) {
      throw new Error('Use --sku= when --execute to repair one product at a time with verified factor.');
    }

    await client.query('BEGIN');
    for (const row of rows) {
      const existingPu = await client.query(
        `SELECT conversion_factor FROM product_uoms WHERE product_id = $1 AND uom_id = $2`,
        [row.id, row.purchase_uom_id],
      );
      const applyFactor =
        existingPu.rows[0]?.conversion_factor != null
          ? Number(existingPu.rows[0].conversion_factor)
          : factor;

      if (existingPu.rows.length === 0) {
        await client.query(
          `INSERT INTO product_uoms (product_id, uom_id, conversion_factor, is_default, created_at, updated_at)
           VALUES ($1, $2, $3, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [row.id, row.purchase_uom_id, applyFactor],
        );
      }

      await client.query(
        `INSERT INTO item_uom_conversions (item_id, from_uom_id, to_uom_id, factor, is_canonical, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (item_id, from_uom_id) DO UPDATE SET
           to_uom_id = EXCLUDED.to_uom_id,
           factor = EXCLUDED.factor,
           is_canonical = true,
           updated_at = CURRENT_TIMESTAMP`,
        [row.id, row.purchase_uom_id, row.base_uom_id, applyFactor],
      );
      console.log(`Applied ${row.sku || row.name} factor=${applyFactor}`);
    }
    await client.query('COMMIT');
    console.log('\nDone. Re-run: npm run audit:muom-purchase-uom-gap');
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
