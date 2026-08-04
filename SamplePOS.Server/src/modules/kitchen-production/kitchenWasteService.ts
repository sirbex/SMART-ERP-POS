/**
 * Kitchen Waste service — ADR-005 Phase 4.
 * Posts into Inventory Engine: FEFO consume + loss GL (DR 5xxx / CR 1300).
 */

import type { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { pool as globalPool } from '../../db/pool.js';
import {
  BusinessError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';
import { getBusinessDate } from '../../utils/dateRange.js';
import { allocateNextMovementNumber } from '../../utils/documentNumberAllocation.js';
import { syncProductQuantity } from '../../utils/inventorySync.js';
import { Money } from '../../utils/money.js';
import { SYSTEM_USER_ID } from '../../utils/constants.js';
import * as glEntryService from '../../services/glEntryService.js';
import { AccountingCore } from '../../services/accountingCore.js';
import { lotService } from '../inventory-lot/lotService.js';
import { isMultistoreEnabled } from '../inventory/warehouse/multistoreSettings.js';
import {
  canCancelKitchenWaste,
  canEditKitchenWaste,
  canPostKitchenWaste,
  expenseAccountForKitchenWaste,
  lossExpenseReasonForKitchenWaste,
  movementTypeForKitchenWaste,
  type KitchenWasteDocumentType,
  type KitchenWasteReason,
} from '../../../../shared/kitchen-production/wastePlan.js';
import {
  kitchenWasteRepository,
  type KitchenWasteDocument,
} from './kitchenWasteRepository.js';
import { isKitchenProductionEnabled } from './kitchenProductionSettings.js';

const REASONS = new Set<KitchenWasteReason>([
  'COOKING_LOSS',
  'LEFTOVER',
  'STAFF_MEAL',
  'SPOILAGE',
  'OVERPRODUCTION',
  'OTHER',
]);

async function assertEnabled(conn: Pool | PoolClient): Promise<void> {
  if (!(await isKitchenProductionEnabled(conn))) {
    throw new ForbiddenError(
      'Kitchen Production is disabled. Enable kitchen_production_enabled in system settings.',
    );
  }
  if (!(await kitchenWasteRepository.tableExists(conn))) {
    throw new BusinessError(
      'Kitchen waste schema missing. Apply migration 590_kitchen_waste_yield.sql',
      'ERR_KITCHEN_WASTE_SCHEMA',
    );
  }
}

function normalizeLines(
  lines: Array<{
    productId: string;
    plannedQtyBase?: number;
    qtyBase: number;
    sortOrder?: number;
    notes?: string | null;
  }>,
) {
  if (!lines?.length) throw new ValidationError('At least one waste line is required');
  const seen = new Set<string>();
  return lines.map((line, i) => {
    if (!line.productId) throw new ValidationError('Product is required');
    if (!(line.qtyBase > 0)) throw new ValidationError('Waste qty must be positive');
    if (seen.has(line.productId)) throw new ValidationError('Duplicate product on waste document');
    seen.add(line.productId);
    return {
      productId: line.productId,
      plannedQtyBase: line.plannedQtyBase ?? 0,
      qtyBase: line.qtyBase,
      sortOrder: line.sortOrder ?? i,
      notes: line.notes ?? null,
    };
  });
}

async function validateStockProduct(conn: Pool | PoolClient, productId: string) {
  const r = await conn.query<{ name: string; product_type: string; is_active: boolean }>(
    `SELECT name, product_type, COALESCE(is_active, TRUE) AS is_active
     FROM products WHERE id = $1`,
    [productId],
  );
  if (!r.rows[0]?.is_active) throw new NotFoundError('Product');
  if (r.rows[0].product_type === 'service') {
    throw new ValidationError(
      `Cannot waste service product "${r.rows[0].name}" — write off inventory/consumable stock only.`,
    );
  }
  return r.rows[0];
}

async function insertWasteMovement(
  client: PoolClient,
  params: {
    productId: string;
    batchId: string;
    quantity: number;
    unitCost: number;
    movementType: 'ADJUSTMENT_OUT' | 'DAMAGE' | 'EXPIRY';
    documentId: string;
    documentNumber: string;
    notes: string;
    userId: string;
  },
): Promise<void> {
  const movementNumber = await allocateNextMovementNumber(client);
  await client.query(
    `INSERT INTO stock_movements (
       movement_number, product_id, batch_id, movement_type, quantity, unit_cost,
       reference_type, reference_id, notes, created_by_id,
       economic_event, posts_gl
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      movementNumber,
      params.productId,
      params.batchId,
      params.movementType,
      Math.abs(params.quantity).toFixed(6),
      params.unitCost,
      'KITCHEN_WASTE',
      params.documentId,
      params.notes,
      params.userId,
      'LOSS_DISPOSAL',
      true,
    ],
  );
}

async function recordKitchenWasteToGL(
  client: PoolClient,
  data: {
    documentId: string;
    documentNumber: string;
    wasteDate: string;
    expenseAccountCode: string;
    reason: string;
    totalCost: number;
  },
): Promise<string | null> {
  if (!(data.totalCost > 0)) return null;
  const value = Money.round(data.totalCost).toNumber();
  const result = await AccountingCore.createJournalEntry(
    {
      entryDate: data.wasteDate,
      description: `Kitchen waste ${data.documentNumber}: ${data.reason}`,
      referenceType: 'KITCHEN_WASTE',
      referenceId: data.documentId,
      referenceNumber: data.documentNumber,
      lines: [
        {
          accountCode: data.expenseAccountCode,
          description: `Kitchen waste ${data.documentNumber}`,
          debitAmount: value,
          creditAmount: 0,
        },
        {
          accountCode: glEntryService.AccountCodes.INVENTORY,
          description: `Inventory write-off ${data.documentNumber}`,
          debitAmount: 0,
          creditAmount: value,
        },
      ],
      userId: SYSTEM_USER_ID,
      idempotencyKey: `KITCHEN_WASTE-${data.documentId}`,
      source: 'INVENTORY_MOVE' as const,
    },
    undefined,
    client,
  );
  return result.transactionId;
}

export type KitchenWasteDraftInput = {
  documentType?: KitchenWasteDocumentType;
  wasteDate?: string;
  reason?: KitchenWasteReason;
  storeLocationId?: string | null;
  buffetSessionId?: string | null;
  productionDocumentId?: string | null;
  notes?: string | null;
  lines: Array<{
    productId: string;
    plannedQtyBase?: number;
    qtyBase: number;
    sortOrder?: number;
    notes?: string | null;
  }>;
};

export const kitchenWasteService = {
  async list(
    pool: Pool,
    opts?: { status?: string; buffetSessionId?: string; limit?: number },
  ): Promise<KitchenWasteDocument[]> {
    await assertEnabled(pool);
    return kitchenWasteRepository.list(pool, opts);
  },

  async getById(pool: Pool, id: string): Promise<KitchenWasteDocument> {
    await assertEnabled(pool);
    const doc = await kitchenWasteRepository.getById(pool, id);
    if (!doc) throw new NotFoundError('Kitchen waste document');
    return doc;
  },

  async createDraft(
    pool: Pool,
    input: KitchenWasteDraftInput,
    userId: string,
  ): Promise<KitchenWasteDocument> {
    await assertEnabled(pool);
    if (!userId) throw new ValidationError('User is required');
    const reason = (input.reason || 'LEFTOVER') as KitchenWasteReason;
    if (!REASONS.has(reason)) throw new ValidationError(`Invalid waste reason: ${reason}`);
    const documentType = input.documentType || 'WASTE_YIELD';
    if (documentType !== 'WASTE_YIELD' && documentType !== 'CLOSING') {
      throw new ValidationError('Invalid document type');
    }
    const lines = normalizeLines(input.lines);
    for (const line of lines) {
      await validateStockProduct(pool, line.productId);
    }
    if (input.buffetSessionId) {
      const s = await pool.query(`SELECT id FROM kitchen_buffet_sessions WHERE id = $1`, [
        input.buffetSessionId,
      ]);
      if (!s.rows[0]) throw new NotFoundError('Buffet session');
    }
    if (input.productionDocumentId) {
      const p = await pool.query(`SELECT id FROM kitchen_production_documents WHERE id = $1`, [
        input.productionDocumentId,
      ]);
      if (!p.rows[0]) throw new NotFoundError('Production batch');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const documentNumber = await kitchenWasteRepository.nextDocumentNumber(client);
      const id = await kitchenWasteRepository.insertDraft(client, {
        documentNumber,
        documentType,
        wasteDate: input.wasteDate || getBusinessDate(),
        reason,
        lossExpenseReason: lossExpenseReasonForKitchenWaste(reason),
        storeLocationId: input.storeLocationId ?? null,
        buffetSessionId: input.buffetSessionId ?? null,
        productionDocumentId: input.productionDocumentId ?? null,
        notes: input.notes ?? null,
        createdBy: userId,
        lines,
      });
      await client.query('COMMIT');
      return (await kitchenWasteRepository.getById(pool, id))!;
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
    input: Partial<KitchenWasteDraftInput>,
  ): Promise<KitchenWasteDocument> {
    await assertEnabled(pool);
    const existing = await kitchenWasteRepository.getById(pool, id);
    if (!existing) throw new NotFoundError('Kitchen waste document');
    if (!canEditKitchenWaste(existing.status)) {
      throw new BusinessError('Only DRAFT waste documents can be edited', 'ERR_KW_STATUS');
    }
    if (input.reason && !REASONS.has(input.reason as KitchenWasteReason)) {
      throw new ValidationError(`Invalid waste reason: ${input.reason}`);
    }
    const reason = (input.reason as KitchenWasteReason | undefined) || undefined;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await kitchenWasteRepository.updateDraft(client, id, {
        documentType: input.documentType,
        wasteDate: input.wasteDate,
        reason,
        lossExpenseReason: reason ? lossExpenseReasonForKitchenWaste(reason) : undefined,
        storeLocationId: input.storeLocationId,
        buffetSessionId: input.buffetSessionId,
        productionDocumentId: input.productionDocumentId,
        notes: input.notes,
      });
      if (input.lines) {
        const lines = normalizeLines(input.lines);
        for (const line of lines) {
          await validateStockProduct(client, line.productId);
        }
        await kitchenWasteRepository.replaceLines(client, id, lines);
      }
      await client.query('COMMIT');
      return (await kitchenWasteRepository.getById(pool, id))!;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  /**
   * Atomic post: FEFO consume each line + LOSS_DISPOSAL movements + DR expense / CR inventory.
   */
  async post(pool: Pool, id: string, userId: string): Promise<KitchenWasteDocument> {
    await assertEnabled(pool);
    if (!userId) throw new ValidationError('User is required');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const lock = await client.query(
        `SELECT id FROM kitchen_waste_documents WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (!lock.rows[0]) throw new NotFoundError('Kitchen waste document');

      const doc = await kitchenWasteRepository.getById(client, id);
      if (!doc) throw new NotFoundError('Kitchen waste document');
      if (!canPostKitchenWaste(doc.status)) {
        throw new BusinessError('Only DRAFT waste documents can be posted', 'ERR_KW_STATUS');
      }
      if (!doc.lines.length) throw new ValidationError('Waste document has no lines');

      const multistore = await isMultistoreEnabled(client);
      if (multistore && !doc.storeLocationId) {
        throw new ValidationError('Kitchen store location is required when multistore is enabled');
      }

      const reason = doc.reason as KitchenWasteReason;
      const movementType = movementTypeForKitchenWaste(reason);
      const expenseAccountCode = expenseAccountForKitchenWaste(reason);
      const lineCosts: Array<{ productId: string; unitCost: number; lineCost: number }> = [];
      let totalCost = new Decimal(0);

      for (const line of doc.lines) {
        await validateStockProduct(client, line.productId);
        const productRes = await client.query<{ name: string }>(
          `SELECT name FROM products WHERE id = $1`,
          [line.productId],
        );
        const productName = productRes.rows[0]?.name ?? line.productId;

        const consumeResult = await lotService.consumeLot(client, {
          productId: line.productId,
          quantity: line.qtyBase,
          storeLocationId: multistore ? doc.storeLocationId : null,
          selectionPolicy: 'FEFO',
          referenceType: 'KITCHEN_WASTE',
          referenceId: doc.id,
          userId,
          productName,
          recordMovement: false,
          syncProduct: false,
        });

        const lineCost = Money.parseDb(consumeResult.totalCost);
        totalCost = totalCost.plus(lineCost);
        const unitCost =
          line.qtyBase > 0 ? Number(lineCost.div(line.qtyBase).toFixed(6)) : 0;
        lineCosts.push({
          productId: line.productId,
          unitCost,
          lineCost: Money.toNumber(lineCost),
        });

        for (const layer of consumeResult.layers) {
          await insertWasteMovement(client, {
            productId: line.productId,
            batchId: layer.lotId,
            quantity: layer.quantity,
            unitCost: layer.costPrice,
            movementType,
            documentId: doc.id,
            documentNumber: doc.documentNumber,
            notes: `Kitchen waste ${doc.documentNumber}: ${reason} — ${productName}`,
            userId,
          });
        }
        await syncProductQuantity(client, line.productId);
      }

      const totalCostNum = Money.toNumber(Money.round(totalCost));
      const journalId = await recordKitchenWasteToGL(client, {
        documentId: doc.id,
        documentNumber: doc.documentNumber,
        wasteDate: doc.wasteDate || getBusinessDate(),
        expenseAccountCode,
        reason,
        totalCost: totalCostNum,
      });

      await kitchenWasteRepository.markPosted(client, doc.id, {
        postedBy: userId,
        totalCost: totalCostNum,
        expenseAccountCode,
        journalEntryId: journalId,
        lineCosts,
      });

      await client.query('COMMIT');
      logger.info('Kitchen waste posted', {
        documentId: doc.id,
        documentNumber: doc.documentNumber,
        totalCost: totalCostNum,
        expenseAccountCode,
      });
      return (await kitchenWasteRepository.getById(pool, id))!;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async cancelDraft(pool: Pool, id: string): Promise<{ cancelled: true }> {
    await assertEnabled(pool);
    const existing = await kitchenWasteRepository.getById(pool, id);
    if (!existing) throw new NotFoundError('Kitchen waste document');
    if (!canCancelKitchenWaste(existing.status)) {
      throw new BusinessError('Only DRAFT waste documents can be cancelled', 'ERR_KW_STATUS');
    }
    const ok = await kitchenWasteRepository.markCancelled(pool, id);
    if (!ok) throw new BusinessError('Cancel failed', 'ERR_KW_CANCEL');
    return { cancelled: true };
  },

  /**
   * Create + post CLOSING leftovers and close buffet session (Phase 4 recon).
   * When leftoverLines empty, only closes the session (Phase 3 behavior).
   */
  async closeBuffetWithLeftovers(
    pool: Pool,
    sessionId: string,
    userId: string,
    opts?: {
      leftoverLines?: Array<{
        productId: string;
        plannedQtyBase?: number;
        qtyBase: number;
        notes?: string | null;
      }>;
      reason?: KitchenWasteReason;
      storeLocationId?: string | null;
      notes?: string | null;
    },
  ): Promise<{ sessionId: string; wasteDocumentId: string | null }> {
    await assertEnabled(pool);
    const { buffetSessionRepository } = await import('./buffetSessionRepository.js');
    const { canCloseBuffetSession } = await import(
      '../../../../shared/kitchen-production/buffetPlan.js'
    );

    const session = await buffetSessionRepository.getById(pool, sessionId);
    if (!session) throw new NotFoundError('Buffet session');
    if (!canCloseBuffetSession(session.status)) {
      throw new BusinessError('Only OPEN buffet sessions can be closed', 'ERR_BUFFET_STATUS');
    }

    let wasteDocumentId: string | null = null;
    const leftovers = opts?.leftoverLines || [];

    if (leftovers.length > 0) {
      const draft = await this.createDraft(
        pool,
        {
          documentType: 'CLOSING',
          reason: opts?.reason || 'LEFTOVER',
          wasteDate: session.serviceDate,
          storeLocationId: opts?.storeLocationId ?? session.storeLocationId,
          buffetSessionId: sessionId,
          notes: opts?.notes ?? `Closing leftovers for ${session.documentNumber}`,
          lines: leftovers.map((l, i) => ({
            productId: l.productId,
            plannedQtyBase: l.plannedQtyBase,
            qtyBase: l.qtyBase,
            sortOrder: i,
            notes: l.notes,
          })),
        },
        userId,
      );
      const posted = await this.post(pool, draft.id, userId);
      wasteDocumentId = posted.id;
    }

    const ok = await buffetSessionRepository.markClosed(pool, sessionId, userId);
    if (!ok) throw new BusinessError('Close failed', 'ERR_BUFFET_CLOSE');

    return { sessionId, wasteDocumentId };
  },
};
