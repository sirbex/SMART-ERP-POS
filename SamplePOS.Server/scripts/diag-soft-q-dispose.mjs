/**
 * Diagnose soft quarantine dispose for EXPIRED lines (repro user's workqueue bug).
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = readFileSync(resolve(serverRoot, '.env'), 'utf8')
  .match(/^DATABASE_URL=(.+)$/m)[1]
  .replace(/^["']|["']$/g, '')
  .trim()
  .split('?')[0];

process.env.DATABASE_URL = readFileSync(resolve(serverRoot, '.env'), 'utf8')
  .match(/^DATABASE_URL=(.+)$/m)[1]
  .replace(/^["']|["']$/g, '')
  .trim();

const pool = new pg.Pool({ connectionString: url });

const rows = await pool.query(`
  SELECT ib.id::text AS batch_id,
         ib.batch_number,
         ib.product_id::text,
         p.name AS product_name,
         ib.remaining_quantity::text AS qty,
         COALESCE(ib.status::text,'') AS status,
         ib.expiry_date::text AS expiry,
         pl.id::text AS product_lot_id,
         pl.inventory_batch_id::text AS pl_batch_id
  FROM inventory_batches ib
  JOIN products p ON p.id = ib.product_id
  LEFT JOIN product_lots pl ON pl.inventory_batch_id = ib.id
  WHERE COALESCE(ib.status::text,'') = 'EXPIRED'
    AND ib.remaining_quantity > 0
  ORDER BY ib.updated_at DESC
  LIMIT 5
`);

console.log('EXPIRED batches on hand:', rows.rows.length);
for (const r of rows.rows) {
  console.log(JSON.stringify(r));
}

if (rows.rows.length > 0) {
  const target = rows.rows.find((r) => r.batch_number?.includes('ADJ-')) ?? rows.rows[0];
  const userRes = await pool.query(
    `SELECT id::text FROM users WHERE id::text <> '00000000-0000-0000-0000-000000000000' LIMIT 1`,
  );
  const userId = userRes.rows[0]?.id;
  const { disposeFromQuarantine } = await import(
    '../src/modules/loss-quarantine/lossDisposalService.js'
  );
  const qty = Number(target.qty);
  console.log('\nAttempting dispose', target.batch_number, 'qty', qty);
  try {
    const result = await disposeFromQuarantine(pool, {
      productId: target.product_id,
      productLotId: target.product_lot_id,
      inventoryBatchId: target.batch_id,
      quantity: qty,
      reason: 'EXPIRY',
      userId,
      quarantineMode: 'SOFT',
    });
    console.log('DISPOSE OK', result.documentNumber, result.expenseAccountCode);
  } catch (e) {
    console.error('DISPOSE FAIL', e instanceof Error ? e.message : e);
  }
}

await pool.end();
