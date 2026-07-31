/**
 * Gate D — Concurrency proof.
 * Structural (always). Live race tests: LOT_PROOF_CONCURRENCY=1 + DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { lotService } from './lotService.js';
import { postgresLotRepository } from './postgresLotRepository.js';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RUN_LIVE = process.env.LOT_PROOF_CONCURRENCY === '1' && !!process.env.DATABASE_URL;

function src(rel: string): string {
  return readFileSync(resolve(serverRoot, rel), 'utf8');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Inventory lot concurrency proof (structural)', () => {
  it('FEFO selectors acquire row locks when forUpdate=true', () => {
    const selector = src('src/modules/inventory-lot/postgresLotSelector.ts');
    expect(selector).toContain("forUpdate ? ' FOR UPDATE'");
    expect(selector).toContain('FOR UPDATE OF ib_bal');
  });

  it('salesService allocates movement numbers via SEQUENCE (not advisory lock across FEFO)', () => {
    const sales = src('src/modules/sales/salesService.ts');
    expect(sales).toContain('allocateNextMovementNumber');
    expect(sales).not.toContain("pg_advisory_xact_lock(hashtext('movement_number_seq'))");
    expect(sales).toContain('lotService.consumeLot');
  });

  it('consumeLot fails closed on shortfall before any decrement', () => {
    const svc = src('src/modules/inventory-lot/lotService.ts');
    expect(svc).toContain('selection.shortfall > 0.001');
    expect(svc).toContain('selection.totalAllocated + 0.001 < input.quantity');
  });

  it('documented concurrency scenarios exist in proof charter', () => {
    const proof = readFileSync(
      resolve(serverRoot, '..', 'PROOF_INVENTORY_LOT_FOUNDATION.md'),
      'utf8',
    );
    expect(proof).toContain('Two cashiers, last batch');
    expect(proof).toContain('Transfer + sale');
    expect(proof).toContain('Receipt + expiry correction');
  });
});

describe('Inventory lot concurrency proof (live DB)', () => {
  let pool: pg.Pool;
  let productId: string;
  let userId: string;

  beforeAll(async () => {
    if (!RUN_LIVE) return;
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      const prod = await client.query<{ id: string }>(
        `SELECT id FROM products WHERE is_active = true ORDER BY track_expiry ASC LIMIT 1`,
      );
      productId = prod.rows[0]?.id ?? '';
      expect(productId).toBeTruthy();

      const userRes = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE is_active = true LIMIT 1`,
      );
      userId = userRes.rows[0]?.id ?? '';
      expect(userId).toBeTruthy();
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it(RUN_LIVE ? 'two concurrent consumeLot on last unit — exactly one succeeds' : 'live race skipped', async () => {
    if (!RUN_LIVE) {
      expect(process.env.LOT_PROOF_CONCURRENCY).not.toBe('1');
      return;
    }

    const setup = await pool.connect();
    let batchId = '';
    try {
      await setup.query('BEGIN');
      const lot = await postgresLotRepository.upsertMaster(setup, {
        productId,
        lotNumber: `CONC-RACE-${Date.now()}`,
        attributes: { expiryDate: null, receivedDate: '2026-07-07' },
        quantity: 1,
        remainingQuantity: 1,
        costPrice: 100,
        status: 'ACTIVE',
        sourceType: 'OPENING_BALANCE',
      });
      batchId = lot.id;
      await setup.query('COMMIT');
    } catch (e) {
      await setup.query('ROLLBACK');
      throw e;
    } finally {
      setup.release();
    }

    const tryRaceConsume = async (): Promise<'ok' | 'fail'> => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await lotService.consumeLot(client, {
          productId,
          quantity: 1,
          specificLotId: batchId,
          selectionPolicy: 'MANUAL',
          referenceType: 'LOT_CONC_PROOF',
          referenceId: batchId,
          userId,
          recordMovement: false,
          syncProduct: false,
        });
        await client.query('COMMIT');
        return 'ok';
      } catch {
        await client.query('ROLLBACK');
        return 'fail';
      } finally {
        client.release();
      }
    };

    const [a, b] = await Promise.all([tryRaceConsume(), tryRaceConsume()]);
    const successes = [a, b].filter((r) => r === 'ok').length;
    expect(successes).toBe(1);

    const rem = await pool.query<{ remaining_quantity: string }>(
      `SELECT remaining_quantity FROM inventory_batches WHERE id = $1`,
      [batchId],
    );
    expect(Number(rem.rows[0]?.remaining_quantity ?? 0)).toBeLessThanOrEqual(0.001);

    await pool.query('DELETE FROM inventory_batches WHERE id = $1', [batchId]);
  });

  it(RUN_LIVE ? 'concurrent expiry correction — no lost update on master' : 'expiry race skipped', async () => {
    if (!RUN_LIVE) return;

    const client = await pool.connect();
    const lotNumber = `CONC-EXP-${Date.now()}`;
    let batchId = '';
    try {
      await client.query('BEGIN');
      const lot = await postgresLotRepository.upsertMaster(client, {
        productId,
        lotNumber,
        attributes: { expiryDate: '2028-06-01', receivedDate: '2026-07-07' },
        quantity: 5,
        remainingQuantity: 5,
        costPrice: 50,
        status: 'ACTIVE',
        sourceType: 'OPENING_BALANCE',
      });
      batchId = lot.id;
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const correct = async (newExpiry: string) => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await lotService.correctLotAttributes(c, {
          lotId: batchId,
          newExpiryDate: newExpiry,
          reason: `concurrency proof ${newExpiry}`,
          userId,
          userName: 'Concurrency Proof',
        });
        await c.query('COMMIT');
        return 'ok';
      } catch {
        await c.query('ROLLBACK');
        return 'fail';
      } finally {
        c.release();
      }
    };

    const results = await Promise.all([correct('2028-07-01'), correct('2028-08-01')]);
    const okCount = results.filter((r) => r === 'ok').length;
    expect(okCount).toBeGreaterThanOrEqual(1);

    const after = await pool.query<{ expiry_date: string }>(
      `SELECT expiry_date::text FROM inventory_batches WHERE id = $1`,
      [batchId],
    );
    const expiry = after.rows[0]?.expiry_date?.slice(0, 10);
    expect(['2028-07-01', '2028-08-01']).toContain(expiry);

    await pool.query('DELETE FROM batch_expiry_audit WHERE batch_id = $1', [batchId]);
    await pool.query('DELETE FROM inventory_batches WHERE id = $1', [batchId]);
  });

  it(RUN_LIVE ? 'transfer-style row lock + sale — no double-spend' : 'transfer race skipped', async () => {
    if (!RUN_LIVE) return;

    const setup = await pool.connect();
    let batchId = '';
    try {
      await setup.query('BEGIN');
      const lot = await postgresLotRepository.upsertMaster(setup, {
        productId,
        lotNumber: `CONC-XFER-${Date.now()}`,
        attributes: { expiryDate: null, receivedDate: '2026-07-07' },
        quantity: 1,
        remainingQuantity: 1,
        costPrice: 100,
        status: 'ACTIVE',
        sourceType: 'OPENING_BALANCE',
      });
      batchId = lot.id;
      await setup.query('COMMIT');
    } catch (e) {
      await setup.query('ROLLBACK');
      throw e;
    } finally {
      setup.release();
    }

    const transferClient = await pool.connect();
    const saleClient = await pool.connect();
    try {
      await transferClient.query('BEGIN');
      await transferClient.query(
        `SELECT id FROM inventory_batches WHERE id = $1 FOR UPDATE`,
        [batchId],
      );

      let saleResolved = false;
      const salePromise = (async () => {
        try {
          await saleClient.query('BEGIN');
          await lotService.consumeLot(saleClient, {
            productId,
            quantity: 1,
            specificLotId: batchId,
            selectionPolicy: 'MANUAL',
            referenceType: 'LOT_CONC_TRANSFER',
            referenceId: batchId,
            userId,
            recordMovement: false,
            syncProduct: false,
          });
          await saleClient.query('COMMIT');
          saleResolved = true;
          return 'ok';
        } catch {
          await saleClient.query('ROLLBACK');
          saleResolved = true;
          return 'fail';
        }
      })();

      await sleep(200);
      expect(saleResolved).toBe(false);

      await postgresLotRepository.decrementMasterRemainingQuantity(transferClient, batchId, 1);
      await transferClient.query('COMMIT');

      const saleResult = await salePromise;
      expect(saleResult).toBe('fail');

      const rem = await pool.query<{ remaining_quantity: string; status: string }>(
        `SELECT remaining_quantity, status FROM inventory_batches WHERE id = $1`,
        [batchId],
      );
      expect(Number(rem.rows[0]?.remaining_quantity ?? 0)).toBeLessThanOrEqual(0.001);
      expect(rem.rows[0]?.status).toBe('DEPLETED');
    } finally {
      try { await transferClient.query('ROLLBACK'); } catch { /* noop */ }
      try { await saleClient.query('ROLLBACK'); } catch { /* noop */ }
      transferClient.release();
      saleClient.release();
      await pool.query('DELETE FROM inventory_batches WHERE id = $1', [batchId]);
    }
  });

  it(RUN_LIVE ? 'pg_locks exposes waiting batch lock during contention' : 'deadlock monitor skipped', async () => {
    if (!RUN_LIVE) return;

    const setup = await pool.connect();
    let batchId = '';
    try {
      await setup.query('BEGIN');
      const lot = await postgresLotRepository.upsertMaster(setup, {
        productId,
        lotNumber: `CONC-LOCK-${Date.now()}`,
        attributes: { expiryDate: null, receivedDate: '2026-07-07' },
        quantity: 2,
        remainingQuantity: 2,
        costPrice: 100,
        status: 'ACTIVE',
        sourceType: 'OPENING_BALANCE',
      });
      batchId = lot.id;
      await setup.query('COMMIT');
    } catch (e) {
      await setup.query('ROLLBACK');
      throw e;
    } finally {
      setup.release();
    }

    const holder = await pool.connect();
    const waiter = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`SELECT id FROM inventory_batches WHERE id = $1 FOR UPDATE`, [batchId]);

      await waiter.query('BEGIN');
      const waitingUpdate = waiter.query(
        `UPDATE inventory_batches SET updated_at = NOW() WHERE id = $1`,
        [batchId],
      );

      await sleep(200);

      const locks = await pool.query<{ wait_event_type: string | null; query: string }>(
        `SELECT wait_event_type, query
         FROM pg_stat_activity
         WHERE datname = current_database()
           AND pid = $1`,
        [waiter.processID],
      );
      expect(locks.rows.some((row) => row.wait_event_type === 'Lock')).toBe(true);
      expect(locks.rows.some((row) => row.query.includes('UPDATE inventory_batches'))).toBe(true);

      await holder.query('ROLLBACK');
      await waitingUpdate;
      await waiter.query('ROLLBACK');
    } finally {
      try { await holder.query('ROLLBACK'); } catch { /* noop */ }
      try { await waiter.query('ROLLBACK'); } catch { /* noop */ }
      holder.release();
      waiter.release();
      await pool.query('DELETE FROM inventory_batches WHERE id = $1', [batchId]);
    }
  });
});
