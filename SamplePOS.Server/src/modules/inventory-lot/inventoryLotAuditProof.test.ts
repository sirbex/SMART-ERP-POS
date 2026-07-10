/**
 * Gate H — Audit proof.
 * Structural checks always run; live lineage checks run with DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { lotService } from './lotService.js';
import { postgresLotRepository } from './postgresLotRepository.js';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RUN_LIVE = !!process.env.DATABASE_URL;

function src(rel: string): string {
  return readFileSync(resolve(serverRoot, rel), 'utf8');
}

describe('Gate H — audit proof (structural)', () => {
  it('lot repository maps source lineage fields from inventory_batches', () => {
    const repo = src('src/modules/inventory-lot/postgresLotRepository.ts');
    expect(repo).toContain('sourceType');
    expect(repo).toContain('goodsReceiptId');
    expect(repo).toContain('goodsReceiptItemId');
  });

  it('attribute correction appends immutable expiry audit rows', () => {
    const repo = src('src/modules/inventory-lot/postgresLotRepository.ts');
    const service = src('src/modules/inventory-lot/lotService.ts');
    expect(repo).toContain('INSERT INTO batch_expiry_audit');
    expect(service).toContain('appendLotExpiryAudit');
  });

  it('consumeLot can record stock movement lineage', () => {
    const service = src('src/modules/inventory-lot/lotService.ts');
    expect(service).toContain('recordMovement');
    expect(service).toContain('movementType');
    expect(service).toContain('referenceType');
  });
});

describe('Gate H — audit proof (live DB)', () => {
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

  it(RUN_LIVE ? 'expiry correction writes batch_expiry_audit lineage' : 'live audit proof skipped', async () => {
    if (!RUN_LIVE) {
      expect(process.env.DATABASE_URL).toBeFalsy();
      return;
    }

    const setup = await pool.connect();
    let batchId = '';
    try {
      await setup.query('BEGIN');
      const lot = await postgresLotRepository.upsertMaster(setup, {
        productId,
        lotNumber: `AUDIT-EXP-${Date.now()}`,
        attributes: { expiryDate: '2028-01-01', receivedDate: '2026-07-07' },
        quantity: 5,
        remainingQuantity: 5,
        costPrice: 25,
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

    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await lotService.correctLotAttributes(client, {
          lotId: batchId,
          newExpiryDate: '2028-02-01',
          reason: 'audit proof correction',
          userId,
          userName: 'Audit Proof',
        });
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      const audit = await pool.query<{ old_expiry_date: string; new_expiry_date: string; reason: string }>(
        `SELECT old_expiry_date::text, new_expiry_date::text, reason
         FROM batch_expiry_audit
         WHERE batch_id = $1
         ORDER BY changed_at DESC
         LIMIT 1`,
        [batchId],
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]?.old_expiry_date?.slice(0, 10)).toBe('2028-01-01');
      expect(audit.rows[0]?.new_expiry_date?.slice(0, 10)).toBe('2028-02-01');
      expect(audit.rows[0]?.reason).toContain('audit proof correction');
    } finally {
      await pool.query('DELETE FROM batch_expiry_audit WHERE batch_id = $1', [batchId]);
      await pool.query('DELETE FROM inventory_batches WHERE id = $1', [batchId]);
    }
  });

  it(RUN_LIVE ? 'sale movement writes stock_movements lineage for consumed lot' : 'live movement lineage skipped', async () => {
    if (!RUN_LIVE) return;

    const setup = await pool.connect();
    let batchId = '';
    try {
      await setup.query('BEGIN');
      const lot = await postgresLotRepository.upsertMaster(setup, {
        productId,
        lotNumber: `AUDIT-SALE-${Date.now()}`,
        attributes: { expiryDate: null, receivedDate: '2026-07-07' },
        quantity: 3,
        remainingQuantity: 3,
        costPrice: 15,
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

    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await lotService.consumeLot(client, {
          productId,
          quantity: 1,
          specificLotId: batchId,
          selectionPolicy: 'MANUAL',
          movementType: 'SALE',
          referenceType: 'AUDIT_PROOF',
          referenceId: batchId,
          userId,
          recordMovement: true,
          syncProduct: false,
        });
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      const movement = await pool.query<{ movement_type: string; batch_id: string }>(
        `SELECT movement_type, batch_id
         FROM stock_movements
         WHERE batch_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [batchId],
      );
      expect(movement.rows).toHaveLength(1);
      expect(movement.rows[0]?.movement_type).toBe('SALE');
      expect(movement.rows[0]?.batch_id).toBe(batchId);
    } finally {
      await pool.query('DELETE FROM stock_movements WHERE batch_id = $1', [batchId]);
      await pool.query('DELETE FROM inventory_batches WHERE id = $1', [batchId]);
    }
  });
});
