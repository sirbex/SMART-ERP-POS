#!/usr/bin/env npx tsx
/**
 * Dry-run every soft-quarantine aging line through the same lot-selector +
 * selectLots path dispose uses — report any line that would still fail.
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = fs.readFileSync(path.join(serverRoot, '.env'), 'utf8');
process.env.DATABASE_URL = env
  .match(/^DATABASE_URL=(.+)$/m)![1]
  .replace(/^["']|["']$/g, '')
  .trim();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!.split('?')[0],
});

const { getQuarantineAging } = await import(
  '../src/modules/loss-quarantine/quarantineAgingService.js'
);
const { loadGlobalSelectableLots } = await import(
  '../src/modules/inventory-lot/postgresLotSelector.js'
);
const { selectLots } = await import('@shared/inventory-lot/index.js');
const { getBusinessDate } = await import('../src/utils/dateRange.js');

const aging = await getQuarantineAging(pool, { minAgeDays: 0, limit: 500 });
console.log(
  JSON.stringify(
    {
      quarantineMode: aging.quarantineMode,
      totalLines: aging.summary.totalLines,
      totalQty: aging.summary.totalQuantity,
    },
    null,
    2,
  ),
);

const client = await pool.connect();
const failures: Array<Record<string, unknown>> = [];
const ok: Array<Record<string, unknown>> = [];

try {
  const businessDate = getBusinessDate();
  for (const line of aging.lines) {
    const batchId = line.inventoryBatchId;
    if (!batchId) {
      failures.push({
        product: line.productName,
        lot: line.lotNumber,
        reason: 'missing inventoryBatchId',
      });
      continue;
    }

    const lots = await loadGlobalSelectableLots(client, line.productId, {
      specificLotId: batchId,
      allowDisposalStatuses: true,
      forUpdate: false,
    });

    const selection = selectLots({
      policy: 'MANUAL',
      lots,
      quantity: line.quantity,
      businessDate,
      specificLotId: batchId,
    });

    const bal = await client.query<{ bal: string; pl_match: boolean }>(
      `SELECT
         COALESCE(SUM(GREATEST(b.quantity_on_hand - b.quantity_reserved - b.quantity_committed, 0)), 0)::text AS bal,
         EXISTS (
           SELECT 1 FROM product_lots pl
           WHERE pl.id = $2::uuid AND pl.inventory_batch_id = $1::uuid
         ) AS pl_match
       FROM product_lots pl
       LEFT JOIN inventory_balances b ON b.product_lot_id = pl.id
       WHERE pl.inventory_batch_id = $1`,
      [batchId, line.productLotId],
    );

    const row = {
      product: line.productName,
      lot: line.lotNumber,
      status: line.lotStatus,
      qty: line.quantity,
      batchId,
      productLotId: line.productLotId,
      selectable: lots.length,
      shortfall: selection.shortfall,
      balQty: Number(bal.rows[0]?.bal ?? 0),
      productLotMatchesBatch: bal.rows[0]?.pl_match ?? false,
    };

    if (selection.shortfall > 0.001 || lots.length === 0) {
      failures.push({ ...row, reason: 'selector/selectLots shortfall' });
    } else if (line.productLotId && bal.rows[0]?.pl_match === false) {
      failures.push({ ...row, reason: 'productLotId does not belong to inventoryBatchId' });
    } else {
      ok.push(row);
    }
  }
} finally {
  client.release();
  await pool.end();
}

console.log(
  JSON.stringify(
    {
      okCount: ok.length,
      failCount: failures.length,
      failures,
      sampleOk: ok.slice(0, 5),
    },
    null,
    2,
  ),
);

process.exit(failures.length > 0 ? 1 : 0);
