/**
 * Buffet Session service — ADR-005 Phase 3.
 * Capacity document only: covers + prepared targets. Inventory stays on production/sale SSOT.
 */

import type { Pool, PoolClient } from 'pg';
import { pool as globalPool } from '../../db/pool.js';
import {
  BusinessError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../middleware/errorHandler.js';
import { getBusinessDate } from '../../utils/dateRange.js';
import logger from '../../utils/logger.js';
import {
  canCancelBuffetSession,
  canCloseBuffetSession,
  canEditBuffetSession,
  canOpenBuffetSession,
  canSellCovers,
  coversAllowed,
} from '../../../../shared/kitchen-production/buffetPlan.js';
import {
  buffetSessionRepository,
  type BuffetSession,
} from './buffetSessionRepository.js';
import { isKitchenProductionEnabled } from './kitchenProductionSettings.js';

async function assertEnabled(conn: Pool | PoolClient): Promise<void> {
  if (!(await isKitchenProductionEnabled(conn))) {
    throw new ForbiddenError(
      'Kitchen Production is disabled. Enable kitchen_production_enabled in system settings.',
    );
  }
  if (!(await buffetSessionRepository.tableExists(conn))) {
    throw new BusinessError(
      'Buffet session schema missing. Apply migration 589_kitchen_buffet_sessions.sql',
      'ERR_BUFFET_SESSION_SCHEMA',
    );
  }
}

function normalizePreparedLines(
  lines: Array<{
    preparedProductId: string;
    plannedQtyBase: number;
    unitLabel?: string | null;
    sortOrder?: number;
    notes?: string | null;
  }>,
) {
  const seen = new Set<string>();
  return (lines || []).map((line, i) => {
    if (!line.preparedProductId) throw new ValidationError('Prepared product is required');
    if (!(line.plannedQtyBase >= 0)) throw new ValidationError('Planned qty must be non-negative');
    if (seen.has(line.preparedProductId)) {
      throw new ValidationError('Duplicate prepared dish on session');
    }
    seen.add(line.preparedProductId);
    return {
      preparedProductId: line.preparedProductId,
      plannedQtyBase: line.plannedQtyBase,
      unitLabel: line.unitLabel ?? null,
      sortOrder: line.sortOrder ?? i,
      notes: line.notes ?? null,
    };
  });
}

async function validateCoverProduct(conn: Pool | PoolClient, productId: string) {
  const r = await conn.query<{
    name: string;
    product_type: string;
    is_active: boolean;
  }>(
    `SELECT name, product_type,
            COALESCE(is_active, TRUE) AS is_active
     FROM products WHERE id = $1`,
    [productId],
  );
  if (!r.rows[0]?.is_active) throw new NotFoundError('Cover product');
  // Prefers service; inventory without stock explosion also ok if operator marks cover
  return r.rows[0];
}

export const buffetSessionService = {
  async list(
    pool: Pool,
    opts?: { status?: string; serviceDate?: string; limit?: number },
  ): Promise<BuffetSession[]> {
    await assertEnabled(pool);
    return buffetSessionRepository.list(pool, opts);
  },

  async getById(pool: Pool, id: string): Promise<BuffetSession> {
    await assertEnabled(pool);
    const doc = await buffetSessionRepository.getById(pool, id);
    if (!doc) throw new NotFoundError('Buffet session');
    return doc;
  },

  async createDraft(
    pool: Pool,
    input: {
      name: string;
      serviceDate?: string;
      coverProductId: string;
      expectedCovers: number;
      allowOverbook?: boolean;
      storeLocationId?: string | null;
      notes?: string | null;
      lines?: Array<{
        preparedProductId: string;
        plannedQtyBase: number;
        unitLabel?: string | null;
        sortOrder?: number;
        notes?: string | null;
      }>;
    },
    userId: string,
  ): Promise<BuffetSession> {
    await assertEnabled(pool);
    if (!input.name?.trim()) throw new ValidationError('Session name is required');
    if (!(input.expectedCovers >= 0)) throw new ValidationError('Expected covers must be non-negative');
    if (!userId) throw new ValidationError('User is required');
    await validateCoverProduct(pool, input.coverProductId);
    const lines = normalizePreparedLines(input.lines || []);

    for (const line of lines) {
      const p = await pool.query(
        `SELECT id, product_type, name FROM products
         WHERE id = $1 AND COALESCE(is_active, TRUE) = TRUE`,
        [line.preparedProductId],
      );
      if (!p.rows[0]) throw new NotFoundError(`Prepared product ${line.preparedProductId}`);
      if (p.rows[0].product_type === 'service') {
        throw new ValidationError(
          `Prepared dish "${p.rows[0].name}" cannot be a service — use finished food inventory products.`,
        );
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const documentNumber = await buffetSessionRepository.nextDocumentNumber(client);
      const id = await buffetSessionRepository.insertDraft(client, {
        documentNumber,
        name: input.name.trim(),
        serviceDate: input.serviceDate || getBusinessDate(),
        coverProductId: input.coverProductId,
        expectedCovers: input.expectedCovers,
        allowOverbook: input.allowOverbook !== false,
        storeLocationId: input.storeLocationId ?? null,
        notes: input.notes ?? null,
        createdBy: userId,
        lines,
      });
      await client.query('COMMIT');
      return (await buffetSessionRepository.getById(pool, id))!;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async updateDraft(
    pool: Pool,
    id: string,
    input: {
      name?: string;
      serviceDate?: string;
      coverProductId?: string;
      expectedCovers?: number;
      allowOverbook?: boolean;
      storeLocationId?: string | null;
      notes?: string | null;
      lines?: Array<{
        preparedProductId: string;
        plannedQtyBase: number;
        unitLabel?: string | null;
        sortOrder?: number;
        notes?: string | null;
      }>;
    },
  ): Promise<BuffetSession> {
    await assertEnabled(pool);
    const existing = await buffetSessionRepository.getById(pool, id);
    if (!existing) throw new NotFoundError('Buffet session');
    if (!canEditBuffetSession(existing.status)) {
      throw new BusinessError('Only DRAFT buffet sessions can be edited', 'ERR_BUFFET_STATUS');
    }
    if (input.coverProductId) await validateCoverProduct(pool, input.coverProductId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await buffetSessionRepository.updateDraft(client, id, {
        name: input.name,
        serviceDate: input.serviceDate,
        coverProductId: input.coverProductId,
        expectedCovers: input.expectedCovers,
        allowOverbook: input.allowOverbook,
        storeLocationId: input.storeLocationId,
        notes: input.notes,
      });
      if (input.lines) {
        await buffetSessionRepository.replaceLines(client, id, normalizePreparedLines(input.lines));
      }
      await client.query('COMMIT');
      return (await buffetSessionRepository.getById(pool, id))!;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async open(pool: Pool, id: string, userId: string): Promise<BuffetSession> {
    await assertEnabled(pool);
    const existing = await buffetSessionRepository.getById(pool, id);
    if (!existing) throw new NotFoundError('Buffet session');
    if (!canOpenBuffetSession(existing.status)) {
      throw new BusinessError('Only DRAFT buffet sessions can be opened', 'ERR_BUFFET_STATUS');
    }
    // One OPEN session per cover product + service date
    const conflict = await pool.query(
      `SELECT id, document_number FROM kitchen_buffet_sessions
       WHERE cover_product_id = $1 AND service_date = $2::date AND status = 'OPEN' AND id <> $3
       LIMIT 1`,
      [existing.coverProductId, existing.serviceDate, id],
    );
    if (conflict.rows[0]) {
      throw new BusinessError(
        `Another OPEN session (${conflict.rows[0].document_number}) already uses this cover product on ${existing.serviceDate}`,
        'ERR_BUFFET_OPEN_CONFLICT',
      );
    }
    const ok = await buffetSessionRepository.markOpen(pool, id, userId);
    if (!ok) throw new BusinessError('Open failed', 'ERR_BUFFET_OPEN');
    // Soft-flag cover product for sale matching
    await pool.query(
      `UPDATE products SET is_buffet_cover = TRUE WHERE id = $1`,
      [existing.coverProductId],
    ).catch(() => undefined);
    return (await buffetSessionRepository.getById(pool, id))!;
  },

  async close(pool: Pool, id: string, userId: string): Promise<BuffetSession> {
    await assertEnabled(pool);
    const existing = await buffetSessionRepository.getById(pool, id);
    if (!existing) throw new NotFoundError('Buffet session');
    if (!canCloseBuffetSession(existing.status)) {
      throw new BusinessError('Only OPEN buffet sessions can be closed', 'ERR_BUFFET_STATUS');
    }
    const ok = await buffetSessionRepository.markClosed(pool, id, userId);
    if (!ok) throw new BusinessError('Close failed', 'ERR_BUFFET_CLOSE');
    return (await buffetSessionRepository.getById(pool, id))!;
  },

  async cancel(pool: Pool, id: string): Promise<{ cancelled: true }> {
    await assertEnabled(pool);
    const existing = await buffetSessionRepository.getById(pool, id);
    if (!existing) throw new NotFoundError('Buffet session');
    if (!canCancelBuffetSession(existing.status)) {
      throw new BusinessError('Session cannot be cancelled', 'ERR_BUFFET_STATUS');
    }
    if (existing.status === 'OPEN' && existing.soldCovers > 0) {
      throw new BusinessError(
        'Cannot cancel OPEN session with sold covers — close it instead',
        'ERR_BUFFET_HAS_SALES',
      );
    }
    const ok = await buffetSessionRepository.markCancelled(pool, id);
    if (!ok) throw new BusinessError('Cancel failed', 'ERR_BUFFET_CANCEL');
    return { cancelled: true };
  },

  /**
   * createSale hook: attach sold covers to OPEN session for cover product + business date.
   * No-op when kitchen production disabled or tables missing or product not a buffet cover.
   * Uses caller's transaction client when provided.
   */
  async tryConsumeCoversForSale(
    conn: Pool | PoolClient,
    input: {
      saleId: string;
      saleDate: string;
      userId: string | null;
      lines: Array<{ productId: string; quantity: number }>;
    },
  ): Promise<{ sessionId: string; covers: number }[]> {
    if (!(await isKitchenProductionEnabled(conn))) return [];
    if (!(await buffetSessionRepository.tableExists(conn))) return [];

    const results: { sessionId: string; covers: number }[] = [];
    const serviceDate = (input.saleDate || getBusinessDate()).slice(0, 10);

    for (const line of input.lines) {
      if (!line.productId || line.productId.startsWith('custom_')) continue;
      if (!(line.quantity > 0)) continue;

      // Soft probe for is_buffet_cover column
      let isCoverFlag = false;
      try {
        const flag = await conn.query<{ is_buffet_cover: boolean }>(
          `SELECT COALESCE(is_buffet_cover, FALSE) AS is_buffet_cover FROM products WHERE id = $1`,
          [line.productId],
        );
        isCoverFlag = Boolean(flag.rows[0]?.is_buffet_cover);
      } catch {
        isCoverFlag = false;
      }

      const session = await buffetSessionRepository.findOpenForCoverProduct(
        conn,
        line.productId,
        serviceDate,
      );

      if (!session) {
        if (isCoverFlag) {
          throw new ValidationError(
            `No OPEN buffet session for this cover product on ${serviceDate}. Open a Buffet Session first.`,
          );
        }
        continue;
      }
      if (!canSellCovers(session.status)) {
        throw new ValidationError(`Buffet session ${session.documentNumber} is not open for sales`);
      }

      const check = coversAllowed(
        session.soldCovers,
        session.expectedCovers,
        line.quantity,
        session.allowOverbook,
      );
      if (!check.ok) {
        throw new ValidationError(
          `Buffet session ${session.documentNumber}: expected ${session.expectedCovers} covers, ` +
            `sold ${session.soldCovers}, cannot add ${line.quantity} (overbooking disabled).`,
        );
      }

      await buffetSessionRepository.addSoldCovers(
        conn,
        session.id,
        line.quantity,
        input.saleId,
        line.productId,
        input.userId,
      );
      results.push({ sessionId: session.id, covers: line.quantity });
      logger.info('Buffet covers recorded on sale', {
        saleId: input.saleId,
        sessionId: session.id,
        covers: line.quantity,
      });
    }

    return results;
  },
};
