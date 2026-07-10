import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lotService } from '../src/modules/inventory-lot/lotService.js';
import { postgresLotRepository } from '../src/modules/inventory-lot/postgresLotRepository.js';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(resolve(serverRoot, '.env.test'), 'utf8').match(/DATABASE_URL=(.+)/m)![1].replace(/^"|"$/g, '');
const pool = new pg.Pool({ connectionString: env });

const client = await pool.connect();
let batchId: string;
let productId: string;
try {
  await client.query('BEGIN');
  productId = (await client.query<{ id: string }>('SELECT id FROM products WHERE is_active LIMIT 1')).rows[0].id;
  const lot = await postgresLotRepository.upsertMaster(client, {
    productId,
    lotNumber: `TSX-RACE-${Date.now()}`,
    attributes: { expiryDate: null, receivedDate: '2026-07-07' },
    quantity: 1,
    remainingQuantity: 1,
    costPrice: 1,
    status: 'ACTIVE',
    sourceType: 'OPENING_BALANCE',
  });
  batchId = lot.id;
  await client.query('COMMIT');
} finally {
  client.release();
}

async function tryC(): Promise<string> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await lotService.consumeLot(c, {
      productId,
      quantity: 1,
      specificLotId: batchId,
      selectionPolicy: 'MANUAL',
      recordMovement: false,
      syncProduct: false,
      referenceType: 'X',
      referenceId: batchId,
      userId: '00000000-0000-0000-0000-000000000001',
    });
    await c.query('COMMIT');
    return 'ok';
  } catch (e) {
    await c.query('ROLLBACK');
    return `fail: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    c.release();
  }
}

const [a, b] = await Promise.all([tryC(), tryC()]);
const rem = (
  await pool.query<{ remaining_quantity: string; status: string }>(
    'SELECT remaining_quantity, status FROM inventory_batches WHERE id = $1',
    [batchId],
  )
).rows[0];
console.log(JSON.stringify({ a, b, rem }, null, 2));
await pool.query('DELETE FROM inventory_batches WHERE id = $1', [batchId]);
await pool.end();
