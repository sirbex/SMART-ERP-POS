import type { Pool, PoolClient } from 'pg';
import { UnitOfWork, type DbConnection } from '../../../db/unitOfWork.js';
import { ValidationError } from '../../../middleware/errorHandler.js';
import { isMultistoreEnabled } from './multistoreSettings.js';
import { storeLocationRepository } from './storeLocationRepository.js';
import { warehouseInventoryRepository } from './warehouseInventoryRepository.js';
import logger from '../../../utils/logger.js';
import { recordMovement } from '../../stock-movements/stockMovementRepository.js';
import { syncProductQuantity } from '../../../utils/inventorySync.js';
import {
  applySoftQuarantine,
  findSoftExpiryCandidates,
} from '../../loss-quarantine/softQuarantineService.js';

export type ExpiryAutomationMode = 'HARD' | 'SOFT';

export interface ExpiredLotCandidate {
  balanceId: string;
  storeLocationId: string;
  storeCode: string;
  storeType: string;
  productId: string;
  productName: string;
  productSku: string | null;
  productLotId: string;
  lotNumber: string;
  expiryDate: string;
  availableQty: number;
  inventoryBatchId: string | null;
  quarantineMode: ExpiryAutomationMode;
}

export interface ExpiryAutomationLineResult {
  productLotId: string;
  productName: string;
  lotNumber: string;
  fromStoreCode: string;
  quantityMoved: number;
  movementId?: string;
  movementNumber?: string;
  quarantineMode?: ExpiryAutomationMode;
}

export interface ExpiryAutomationResult {
  quarantineMode: ExpiryAutomationMode;
  linesProcessed: number;
  totalQuantityMoved: number;
  lines: ExpiryAutomationLineResult[];
  skipped: string[];
}

export interface ExpiryAutomationPreview {
  quarantineMode: ExpiryAutomationMode;
  candidates: ExpiredLotCandidate[];
  totalQuantity: number;
}

async function ensureExpiredStore(client: PoolClient) {
  let store = await storeLocationRepository.getStoreByType(client, 'EXPIRED');
  if (!store) {
    store = await storeLocationRepository.upsertByCode(client, {
      code: 'EXPIRED',
      name: 'Expired Quarantine',
      storeType: 'EXPIRED',
    });
  }
  return store;
}

async function isExpiryAutomationEnabled(conn: DbConnection): Promise<boolean> {
  const result = await conn.query<{ enabled: boolean }>(
    `SELECT COALESCE(expiry_automation_enabled, false) AS enabled
     FROM system_settings
     LIMIT 1`,
  );
  return result.rows[0]?.enabled ?? false;
}

async function findHardExpiredCandidates(client: PoolClient): Promise<ExpiredLotCandidate[]> {
  const result = await client.query<{
    balance_id: string;
    store_location_id: string;
    store_code: string;
    store_type: string;
    product_id: string;
    product_name: string;
    product_sku: string | null;
    product_lot_id: string;
    lot_number: string;
    expiry_date: string;
    available_qty: string;
    inventory_batch_id: string | null;
  }>(
    `SELECT
       ib.id AS balance_id,
       ib.store_location_id,
       sl.code AS store_code,
       sl.store_type,
       pl.product_id,
       p.name AS product_name,
       p.sku AS product_sku,
       pl.id AS product_lot_id,
       pl.lot_number,
       pl.expiry_date::text AS expiry_date,
       GREATEST(
         ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed,
         0
       ) AS available_qty,
       pl.inventory_batch_id
     FROM inventory_balances ib
     INNER JOIN product_lots pl ON pl.id = ib.product_lot_id
     INNER JOIN products p ON p.id = pl.product_id
     INNER JOIN store_locations sl ON sl.id = ib.store_location_id
     WHERE pl.status = 'ACTIVE'
       AND pl.expiry_date IS NOT NULL
       AND pl.expiry_date <= CURRENT_DATE
       AND sl.store_type IN ('MAIN', 'SELLING')
       AND sl.is_active = true
       AND NOT ib.blocked
       AND (ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed) > 0
     ORDER BY pl.expiry_date ASC, p.name ASC, pl.lot_number ASC`,
  );

  return result.rows.map((row) => ({
    balanceId: row.balance_id,
    storeLocationId: row.store_location_id,
    storeCode: row.store_code,
    storeType: row.store_type,
    productId: row.product_id,
    productName: row.product_name,
    productSku: row.product_sku,
    productLotId: row.product_lot_id,
    lotNumber: row.lot_number,
    expiryDate: row.expiry_date,
    availableQty: parseFloat(row.available_qty),
    inventoryBatchId: row.inventory_batch_id,
    quarantineMode: 'HARD' as const,
  }));
}

