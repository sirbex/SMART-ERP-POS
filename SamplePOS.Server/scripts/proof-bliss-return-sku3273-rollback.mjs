#!/usr/bin/env node
/**
 * Rollback-safe proof: Bliss SKU-3273 customer return must not fail INV-POS projection.
 * Simulates multistore returnLot + syncProductQuantity inside a transaction, then ROLLBACK.
 */
import pg from 'pg';
import { register } from 'tsx/esm/api';

register();

const { warehouseReturnInventoryService } = await import(
  '../src/modules/inventory/warehouse/warehouseReturnInventoryService.ts'
);
const { findPosSellableCoverageGaps } = await import(
  '../src/modules/inventory/warehouse/posSellableCoverage.ts'
);

const db = 'pos_tenant_bliss_interior_ltd';
const productId = '67d3f2da-62e5-4416-b352-ccca5a32ceee';
const batchId = '07170a56-16d1-449b-8501-019c77491422';

const pool = new pg.Pool({
  connectionString: `postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@209.38.203.138:5432/${db}`,
  connectionTimeoutMillis: 30000,
});

const client = await pool.connect();
const out = { db, productId, sku: 'SKU-3273', steps: [] };

try {
  await client.query('BEGIN');

  const before = await client.query(
    `SELECT p.sku, p.quantity_on_hand::float8 AS qoh,
            b.status AS batch_status, b.remaining_quantity::float8 AS batch_qty
     FROM products p
     LEFT JOIN inventory_batches b ON b.id = $2
     WHERE p.id = $1`,
    [productId, batchId],
  );
  out.steps.push({ step: 'before', row: before.rows[0] });

  await warehouseReturnInventoryService.restoreCustomerReturn(client, {
    productId,
    quantity: 1,
    unitCost: 0,
    batchId,
    referenceType: 'CREDIT_NOTE',
    referenceId: '00000000-0000-0000-0000-000000000099',
    notes: 'ROLLBACK proof SKU-3273',
  });
  out.steps.push({ step: 'restoreCustomerReturn', ok: true });

  const after = await client.query(
    `SELECT p.quantity_on_hand::float8 AS qoh,
            b.status AS batch_status, b.remaining_quantity::float8 AS batch_qty
     FROM products p
     JOIN inventory_batches b ON b.id = $2
     WHERE p.id = $1`,
    [productId, batchId],
  );
  out.steps.push({ step: 'after_sync', row: after.rows[0] });

  const returnBal = await client.query(
    `SELECT sl.code, ib.quantity_on_hand::float8 AS qty
     FROM inventory_balances ib
     JOIN store_locations sl ON sl.id = ib.store_location_id
     WHERE ib.product_id = $1 AND sl.store_type = 'RETURN'`,
    [productId],
  );
  out.steps.push({ step: 'return_store_balance', rows: returnBal.rows });

  const gaps = await findPosSellableCoverageGaps(client, productId);
  out.steps.push({ step: 'pos_gaps', gaps });

  out.verdict =
    after.rows[0]?.qoh === 1 &&
    after.rows[0]?.batch_qty === 1 &&
    returnBal.rows.some((r) => r.qty >= 1) &&
    gaps.every((g) => g.reason !== 'SELLING_ZERO_NO_BALANCES' && g.reason !== 'NO_LOT')
      ? 'PASS'
      : 'FAIL';

  await client.query('ROLLBACK');
  out.rolledBack = true;
} catch (err) {
  await client.query('ROLLBACK');
  out.verdict = 'FAIL';
  out.error = err instanceof Error ? err.message : String(err);
  out.rolledBack = true;
} finally {
  client.release();
  await pool.end();
}

console.log(JSON.stringify(out, null, 2));
process.exit(out.verdict === 'PASS' ? 0 : 1);
