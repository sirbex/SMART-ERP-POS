#!/usr/bin/env node
/**
 * Heal MUoM for Pregnacare plus / SKU-5200: base stock unit + PKT (1 PKT = 30 base).
 *
 * Fixes:
 *   - product_uoms: base (is_default, factor=1) + PKT (factor=30)
 *   - products.base_uom_id, products.purchase_uom_id
 *   - item_uom_conversions canonical edge PKT → base
 *
 * Optional inventory rescale (when on-hand was stored as packet count, not base):
 *   node scripts/heal-sku-5200-pregnacare-uom.mjs --apply --scale-inventory
 *
 * Dry run (default):
 *   node scripts/heal-sku-5200-pregnacare-uom.mjs
 *   TENANT=henber node scripts/heal-sku-5200-pregnacare-uom.mjs
 *
 * Production:
 *   docker exec -w /app -e TENANT=henber smarterp-backend node heal-sku-5200-pregnacare-uom.mjs --apply
 */
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../SamplePOS.Server/.env') });

const SKU = process.env.HEAL_SKU || 'SKU-5200';
const PKT_FACTOR = Number(process.env.PKT_FACTOR || 30);
const APPLY = process.argv.includes('--apply');
const SCALE_INVENTORY = process.argv.includes('--scale-inventory');

const TENANT_DB = {
  henber: 'pos_tenant_henber_pharmacy',
  dynamics: 'pos_tenant_dynamics',
};

function resolveDatabaseUrl() {
  if (process.env.HENBER_DATABASE_URL && (process.env.TENANT || 'henber') === 'henber') {
    return process.env.HENBER_DATABASE_URL;
  }
  const tenantKey = (process.env.TENANT || process.env.TENANT_DB || 'henber').toLowerCase();
  const tenantDb = TENANT_DB[tenantKey] || tenantKey;
  const base = process.env.DATABASE_URL;
  if (base) {
    return base.replace(/\/([^/?]+)(\?.*)?$/, `/${tenantDb}$2`);
  }
  return `postgresql://postgres:password@localhost:5432/${tenantDb}`;
}

async function findMasterUom(client, patterns) {
  for (const pat of patterns) {
    const res = await client.query(
      `SELECT id, name, symbol FROM uoms
       WHERE UPPER(name) = $1 OR UPPER(COALESCE(symbol, '')) = $1
       LIMIT 1`,
      [pat.toUpperCase()],
    );
    if (res.rows[0]) return res.rows[0];
  }
  const ilike = await client.query(
    `SELECT id, name, symbol FROM uoms
     WHERE name ILIKE ANY($1::text[]) OR symbol ILIKE ANY($1::text[])
     ORDER BY name LIMIT 1`,
    [patterns.map((p) => `%${p}%`)],
  );
  return ilike.rows[0] || null;
}

