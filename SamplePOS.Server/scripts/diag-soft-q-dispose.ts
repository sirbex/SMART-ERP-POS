#!/usr/bin/env npx tsx
/** Reproduce dispose on user's EXPIRED workqueue line. */
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = fs.readFileSync(path.join(serverRoot, '.env'), 'utf8');
process.env.DATABASE_URL = env.match(/^DATABASE_URL=(.+)$/m)![1].replace(/^["']|["']$/g, '').trim();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!.split('?')[0],
});

const batchId = 'c909700e-acd9-49e3-9675-66e12ca6d49f';
const productId = 'd16639cf-2195-4cbd-bee6-a952e9d3aeef';
const productLotId = '6a224cf1-4e31-4f04-b565-8c4d4c4a9540';

const userRes = await pool.query<{ id: string }>(
  `SELECT id::text AS id FROM users WHERE id::text <> '00000000-0000-0000-0000-000000000000' LIMIT 1`,
);
const userId = userRes.rows[0]!.id;

const { disposeFromQuarantine } = await import(
  '../src/modules/loss-quarantine/lossDisposalService.js'
);
const { loadGlobalSelectableLots } = await import(
  '../src/modules/inventory-lot/postgresLotSelector.js'
);

const client = await pool.connect();
try {
  const lots = await loadGlobalSelectableLots(client, productId, {
    specificLotId: batchId,
    allowDisposalStatuses: true,
    forUpdate: false,
  });
  console.log('loadGlobalSelectableLots:', lots);

  const result = await disposeFromQuarantine(pool, {
    productId,
    productLotId,
    inventoryBatchId: batchId,
    quantity: 286,
    reason: 'EXPIRY',
    userId,
    quarantineMode: 'SOFT',
  });
  console.log('DISPOSE OK', result.documentNumber, result.expenseAccountCode);
} catch (e) {
  console.error('DISPOSE FAIL', e instanceof Error ? e.message : e);
} finally {
  client.release();
  await pool.end();
}