async function findSoftExpiredCandidatesAsPreview(
  client: PoolClient,
): Promise<ExpiredLotCandidate[]> {
  const soft = await findSoftExpiryCandidates(client);
  return soft.map((row) => ({
    balanceId: row.inventoryBatchId,
    storeLocationId: '',
    storeCode: 'SOFT',
    storeType: 'SOFT',
    productId: row.productId,
    productName: row.productName,
    productSku: row.productSku,
    productLotId: row.productLotId ?? row.inventoryBatchId,
    lotNumber: row.lotNumber,
    expiryDate: row.expiryDate,
    availableQty: row.quantity,
    inventoryBatchId: row.inventoryBatchId,
    quarantineMode: 'SOFT' as const,
  }));
}

async function processHardExpiredLots(
  client: PoolClient,
  userId: string,
  dryRun: boolean,
): Promise<ExpiryAutomationResult> {
  const expiredStore = await ensureExpiredStore(client);
  const candidates = await findHardExpiredCandidates(client);
  const lines: ExpiryAutomationLineResult[] = [];
  const skipped: string[] = [];
  let totalQuantityMoved = 0;

  for (const row of candidates) {
    if (dryRun) {
      lines.push({
        productLotId: row.productLotId,
        productName: row.productName,
        lotNumber: row.lotNumber,
        fromStoreCode: row.storeCode,
        quantityMoved: row.availableQty,
        quarantineMode: 'HARD',
      });
      totalQuantityMoved += row.availableQty;
      continue;
    }

    try {
      await warehouseInventoryRepository.moveLotQuantityBetweenStores(client, {
        fromStoreId: row.storeLocationId,
        toStoreId: expiredStore.id,
        productId: row.productId,
        productLotId: row.productLotId,
        quantity: row.availableQty,
      });

      let movementId: string | undefined;
      let movementNumber: string | undefined;

      if (row.inventoryBatchId) {
        const movement = await recordMovement(client, {
          productId: row.productId,
          batchId: row.inventoryBatchId,
          movementType: 'EXPIRY',
          quantity: row.availableQty,
          referenceType: 'EXPIRY_AUTOMATION',
          referenceId: row.productLotId,
          notes: `Auto expiry quarantine — moved to ${expiredStore.code}`,
          createdBy: userId,
          economicEvent: 'QUARANTINE_TRANSFER',
          postsGl: false,
        });
        movementId = movement.id;
        movementNumber = movement.movementNumber;
        await syncProductQuantity(client, row.productId);

        const { syncLotStatusAfterQuarantine } = await import(
          '../../loss-quarantine/quarantineLotStatus.js'
        );
        await syncLotStatusAfterQuarantine(client, {
          inventoryBatchId: row.inventoryBatchId,
          productLotId: row.productLotId,
          quarantineKind: 'EXPIRED',
          userId,
        });
      } else {
        skipped.push(
          `${row.productName} / ${row.lotNumber}: orphan projection — no inventory_batch_id (INV-001)`,
        );
        logger.warn('Expiry automation skipped orphan projection', {
          productLotId: row.productLotId,
        });
      }

      lines.push({
        productLotId: row.productLotId,
        productName: row.productName,
        lotNumber: row.lotNumber,
        fromStoreCode: row.storeCode,
        quantityMoved: row.availableQty,
        movementId,
        movementNumber,
        quarantineMode: 'HARD',
      });
      totalQuantityMoved += row.availableQty;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      skipped.push(`${row.productName} / ${row.lotNumber}: ${msg}`);
      logger.warn('Expiry automation skipped line', {
        productLotId: row.productLotId,
        error: msg,
      });
    }
  }

  return {
    quarantineMode: 'HARD',
    linesProcessed: lines.length,
    totalQuantityMoved,
    lines,
    skipped,
  };
}

