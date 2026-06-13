#!/usr/bin/env node
/**
 * Factual PO UoM failure diagnostic — shows exact DB state per product.
 * Usage: node scripts/diag-po-uom-failure.mjs [--product=uuid] [--sku=5551]
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'SamplePOS.Server/package.json'));
const pg = require('pg');

const productArg = process.argv.find((a) => a.startsWith('--product='))?.slice('--product='.length);
const skuArg = process.argv.find((a) => a.startsWith('--sku='))?.slice('--sku='.length);

function loadDatabaseUrl() {
  const envPath = resolve(root, 'SamplePOS.Server/.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL');
  return process.env.DATABASE_URL;
}

async function diagProduct(client, productId) {
  const p = await client.query(
    `SELECT p.id, p.sku, p.name, p.base_uom_id, p.purchase_uom_id, p.conversion_factor,
            bu.name AS base_uom, pu.name AS purchase_uom
     FROM products p
     LEFT JOIN uoms bu ON bu.id = p.base_uom_id
     LEFT JOIN uoms pu ON pu.id = p.purchase_uom_id
     WHERE p.id = $1`,
    [productId],
  );
  if (!p.rows[0]) return console.log(`Product ${productId} not found`);

  const row = p.rows[0];
  console.log('\n=== PRODUCT ===');
  console.log(JSON.stringify(row, null, 2));

  const puoms = await client.query(
    `SELECT pu.id AS product_uom_row_id, pu.uom_id, u.name, u.symbol, pu.conversion_factor, pu.is_default
     FROM product_uoms pu JOIN uoms u ON u.id = pu.uom_id
     WHERE pu.product_id = $1 ORDER BY pu.is_default DESC, u.name`,
    [productId],
  );
  console.log('\n=== product_uoms rows ===');
  console.log(puoms.rows.length ? puoms.rows : '(none)');

  const iuc = await client.query(
    `SELECT iuc.from_uom_id, fu.name AS from_uom, iuc.to_uom_id, tu.name AS to_uom, iuc.factor, iuc.is_canonical
     FROM item_uom_conversions iuc
     JOIN uoms fu ON fu.id = iuc.from_uom_id
     JOIN uoms tu ON tu.id = iuc.to_uom_id
     WHERE iuc.item_id = $1`,
    [productId],
  );
  console.log('\n=== item_uom_conversions rows ===');
  console.log(iuc.rows.length ? iuc.rows : '(none)');

  const purchaseUomId = row.purchase_uom_id;
  const baseUomId = row.base_uom_id;
  const purchaseInProductUoms = puoms.rows.some((r) => r.uom_id === purchaseUomId);
  const purchaseInConversions = iuc.rows.some(
    (r) => r.from_uom_id === purchaseUomId && r.to_uom_id === baseUomId,
  );

  console.log('\n=== PO AUTO-SELECT SIMULATION ===');
  console.log(`PO addLineItem sets selectedUomId = purchase_uom_id = ${purchaseUomId} (${row.purchase_uom})`);
  console.log(`purchase_uom in product_uoms? ${purchaseInProductUoms}`);
  console.log(`purchase→base in item_uom_conversions? ${purchaseInConversions}`);

  const wouldFail = purchaseUomId && purchaseUomId !== baseUomId && !purchaseInProductUoms && !purchaseInConversions;
  console.log(`resolveCanonicalProductUom would FAIL? ${wouldFail}`);

  if (wouldFail) {
    console.log(`Expected error: No canonical conversion path from UoM ${purchaseUomId} to base ${baseUomId}`);
  }
}

async function main() {
  const pool = new pg.Pool({ connectionString: loadDatabaseUrl() });
  const client = await pool.connect();
  try {
    console.log('DB:', loadDatabaseUrl().replace(/\/\/[^@]+@/, '//***@'));

    if (productArg) {
      await diagProduct(client, productArg);
      return;
    }

    let productIds;
    if (skuArg) {
      const r = await client.query(`SELECT id FROM products WHERE sku = $1`, [skuArg]);
      productIds = r.rows.map((x) => x.id);
    } else {
      const r = await client.query(`
        SELECT p.id FROM products p
        WHERE p.is_active = true
          AND p.base_uom_id IS NOT NULL
          AND p.purchase_uom_id IS NOT NULL
          AND p.purchase_uom_id <> p.base_uom_id
          AND NOT EXISTS (
            SELECT 1 FROM product_uoms pum
            WHERE pum.product_id = p.id AND pum.uom_id = p.purchase_uom_id
          )
        ORDER BY p.name
      `);
      productIds = r.rows.map((x) => x.id);
      console.log(`\nFound ${productIds.length} product(s) matching purchase_uom gap pattern\n`);
    }

    for (const id of productIds) {
      await diagProduct(client, id);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
