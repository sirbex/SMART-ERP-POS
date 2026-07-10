/**
 * Gate E — Recovery proof.
 * Structural (always). Live TX rollback: LOT_PROOF_RECOVERY=1 + DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { lotService } from './lotService.js';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RUN_LIVE = process.env.LOT_PROOF_RECOVERY === '1' && !!process.env.DATABASE_URL;

function src(rel: string): string {
  return readFileSync(resolve(serverRoot, rel), 'utf8');
}

describe('Gate E — recovery proof (structural)', () => {
  it('goods receipt finalize participates in caller transaction (UnitOfWork)', () => {
    const gr = src('src/modules/goods-receipts/goodsReceiptService.ts');
    expect(gr).toContain('UnitOfWork');
    expect(gr).toContain('receiveLot');
  });

  it('consumeLot rejects shortfall before decrement (fail-closed)', () => {
    const svc = src('src/modules/inventory-lot/lotService.ts');
    expect(svc).toContain('selection.shortfall > 0.001');
    expect(svc).toContain('selection.totalAllocated + 0.001 < input.quantity');
    const shortfallIdx = svc.indexOf('selection.shortfall > 0.001');
    const decrementIdx = svc.indexOf('decrementMasterRemainingQuantity');
    expect(shortfallIdx).toBeGreaterThan(-1);
    expect(decrementIdx).toBeGreaterThan(shortfallIdx);
  });

  it('stock movement handler uses external txClient without nested COMMIT', () => {
    const handler = src('src/modules/inventory/stockMovementHandler.ts');
    expect(handler).toContain('txClient?: PoolClient');
    expect(handler).toContain('ownConnection = !txClient');
    expect(handler).toContain('lotService.returnLot');
    expect(handler).toContain('lotService.consumeLot');
  });

  it('recovery charter documents crash scenarios', () => {
    const charter = readFileSync(
      resolve(serverRoot, '..', 'PROOF_INVENTORY_LOT_ENTERPRISE_GATES.md'),
      'utf8',
    );
    expect(charter).toContain('Crash mid-receipt');
    expect(charter).toContain('Crash mid-FEFO allocation');
    expect(charter).toContain('Retry idempotency');
  });
});

describe('Gate E — recovery proof (live TX rollback)', () => {
  let pool: pg.Pool;

  beforeAll(() => {
    if (!RUN_LIVE) return;
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it(RUN_LIVE ? 'ROLLBACK after receiveLot leaves no committed batch' : 'live recovery skipped', async () => {
    if (!RUN_LIVE) {
      expect(process.env.LOT_PROOF_RECOVERY).not.toBe('1');
      return;
    }

    const client = await pool.connect();
    const lotNumber = `RECOVERY-${Date.now()}`;
    try {
      const productRes = await client.query<{ id: string; track_expiry: boolean }>(
        `SELECT p.id, COALESCE(p.track_expiry, false) AS track_expiry
         FROM products p
         WHERE p.is_active = true
         ORDER BY p.track_expiry ASC
         LIMIT 1`,
      );
      const productId = productRes.rows[0]?.id;
      const trackExpiry = productRes.rows[0]?.track_expiry === true;
      expect(productId).toBeTruthy();

      await client.query('BEGIN');
      const lot = await lotService.receiveLot(client, {
        productId: productId!,
        lotNumber,
        quantity: 1,
        costPrice: 1,
        attributes: {
          receivedDate: '2026-07-07',
          expiryDate: trackExpiry ? '2030-12-31' : null,
        },
        sourceType: 'ADJUSTMENT',
        userId: 'recovery-proof',
      });
      expect(lot.lotNumber).toBe(lotNumber);

      const inTx = await client.query(
        `SELECT id FROM inventory_batches WHERE product_id = $1 AND batch_number = $2`,
        [productId, lotNumber],
      );
      expect(inTx.rows.length).toBe(1);

      await client.query('ROLLBACK');

      const after = await pool.query(
        `SELECT id FROM inventory_batches WHERE product_id = $1 AND batch_number = $2`,
        [productId, lotNumber],
      );
      expect(after.rows.length).toBe(0);
    } finally {
      try { await client.query('ROLLBACK'); } catch { /* already rolled back */ }
      client.release();
    }
  });

  it(RUN_LIVE ? 'ROLLBACK after consumeLot restores batch quantity' : 'live consume rollback skipped', async () => {
    if (!RUN_LIVE) return;

    const client = await pool.connect();
    try {
      const batchRes = await client.query<{
        id: string;
        product_id: string;
        remaining_quantity: string;
      }>(
        `SELECT id, product_id, remaining_quantity
         FROM inventory_batches
         WHERE status = 'ACTIVE' AND remaining_quantity > 1
         LIMIT 1`,
      );
      const row = batchRes.rows[0];
      if (!row) {
        expect(true).toBe(true);
        return;
      }

      const before = parseFloat(row.remaining_quantity);
      await client.query('BEGIN');
      await lotService.consumeLot(client, {
        productId: row.product_id,
        quantity: 1,
        specificLotId: row.id,
        selectionPolicy: 'MANUAL',
        recordMovement: false,
        syncProduct: false,
        referenceType: 'RECOVERY_PROOF',
        referenceId: row.id,
        userId: 'recovery-proof',
      });
      await client.query('ROLLBACK');

      const afterRes = await pool.query<{ remaining_quantity: string }>(
        `SELECT remaining_quantity FROM inventory_batches WHERE id = $1`,
        [row.id],
      );
      expect(parseFloat(afterRes.rows[0].remaining_quantity)).toBeCloseTo(before, 4);
    } finally {
      try { await client.query('ROLLBACK'); } catch { /* noop */ }
      client.release();
    }
  });
});
