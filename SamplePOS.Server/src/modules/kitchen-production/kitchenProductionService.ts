/**
 * Kitchen Production service — ADR-005 Phase 1 Production Batch.
 * Posts into Inventory Engine only (lots + stock_movements + material reclass GL).
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
import * as glEntryService from '../../services/glEntryService.js';
import { AccountingCore } from '../../services/accountingCore.js';
import { SYSTEM_USER_ID } from '../../utils/constants.js';
import { lotService } from '../inventory-lot/lotService.js';
import { isMultistoreEnabled } from '../inventory/warehouse/multistoreSettings.js';
import { explodeRecipeForProduction } from '../sales/saleRecipeExplosion.js';
import {
  assertPostableMode,
  canCancelStatus,
  canEditStatus,
  canPostStatus,
  computeOutputUnitCost,
} from '../../../../shared/kitchen-production/plan.js';
import type {
  KitchenProductionDocument,
  KitchenProductionDraftInput,
} from '../../../../shared/kitchen-production/types.js';
import { kitchenProductionRepository } from './kitchenProductionRepository.js';
import { isKitchenProductionEnabled } from './kitchenProductionSettings.js';

async function assertEnabled(conn: Pool | PoolClient): Promise<void> {
  if (!(await isKitchenProductionEnabled(conn))) {
    throw new ForbiddenError(
      'Kitchen Production is disabled. Turn on Restaurant mode and Enable Kitchen Production in system settings.',
    );
  }
  if (!(await kitchenProductionRepository.tableExists(conn))) {
    throw new BusinessError(
      'Kitchen Production schema missing. Apply migration 587_kitchen_production_phase1.sql',
      'ERR_KITCHEN_PRODUCTION_SCHEMA',
    );
  }
}

async function insertProductionMovement(
  client: PoolClient,
  params: {
    productId: string;
    batchId: string;
    quantity: number;
    unitCost: number;
    movementType: 'PRODUCTION_ISSUE' | 'PRODUCTION_RECEIPT';
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
      'KITCHEN_PRODUCTION',
      params.documentId,
      params.notes,
      params.userId,
      'PRODUCTION_CONVERSION',
      true,
    ],
  );
}

async function recordProductionReclassToGL(
  client: PoolClient,
  data: {
    documentId: string;
    documentNumber: string;
    outputProductName: string;
    productionDate: string;
    totalCost: number;
  },
): Promise<string | null> {
  if (!(data.totalCost > 0)) return null;

  const value = Money.round(data.totalCost).toNumber();
  const result = await AccountingCore.createJournalEntry(
    {
      entryDate: data.productionDate,
      description: `Kitchen production ${data.documentNumber}: ${data.outputProductName}`,
      referenceType: 'KITCHEN_PRODUCTION',
      referenceId: data.documentId,
      referenceNumber: data.documentNumber,
      lines: [
        {
          accountCode: glEntryService.AccountCodes.INVENTORY,
          description: `FG receipt ${data.documentNumber}: ${data.outputProductName}`,
          debitAmount: value,
          creditAmount: 0,
        },
        {
          accountCode: glEntryService.AccountCodes.INVENTORY,
          description: `Component issue ${data.documentNumber}`,
          debitAmount: 0,
          creditAmount: value,
        },
      ],
      userId: SYSTEM_USER_ID,
      idempotencyKey: `KITCHEN_PRODUCTION-${data.documentId}`,
      source: 'INVENTORY_MOVE' as const,
    },
    undefined,
    client,
  );
  return result.transactionId;
}

function normalizeLines(input: KitchenProductionDraftInput['lines']) {
  if (!input?.length) {
    throw new ValidationError('At least one ingredient line is required');
  }
  const seen = new Set<string>();
  return input.map((line, i) => {
    if (!line.productId) throw new ValidationError('Ingredient product is required');
    if (!(line.actualQtyBase > 0)) {
      throw new ValidationError('Ingredient actual quantity must be positive');
    }
    if (line.plannedQtyBase < 0) {
      throw new ValidationError('Planned quantity cannot be negative');
    }
    if (seen.has(line.productId)) {
      throw new ValidationError('Duplicate ingredient on production batch');
    }
    seen.add(line.productId);
    return {
      productId: line.productId,
      plannedQtyBase: line.plannedQtyBase > 0 ? line.plannedQtyBase : line.actualQtyBase,
      actualQtyBase: line.actualQtyBase,
      sortOrder: line.sortOrder ?? i,
    };
  });
}

async function validateOutputProduct(client: Pool | PoolClient, productId: string) {
  const r = await client.query<{
    product_type: string;
    name: string;
    is_active: boolean;
    is_prepared_food: boolean | null;
  }>(
    `SELECT product_type, name, COALESCE(is_active, TRUE) AS is_active,
            COALESCE(is_prepared_food, FALSE) AS is_prepared_food
     FROM products WHERE id = $1`,
    [productId],
  );
  if (!r.rows[0] || !r.rows[0].is_active) {
    throw new NotFoundError('Output product');
  }
  if (r.rows[0].product_type === 'service') {
    throw new ValidationError(
      `Output "${r.rows[0].name}" is a service. Cook-to-stock finished food must be inventory/consumable (mark Prepare food).`,
    );
  }
  return r.rows[0];
}

async function validateComponentProduct(
  client: Pool | PoolClient,
  productId: string,
  outputProductId: string,
) {
  if (productId === outputProductId) {
    throw new ValidationError('Output product cannot be an ingredient of itself');
  }
  const r = await client.query<{ product_type: string; name: string; is_active: boolean }>(
    `SELECT product_type, name, COALESCE(is_active, TRUE) AS is_active
     FROM products WHERE id = $1`,
    [productId],
  );
  if (!r.rows[0] || !r.rows[0].is_active) {
    throw new NotFoundError(`Ingredient product ${productId}`);
  }
  if (r.rows[0].product_type === 'service') {
    throw new ValidationError(`Ingredient "${r.rows[0].name}" cannot be a service product`);
  }
  return r.rows[0];
}

export const kitchenProductionService = {
  async isEnabled(pool: Pool = globalPool) {
    return isKitchenProductionEnabled(pool);
  },

  /**
   * Catalog of kitchen finished / semi-finished products (Phase 2).
   * preparedOnly=false returns all stockable products (fallback for unflagged DBs).
   */
  async listProducibleProducts(
    pool: Pool,
    opts?: { preparedOnly?: boolean; search?: string; limit?: number },
  ) {
    await assertEnabled(pool);
    const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
    const preparedOnly = opts?.preparedOnly !== false;
    const params: unknown[] = [];
    const clauses = [
      `COALESCE(p.is_active, TRUE) = TRUE`,
      `LOWER(COALESCE(p.product_type, 'inventory')) <> 'service'`,
    ];
    // Soft if column missing — probe
    let hasPreparedCol = true;
    try {
      const col = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'products'
           AND column_name = 'is_prepared_food' LIMIT 1`,
      );
      hasPreparedCol = col.rows.length > 0;
    } catch {
      hasPreparedCol = false;
    }
    if (preparedOnly && hasPreparedCol) {
      clauses.push(`COALESCE(p.is_prepared_food, FALSE) = TRUE`);
    }
    if (opts?.search?.trim()) {
      params.push(`%${opts.search.trim()}%`);
      clauses.push(`(p.name ILIKE $${params.length} OR COALESCE(p.sku,'') ILIKE $${params.length})`);
    }
    params.push(limit);
    const r = await pool.query(
      `SELECT
         p.id,
         p.name,
         p.sku,
         p.product_type AS "productType",
         ${hasPreparedCol ? 'COALESCE(p.is_prepared_food, FALSE)' : 'FALSE'} AS "isPreparedFood",
         EXISTS (
           SELECT 1 FROM product_recipes r
           WHERE r.parent_product_id = p.id AND r.is_active = TRUE
         ) AS "hasRecipe"
       FROM products p
       WHERE ${clauses.join(' AND ')}
       ORDER BY p.name ASC
       LIMIT $${params.length}`,
      params,
    );
    return r.rows;
  },

  async list(pool: Pool, opts?: { status?: string; limit?: number }) {
    await assertEnabled(pool);
    return kitchenProductionRepository.list(pool, opts);
  },

  async getById(pool: Pool, id: string) {
    await assertEnabled(pool);
    const doc = await kitchenProductionRepository.getById(pool, id);
    if (!doc) throw new NotFoundError('Production batch');
    return doc;
  },

  /**
   * Build default component lines from active recipe scaled by output qty.
   * Caller may edit actuals before create.
   */
  async planFromRecipe(
    pool: Pool,
    outputProductId: string,
    outputQtyBase: number,
  ): Promise<Array<{ productId: string; productName: string; plannedQtyBase: number; actualQtyBase: number }>> {
    await assertEnabled(pool);
    if (!(outputQtyBase > 0)) throw new ValidationError('Output quantity must be positive');
    await validateOutputProduct(pool, outputProductId);
    const exploded = await explodeRecipeForProduction(
      pool,
      outputProductId,
      new Decimal(outputQtyBase),
    );
    if (!exploded?.length) {
      throw new ValidationError(
        'No active recipe for this product. Add ingredient lines manually or define a restaurant recipe first.',
      );
    }
    return exploded.map((line) => ({
      productId: line.componentProductId,
      productName: line.componentName,
      plannedQtyBase: Number(line.baseQty.toFixed(6)),
      actualQtyBase: Number(line.baseQty.toFixed(6)),
    }));
  },

  async createDraft(
    pool: Pool,
    input: KitchenProductionDraftInput,
    userId: string,
  ): Promise<KitchenProductionDocument> {
    await assertEnabled(pool);
    assertPostableMode(input.productionMode ?? 'COOK_TO_STOCK');
    if (!(input.outputQtyBase > 0)) throw new ValidationError('Output quantity must be positive');
    if (!userId) throw new ValidationError('User is required');

    const lines = normalizeLines(input.lines);
    await validateOutputProduct(pool, input.outputProductId);
    for (const line of lines) {
      await validateComponentProduct(pool, line.productId, input.outputProductId);
    }

    const multistore = await isMultistoreEnabled(pool);
    if (multistore && !input.storeLocationId) {
      throw new ValidationError(
        'Kitchen store location is required when multistore is enabled (ingredients issue from Kitchen, not Main).',
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const documentNumber = await kitchenProductionRepository.nextDocumentNumber(client);
      const productionDate = input.productionDate || getBusinessDate();
      const id = await kitchenProductionRepository.insertDraft(client, {
        documentNumber,
        productionDate,
        storeLocationId: input.storeLocationId ?? null,
        outputProductId: input.outputProductId,
        outputQtyBase: input.outputQtyBase,
        outputLotNumber: input.outputLotNumber ?? null,
        notes: input.notes ?? null,
        createdBy: userId,
        lines,
      });
      await client.query('COMMIT');
      return (await kitchenProductionRepository.getById(pool, id))!;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async updateDraft(
    pool: Pool,
    id: string,
    input: Partial<KitchenProductionDraftInput> & { lines?: KitchenProductionDraftInput['lines'] },
  ): Promise<KitchenProductionDocument> {
    await assertEnabled(pool);
    const existing = await kitchenProductionRepository.getById(pool, id);
    if (!existing) throw new NotFoundError('Production batch');
    if (!canEditStatus(existing.status)) {
      throw new BusinessError('Only DRAFT production batches can be edited', 'ERR_KP_STATUS');
    }

    const outputProductId = input.outputProductId ?? existing.outputProductId;
    const outputQtyBase = input.outputQtyBase ?? existing.outputQtyBase;
    if (!(outputQtyBase > 0)) throw new ValidationError('Output quantity must be positive');
    await validateOutputProduct(pool, outputProductId);

    let lines =
      input.lines != null
        ? normalizeLines(input.lines)
        : existing.lines.map((l, i) => ({
            productId: l.productId,
            plannedQtyBase: l.plannedQtyBase,
            actualQtyBase: l.actualQtyBase,
            sortOrder: l.sortOrder ?? i,
          }));

    for (const line of lines) {
      await validateComponentProduct(pool, line.productId, outputProductId);
    }

    const multistore = await isMultistoreEnabled(pool);
    const storeLocationId =
      input.storeLocationId !== undefined ? input.storeLocationId : existing.storeLocationId;
    if (multistore && !storeLocationId) {
      throw new ValidationError('Kitchen store location is required when multistore is enabled');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await kitchenProductionRepository.updateDraftHeader(client, id, {
        productionDate: input.productionDate,
        storeLocationId: input.storeLocationId,
        outputProductId: input.outputProductId,
        outputQtyBase: input.outputQtyBase,
        outputLotNumber: input.outputLotNumber,
        notes: input.notes,
      });
      if (input.lines != null) {
        await kitchenProductionRepository.replaceDraftLines(client, id, lines);
      }
      await client.query('COMMIT');
      return (await kitchenProductionRepository.getById(pool, id))!;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async cancelDraft(pool: Pool, id: string): Promise<{ cancelled: true }> {
    await assertEnabled(pool);
    const existing = await kitchenProductionRepository.getById(pool, id);
    if (!existing) throw new NotFoundError('Production batch');
    if (!canCancelStatus(existing.status)) {
      throw new BusinessError('Only DRAFT production batches can be cancelled', 'ERR_KP_STATUS');
    }
    const ok = await kitchenProductionRepository.markCancelled(pool, id);
    if (!ok) throw new BusinessError('Cancel failed', 'ERR_KP_CANCEL');
    return { cancelled: true };
  },

  /**
   * Atomic post: FEFO ingredient issue + FG lot receive + net-zero inventory reclass GL.
   */
  async post(pool: Pool, id: string, userId: string): Promise<KitchenProductionDocument> {
    await assertEnabled(pool);
    if (!userId) throw new ValidationError('User is required');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const lock = await client.query(
        `SELECT id FROM kitchen_production_documents WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (!lock.rows[0]) throw new NotFoundError('Production batch');

      const doc = await kitchenProductionRepository.getById(client, id);
      if (!doc) throw new NotFoundError('Production batch');
      if (!canPostStatus(doc.status)) {
        throw new BusinessError('Only DRAFT production batches can be posted', 'ERR_KP_STATUS');
      }
      assertPostableMode(doc.productionMode);
      if (!doc.lines.length) {
        throw new ValidationError('Production batch has no ingredient lines');
      }

      const multistore = await isMultistoreEnabled(client);
      if (multistore && !doc.storeLocationId) {
        throw new ValidationError('Kitchen store location is required when multistore is enabled');
      }

      await validateOutputProduct(client, doc.outputProductId);

      const lineCosts: Array<{ productId: string; unitCost: number; lineCost: number }> = [];
      let totalIngredientCost = new Decimal(0);

      for (const line of doc.lines) {
        const productRes = await client.query<{ name: string }>(
          `SELECT name FROM products WHERE id = $1`,
          [line.productId],
        );
        const productName = productRes.rows[0]?.name ?? line.productId;

        const consumeResult = await lotService.consumeLot(client, {
          productId: line.productId,
          quantity: line.actualQtyBase,
          storeLocationId: multistore ? doc.storeLocationId : null,
          selectionPolicy: 'FEFO',
          referenceType: 'KITCHEN_PRODUCTION',
          referenceId: doc.id,
          userId,
          productName,
          recordMovement: false,
          syncProduct: false,
        });

        const lineCost = Money.parseDb(consumeResult.totalCost);
        totalIngredientCost = totalIngredientCost.plus(lineCost);
        const unitCost =
          line.actualQtyBase > 0
            ? Number(lineCost.div(line.actualQtyBase).toFixed(6))
            : 0;
        lineCosts.push({
          productId: line.productId,
          unitCost,
          lineCost: Money.toNumber(lineCost),
        });

        for (const layer of consumeResult.layers) {
          await insertProductionMovement(client, {
            productId: line.productId,
            batchId: layer.lotId,
            quantity: layer.quantity,
            unitCost: layer.costPrice,
            movementType: 'PRODUCTION_ISSUE',
            documentId: doc.id,
            documentNumber: doc.documentNumber,
            notes: `Production issue ${doc.documentNumber} → ${doc.outputProductName ?? 'FG'}`,
            userId,
          });
        }
        await syncProductQuantity(client, line.productId);
      }

      const totalCostNum = Money.toNumber(Money.round(totalIngredientCost));
      const outputUnitCost = computeOutputUnitCost(totalCostNum, doc.outputQtyBase);
      const lotNumber =
        doc.outputLotNumber?.trim() ||
        `KP-${doc.documentNumber.replace(/[^A-Za-z0-9-]/g, '')}-${Date.now().toString(36).toUpperCase()}`;

      const businessDate = doc.productionDate || getBusinessDate();
      const fgLot = await lotService.receiveLot(client, {
        productId: doc.outputProductId,
        lotNumber,
        quantity: doc.outputQtyBase,
        costPrice: outputUnitCost,
        attributes: {
          receivedDate: businessDate,
          manufacturingDate: businessDate,
        },
        sourceType: 'PRODUCTION',
        targetStoreLocationId: multistore ? doc.storeLocationId : null,
        userId,
      });

      await insertProductionMovement(client, {
        productId: doc.outputProductId,
        batchId: fgLot.id,
        quantity: doc.outputQtyBase,
        unitCost: outputUnitCost,
        movementType: 'PRODUCTION_RECEIPT',
        documentId: doc.id,
        documentNumber: doc.documentNumber,
        notes: `Production receipt ${doc.documentNumber}`,
        userId,
      });
      await syncProductQuantity(client, doc.outputProductId);

      const journalId = await recordProductionReclassToGL(client, {
        documentId: doc.id,
        documentNumber: doc.documentNumber,
        outputProductName: doc.outputProductName ?? 'Finished food',
        productionDate: businessDate,
        totalCost: totalCostNum,
      });

      await kitchenProductionRepository.markPosted(client, doc.id, {
        postedBy: userId,
        totalIngredientCost: totalCostNum,
        outputUnitCost,
        outputLotNumber: lotNumber,
        outputInventoryBatchId: fgLot.id,
        journalEntryId: journalId,
        lineCosts,
      });

      await client.query('COMMIT');
      logger.info('Kitchen production batch posted', {
        documentId: doc.id,
        documentNumber: doc.documentNumber,
        totalIngredientCost: totalCostNum,
        outputUnitCost,
      });
      return (await kitchenProductionRepository.getById(pool, id))!;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};