async function main() {
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl() });
  const client = await pool.connect();
  const mode = APPLY ? 'APPLY' : 'DRY-RUN';

  try {
    console.log(`\n=== heal-sku-5200-pregnacare-uom [${mode}] ===`);
    console.log('DB:', resolveDatabaseUrl().replace(/\/\/[^@]+@/, '//***@'));
    console.log('SKU:', SKU, '| PKT factor:', PKT_FACTOR);
    console.log('Scale inventory:', SCALE_INVENTORY ? 'YES' : 'NO (pass --scale-inventory with --apply)');

    const prodRes = await client.query(
      `SELECT p.id, p.sku, p.name, p.base_uom_id, p.purchase_uom_id,
              pi.quantity_on_hand::text AS qoh,
              pv.cost_price::text AS cost_price,
              pv.selling_price::text AS sell_price
       FROM products p
       LEFT JOIN product_inventory pi ON pi.product_id = p.id
       LEFT JOIN product_valuation pv ON pv.product_id = p.id
       WHERE p.sku ILIKE $1
       LIMIT 1`,
      [`%${SKU.replace(/^SKU-?/i, '')}%`],
    );
    const product = prodRes.rows[0];
    if (!product) {
      throw new Error(`Product not found for SKU pattern ${SKU}`);
    }
    console.log('\nProduct:', product.sku, '-', product.name);
    console.log('Current QOH (base):', product.qoh);
    console.log('Cost/sell (per base):', product.cost_price, '/', product.sell_price);

    const uomRes = await client.query(
      `SELECT pu.id, pu.uom_id, u.name, u.symbol, pu.conversion_factor, pu.is_default
       FROM product_uoms pu
       JOIN uoms u ON u.id = pu.uom_id
       WHERE pu.product_id = $1
       ORDER BY pu.is_default DESC, pu.conversion_factor`,
      [product.id],
    );
    console.log('\nCurrent product_uoms:');
    for (const row of uomRes.rows) {
      console.log(
        `  - ${row.symbol || row.name} factor=${row.conversion_factor} default=${row.is_default}`,
      );
    }

    const baseUom =
      (await findMasterUom(client, ['TABLET', 'TAB', 'CAPSULE', 'CAP', 'PC', 'PIECE', 'EACH'])) ||
      (await findMasterUom(client, ['UNIT']));
    const pktUom = await findMasterUom(client, ['PKT', 'PACKET', 'PACK']);

    if (!baseUom) throw new Error('No base master UoM found (TABLET/CAP/PC/EACH). Create one first.');
    if (!pktUom) throw new Error('No PKT master UoM found. Create PACKET/PKT in UoM management first.');

    console.log('\nTarget master UoMs:');
    console.log('  Base:', baseUom.symbol || baseUom.name, baseUom.id);
    console.log('  PKT:', pktUom.symbol || pktUom.name, pktUom.id);

    const currentQoh = parseFloat(product.qoh || '0');
    const scaledQoh = SCALE_INVENTORY ? currentQoh * PKT_FACTOR : currentQoh;
    const pktStockAfter = Math.floor(scaledQoh / PKT_FACTOR);

    console.log('\nAfter heal (projected):');
    console.log('  Base stock:', scaledQoh);
    console.log('  POS PKT stock:', pktStockAfter);
    console.log(
      '  Display sell PKT:',
      product.sell_price
        ? (parseFloat(product.sell_price) * PKT_FACTOR).toFixed(2)
        : '(set selling_price on product)',
    );

    if (!APPLY) {
      console.log('\nDRY-RUN complete. Re-run with --apply to commit.');
      if (SCALE_INVENTORY) {
        console.log('Include --scale-inventory with --apply to multiply QOH ×', PKT_FACTOR);
      }
      return;
    }

    await client.query('BEGIN');

    // Clear conflicting rows; rebuild canonical pair
    await client.query(`DELETE FROM product_uoms WHERE product_id = $1`, [product.id]);
    await client.query(`DELETE FROM item_uom_conversions WHERE item_id = $1`, [product.id]);

    await client.query(
      `INSERT INTO product_uoms (product_id, uom_id, conversion_factor, is_default)
       VALUES ($1, $2, 1, true)`,
      [product.id, baseUom.id],
    );
    await client.query(
      `INSERT INTO product_uoms (product_id, uom_id, conversion_factor, is_default)
       VALUES ($1, $2, $3, false)`,
      [product.id, pktUom.id, PKT_FACTOR],
    );

    await client.query(
      `UPDATE products
       SET base_uom_id = $2, purchase_uom_id = $3, updated_at = NOW()
       WHERE id = $1`,
      [product.id, baseUom.id, pktUom.id],
    );

    await client.query(
      `INSERT INTO item_uom_conversions (item_id, from_uom_id, to_uom_id, factor, is_canonical)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (item_id, from_uom_id, to_uom_id)
       DO UPDATE SET factor = EXCLUDED.factor, is_canonical = true, updated_at = NOW()`,
      [product.id, pktUom.id, baseUom.id, PKT_FACTOR],
    );

    if (SCALE_INVENTORY && currentQoh > 0) {
      const newQoh = scaledQoh;
      await client.query(
        `UPDATE product_inventory SET quantity_on_hand = $2, updated_at = NOW()
         WHERE product_id = $1`,
        [product.id, newQoh],
      );
      // Scale active batches proportionally (single-batch common case)
      const batchRes = await client.query(
        `SELECT id, remaining_quantity::text AS rq FROM inventory_batches
         WHERE product_id = $1 AND status = 'ACTIVE'`,
        [product.id],
      );
      if (batchRes.rows.length === 1) {
        const oldB = parseFloat(batchRes.rows[0].rq);
        await client.query(
          `UPDATE inventory_batches SET remaining_quantity = $2, quantity = $2, updated_at = NOW()
           WHERE id = $1`,
          [batchRes.rows[0].id, oldB * PKT_FACTOR],
        );
      } else if (batchRes.rows.length > 1) {
        console.warn(
          'WARN: Multiple active batches — inventory header updated only. Reconcile batches manually.',
        );
      }
      console.log(`Inventory scaled: ${currentQoh} → ${newQoh} base units`);
    }

    await client.query('COMMIT');
    console.log('\n✓ Heal committed. Refresh POS catalog (reload POS or wait for sync).');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Heal failed:', err.message || err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