async function processSoftExpiredLots(
  client: PoolClient,
  userId: string,
  dryRun: boolean,
): Promise<ExpiryAutomationResult> {
  const candidates = await findSoftExpiryCandidates(client);
  const lines: ExpiryAutomationLineResult[] = [];
  const skipped: string[] = [];
  let totalQuantityMoved = 0;

  for (const row of candidates) {
    if (dryRun) {
      lines.push({
        productLotId: row.productLotId ?? row.inventoryBatchId,
        productName: row.productName,
        lotNumber: row.lotNumber,
        fromStoreCode: 'SOFT',
        quantityMoved: row.quantity,
        quarantineMode: 'SOFT',
      });
      totalQuantityMoved += row.quantity;
      continue;
    }

    try {
      const result = await applySoftQuarantine(client, {
        inventoryBatchId: row.inventoryBatchId,
        reason: 'EXPIRED',
        userId,
        memo: 'Expiry automation — soft quarantine (single-store)',
        referenceType: 'EXPIRY_AUTOMATION',
      });
      lines.push({
        productLotId: result.productLotId ?? row.inventoryBatchId,
        productName: row.productName,
        lotNumber: row.lotNumber,
        fromStoreCode: 'SOFT',
        quantityMoved: result.quantityHeld,
        movementId: result.movementId,
        movementNumber: result.movementNumber,
        quarantineMode: 'SOFT',
      });
      totalQuantityMoved += result.quantityHeld;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      skipped.push(`${row.productName} / ${row.lotNumber}: ${msg}`);
      logger.warn('Soft expiry automation skipped line', {
        inventoryBatchId: row.inventoryBatchId,
        error: msg,
      });
    }
  }

  return {
    quarantineMode: 'SOFT',
    linesProcessed: lines.length,
    totalQuantityMoved,
    lines,
    skipped,
  };
}

export const expiryAutomationService = {
  async preview(conn: DbConnection): Promise<ExpiryAutomationPreview> {
    const multistore = await isMultistoreEnabled(conn);
    const quarantineMode: ExpiryAutomationMode = multistore ? 'HARD' : 'SOFT';

    const candidates = UnitOfWork.isPool(conn)
      ? await UnitOfWork.run(conn, (client) =>
          multistore ? findHardExpiredCandidates(client) : findSoftExpiredCandidatesAsPreview(client),
        )
      : multistore
        ? await findHardExpiredCandidates(conn as PoolClient)
        : await findSoftExpiredCandidatesAsPreview(conn as PoolClient);

    const totalQuantity = candidates.reduce((sum, c) => sum + c.availableQty, 0);
    return { quarantineMode, candidates, totalQuantity };
  },

  async processExpiredLots(
    conn: DbConnection,
    userId: string,
    options?: { dryRun?: boolean; force?: boolean },
  ): Promise<ExpiryAutomationResult> {
    if (!options?.force && !(await isExpiryAutomationEnabled(conn))) {
      throw new ValidationError(
        'Expiry automation is disabled. Enable nightly processing in settings or pass force=true for a manual run.',
      );
    }

    const dryRun = options?.dryRun ?? false;
    const multistore = await isMultistoreEnabled(conn);

    return UnitOfWork.runOrJoin(conn, async (client) => {
      const result = multistore
        ? await processHardExpiredLots(client, userId, dryRun)
        : await processSoftExpiredLots(client, userId, dryRun);

      logger.info('Expiry automation completed', {
        quarantineMode: result.quarantineMode,
        linesProcessed: result.linesProcessed,
        totalQuantityMoved: result.totalQuantityMoved,
        skipped: result.skipped.length,
        dryRun,
      });

      return result;
    });
  },
};

/**
 * Nightly runner — both modes; no-op when flag off (default).
 * Soft = status quarantine only; hard = EXPIRED store transfer. Never posts P&L.
 */
export async function runScheduledExpiryAutomation(pool: Pool, systemUserId = 'system'): Promise<void> {
  if (!(await isExpiryAutomationEnabled(pool))) return;

  try {
    const result = await expiryAutomationService.processExpiredLots(pool, systemUserId, {
      force: true,
    });
    logger.info('[ExpiryAutomation] Scheduled run finished', {
      quarantineMode: result.quarantineMode,
      linesProcessed: result.linesProcessed,
      totalQuantityMoved: result.totalQuantityMoved,
      skipped: result.skipped.length,
    });
  } catch (error) {
    logger.error('[ExpiryAutomation] Scheduled run failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
