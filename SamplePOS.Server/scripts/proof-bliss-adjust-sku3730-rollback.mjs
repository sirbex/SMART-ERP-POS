#!/usr/bin/env node
/**
 * Rollback-safe proof: Bliss SKU-3730 adjust-batch IN must not create duplicate
 * product_lots or fail ERR_WAREHOUSE_LAYER_COUPLING.
 */
import pg from 'pg';
import { register } from 'tsx/esm/api';

register();

const { warehouseAdjustmentService } = await import(
  '../src/modules/inventory/warehouse/warehouseAdjustmentService.ts'
);

const db = 'pos_tenant_bliss_interior_ltd';
const productId = 'de04d835-0892-4477-a29a-e66aec097bb0';
const batchId = '399acb3a-1afa-465f-8aab-42abd34ac04b';

const pool = new pg.Pool({
  connectionString: `postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@209.38.203.138:5432/${db}`,
  connectionTimeoutMillis: 30000,
});

const client = await pool.connect();
const out = { db, productId, sku: 'SKU-3730', steps: [], verdict: 'FAIL' };

try {
  await client.query('BEGIN');

  const before = await client.query(
    `SELECT
       (SELECT remaining_quantity::float8 FROM inventory_batches WHERE id=$2) AS batch_qty,
       (SELECT COUNT(*)::int FROM product_lots WHERE inventory_batch_id=$2) AS lot_count,
       (SELECT COALESCE(SUM(quantity_on_hand),0)::float8 FROM inventory_balances WHERE product_id=$1) AS bal_total`,
    [productId, batchId],
  );
  out.steps.push({ step: 'before', row: before.rows[0] });

  const selling = await client.query(
    `SELECT id FROM store_locations WHERE store_type='SELLING' AND is_active=true ORDER BY is_pos_selling DESC LIMIT 1`,
  );
  const sellingId = selling.rows[0]?.id;
  if (!sellingId) throw new Error('No SELLING store');

  await warehouseAdjustmentService.adjustAtStore(client, {
    storeLocationId: sellingId,
    productId,
    batchId,
    quantity: 8,
    direction: 'IN',
    reason: 'ADJUSTMENT',
    notes: 'ROLLBACK proof SKU-3730 +8',
    userId: '00000000-0000-0000-0000-000000000000',
    unitCost: 15000,
  });
  out.steps.push({ step: 'adjustAtStore', ok: true });

  const after = await client.query(
    `SELECT
       (SELECT remaining_quantity::float8 FROM inventory_batches WHERE id=$1) AS batch_qty,
       (SELECT COUNT(*)::int FROM product_lots WHERE inventory_batch_id=$1) AS lot_count,
       (SELECT array_agg(lot_number ORDER BY created_at) FROM product_lots WHERE inventory_batch_id=$1) AS lot_names,
       (SELECT COALESCE(SUM(quantity_on_hand),0)::float8 FROM inventory_balances ib
          JOIN product_lots pl ON pl.id = ib.product_lot_id
          WHERE pl.inventory_batch_id=$1) AS bal_total`,
    [batchId],
  );
  out.steps.push({ step: 'after', row: after.rows[0] });

  const a = after.rows[0];
  const b = before.rows[0];
  out.verdict =
    a.lot_count === 1 &&
    a.batch_qty === b.batch_qty + 8 &&
    a.bal_total === b.bal_total + 8
      ? 'PASS'
      : 'FAIL';

  await client.query('ROLLBACK');
  out.rolledBack = true;
} catch (err) {
  await client.query('ROLLBACK');
  out.error = err instanceof Error ? err.message : String(err);
  out.rolledBack = true;
} finally {
  client.release();
  await pool.end();
}

console.log(JSON.stringify(out, null, 2));
process.exit(out.verdict === 'PASS' ? 0 : 1);
