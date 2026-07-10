import type { PoolClient } from 'pg';
import type { ILotService } from '@shared/inventory-lot/lotService.js';
import type { InventoryLot } from '@shared/inventory-lot/lotTypes.js';
import type {
  LotConsumeInput,
  LotConsumeResult,
  LotCorrectAttributesInput,
  LotOpeningReceiveInput,
  LotOpeningReceiveResult,
  LotReceiveInput,
  LotReturnInput,
  LotStatusTransitionInput,
  LotTransferInput,
} from '@shared/inventory-lot/lotEvents.js';
import {
  normalizeLotDate,
  validateAttributeCorrectionInput,
} from '@shared/inventory-lot/lotRules.js';
import {
  assertExpiryCorrectionAllowed,
  assertLotCanReceiveStock,
  firstInvariantViolation,
} from '@shared/inventory-lot/lotInvariants.js';
import { validateReceiptLot } from '@shared/inventory-lot/lotValidation.js';
import { resolveDefaultSelectionPolicy } from '@shared/inventory-lot/lotPolicy.js';
import { selectLots } from '@shared/inventory-lot/index.js';
import { ValidationError } from '../../middleware/errorHandler.js';
import { getBusinessDate } from '../../utils/dateRange.js';
import { syncProductQuantity } from '../../utils/inventorySync.js';
import { recordMovement } from '../stock-movements/stockMovementRepository.js';
import type { MovementType } from '../stock-movements/types.js';
import { isMultistoreEnabled } from '../inventory/warehouse/multistoreSettings.js';
import { storeLocationRepository } from '../inventory/warehouse/storeLocationRepository.js';
import { warehouseInventoryRepository } from '../inventory/warehouse/warehouseInventoryRepository.js';
import {
  appendLotExpiryAudit,
  getLotByIdWithClient,
  getProductLotIdByBatchId,
  postgresLotRepository,
} from './postgresLotRepository.js';
import {
  loadGlobalSelectableLots,
  loadStoreSelectableLots,
} from './postgresLotSelector.js';

type DbClient = PoolClient;

export interface CorrectLotAttributesContext extends LotCorrectAttributesInput {
  userName: string;
  ipAddress?: string | null;
}

async function fetchProductLotPolicy(client: DbClient, productId: string) {
  const result = await client.query<{ track_expiry: boolean }>(
    `SELECT COALESCE(track_expiry, false) AS track_expiry FROM products WHERE id = $1`,
    [productId],
  );
  if (result.rows.length === 0) {
    throw new ValidationError(`Product ${productId} not found`);
  }
  return { trackExpiry: result.rows[0].track_expiry };
}

async function allocateReceivedLotToStore(
  db: DbClient,
  input: LotReceiveInput,
  inventoryBatchId: string,
): Promise<void> {
  if (input.quantity <= 0) return;

  await storeLocationRepository.ensureDefaultNetworkStores(db);

  let targetStoreId = input.targetStoreLocationId ?? null;
  if (targetStoreId) {
    const store = await storeLocationRepository.getById(db, targetStoreId);
    if (!store || !store.isActive) {
      throw new ValidationError(`Target store ${targetStoreId} is not active`);
    }
  } else {
    const mainStore = await storeLocationRepository.getDefaultReceivingStore(db);
    if (!mainStore) {
      throw new ValidationError(
        'Multistore GRN requires a MAIN receiving store. Run store network setup.',
      );
    }
    targetStoreId = mainStore.id;
  }

  const productLotId = await getProductLotIdByBatchId(db, inventoryBatchId);
  if (!productLotId) {
    throw new ValidationError(
      `Product lot projection missing for batch ${inventoryBatchId} after receipt`,
    );
  }

  await warehouseInventoryRepository.incrementBalanceAtStore(db, {
    storeLocationId: targetStoreId,
    productId: input.productId,
    productLotId,
    quantity: input.quantity,
  });
}

async function ensureReturnStore(client: DbClient) {
  let store = await storeLocationRepository.getStoreByType(client, 'RETURN');
  if (!store) {
    store = await storeLocationRepository.upsertByCode(client, {
      code: 'RETURN',
      name: 'Customer Returns',
      storeType: 'RETURN',
    });
  }
  return store;
}

async function syncMultistoreProjectionAndBalance(
  db: DbClient,
  lot: InventoryLot,
  input: LotReturnInput,
  storeLocationId: string,
): Promise<string> {
  await postgresLotRepository.upsertProjection(db, {
    inventoryBatchId: lot.id,
    productId: lot.productId,
    lotNumber: lot.lotNumber,
    expiryDate: lot.attributes.expiryDate,
    costPrice: lot.costPrice,
    status: lot.status,
  });

  const productLotId = await getProductLotIdByBatchId(db, lot.id);
  if (!productLotId) {
    throw new ValidationError(`Product lot projection missing for batch ${lot.id}`);
  }

  await warehouseInventoryRepository.incrementBalanceAtStore(db, {
    storeLocationId,
    productId: lot.productId,
    productLotId,
    quantity: input.quantity,
  });

  return productLotId;
}

/** Increase or create inventory_batches master for customer/sales returns. */
async function resolveReturnMasterLot(
  db: DbClient,
  input: LotReturnInput,
): Promise<InventoryLot> {
  if (input.batchId) {
    const existing = await getLotByIdWithClient(db, input.batchId);
    if (!existing || existing.productId !== input.productId) {
      throw new ValidationError('Return batch not found for this product');
    }
    const receivable = assertLotCanReceiveStock(existing.status);
    if (receivable) {
      throw new ValidationError(receivable.message);
    }
    return postgresLotRepository.increaseMasterRemainingQuantity(
      db,
      input.batchId,
      input.quantity,
    );
  }

  const activeRes = await db.query<{ id: string }>(
    `SELECT id FROM inventory_batches
     WHERE product_id = $1 AND status = 'ACTIVE'
     ORDER BY received_date DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [input.productId],
  );
  if (activeRes.rows[0]?.id) {
    return postgresLotRepository.increaseMasterRemainingQuantity(
      db,
      activeRes.rows[0].id,
      input.quantity,
    );
  }

  const anyBatchRes = await db.query<{ id: string }>(
    `SELECT id FROM inventory_batches
     WHERE product_id = $1
     ORDER BY received_date DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [input.productId],
  );
  if (anyBatchRes.rows[0]?.id) {
    return postgresLotRepository.increaseMasterRemainingQuantity(
      db,
      anyBatchRes.rows[0].id,
      input.quantity,
    );
  }

  const lotNumber = input.lotNumber?.trim()
    || `RET-${input.referenceId.slice(0, 8)}`;

  const byNumber = await db.query<{ id: string }>(
    `SELECT id FROM inventory_batches
     WHERE product_id = $1 AND batch_number = $2
     LIMIT 1`,
    [input.productId, lotNumber],
  );

  if (byNumber.rows[0]?.id) {
    return postgresLotRepository.increaseMasterRemainingQuantity(
      db,
      byNumber.rows[0].id,
      input.quantity,
    );
  }

  return postgresLotRepository.createReturnMaster(db, {
    productId: input.productId,
    lotNumber,
    quantity: input.quantity,
    costPrice: input.costPrice,
    expiryDate: input.expiryDate,
    notes: input.notes,
  });
}

async function deductBalancesAcrossStores(
  db: DbClient,
  productId: string,
  inventoryBatchId: string,
  quantity: number,
): Promise<void> {
  const lotRes = await db.query<{ id: string }>(
    `SELECT id FROM product_lots
     WHERE inventory_batch_id = $1 AND product_id = $2
     LIMIT 1`,
    [inventoryBatchId, productId],
  );
  const productLotId = lotRes.rows[0]?.id;
  if (!productLotId) {
    throw new ValidationError(
      'Multistore deduction requires a warehouse lot linked to this batch.',
    );
  }

  const balanceRes = await db.query<{
    store_location_id: string;
    quantity_on_hand: string;
  }>(
    `SELECT store_location_id, quantity_on_hand
     FROM inventory_balances
     WHERE product_lot_id = $1 AND quantity_on_hand > 0
     ORDER BY quantity_on_hand DESC
     FOR UPDATE`,
    [productLotId],
  );

  if (balanceRes.rows.length === 0) {
    throw new ValidationError('No warehouse stock balance found for the batch lot.');
  }

  let remaining = quantity;
  for (const row of balanceRes.rows) {
    if (remaining <= 0) break;
    const onHand = parseFloat(row.quantity_on_hand);
    const take = Math.min(remaining, onHand);
    if (take <= 0) continue;
    await warehouseInventoryRepository.adjustSellableQuantity(db, {
      storeLocationId: row.store_location_id,
      productLotId,
      productId,
      quantity: take,
      direction: 'OUT',
    });
    remaining -= take;
  }

  if (remaining > 0.0001) {
    throw new ValidationError(
      `Insufficient warehouse stock for deduction. Short by ${remaining} base unit(s).`,
    );
  }
}

export const lotService: ILotService = {
  async receiveLot(client: unknown, input: LotReceiveInput): Promise<InventoryLot> {
    const db = client as DbClient;
    const businessDate = getBusinessDate();
    const policy = await fetchProductLotPolicy(db, input.productId);

    const validation = validateReceiptLot(
      policy,
      input.quantity,
      input.attributes,
      businessDate,
    );
    if (!validation.valid) {
      throw new ValidationError(validation.error ?? 'Invalid lot receipt');
    }

    const lot = await postgresLotRepository.upsertMaster(db, {
      productId: input.productId,
      lotNumber: input.lotNumber,
      attributes: input.attributes,
      quantity: input.quantity,
      remainingQuantity: input.quantity,
      costPrice: input.costPrice,
      status: 'ACTIVE',
      sourceType: input.sourceType,
      goodsReceiptId: input.goodsReceiptId ?? null,
      goodsReceiptItemId: input.goodsReceiptItemId ?? null,
      purchaseOrderId: input.purchaseOrderId ?? null,
      purchaseOrderItemId: input.purchaseOrderItemId ?? null,
      isBonus: input.isBonus,
    });

    if (await isMultistoreEnabled(db)) {
      await postgresLotRepository.upsertProjection(db, {
        inventoryBatchId: lot.id,
        productId: input.productId,
        lotNumber: input.lotNumber,
        expiryDate: input.attributes.expiryDate,
        costPrice: input.costPrice,
        goodsReceiptId: input.goodsReceiptId,
        isBonus: input.isBonus,
        status: 'ACTIVE',
      });
      await allocateReceivedLotToStore(db, input, lot.id);
    }

    return lot;
  },

  async receiveOpeningLot(
    client: unknown,
    input: LotOpeningReceiveInput,
  ): Promise<LotOpeningReceiveResult> {
    const db = client as DbClient;
    const businessDate = getBusinessDate();
    const policy = await fetchProductLotPolicy(db, input.productId);

    const validation = validateReceiptLot(
      policy,
      input.quantity,
      input.attributes,
      businessDate,
    );
    if (!validation.valid) {
      throw new ValidationError(validation.error ?? 'Invalid opening lot receipt');
    }

    const lot = await postgresLotRepository.upsertOpeningBalanceMaster(
      db,
      {
        productId: input.productId,
        lotNumber: input.lotNumber,
        attributes: input.attributes,
        quantity: input.quantity,
        remainingQuantity: input.quantity,
        costPrice: input.costPrice,
        status: 'ACTIVE',
        sourceType: 'OPENING_BALANCE',
        goodsReceiptId: input.goodsReceiptId ?? null,
        goodsReceiptItemId: input.goodsReceiptItemId ?? null,
        isBonus: input.isBonus,
      },
      input.duplicateStrategy,
    );

    if (!lot) {
      return { lot: null, skipped: true };
    }

    if (await isMultistoreEnabled(db)) {
      await postgresLotRepository.upsertProjection(db, {
        inventoryBatchId: lot.id,
        productId: input.productId,
        lotNumber: input.lotNumber,
        expiryDate: input.attributes.expiryDate,
        costPrice: input.costPrice,
        goodsReceiptId: input.goodsReceiptId,
        isBonus: input.isBonus,
        status: 'ACTIVE',
      });
    }

    return { lot, skipped: false };
  },

  async correctLotAttributes(client: unknown, input: CorrectLotAttributesContext): Promise<InventoryLot> {
    const db = client as DbClient;
    const businessDate = getBusinessDate();
    const lot = await getLotByIdWithClient(db, input.lotId);
    if (!lot) {
      throw new ValidationError('Lot not found');
    }

    const ruleError = validateAttributeCorrectionInput({
      remainingQuantity: lot.remainingQuantity,
      currentExpiryDate: lot.attributes.expiryDate ?? null,
      newExpiryDate: input.newExpiryDate,
      reason: input.reason,
      businessDate,
    });
    if (ruleError) {
      throw new ValidationError(ruleError);
    }

    const invariantViolation = firstInvariantViolation(
      assertExpiryCorrectionAllowed({
        currentExpiryDate: lot.attributes.expiryDate ?? null,
        newExpiryDate: input.newExpiryDate,
        hasBackwardsExpiryApproval: input.hasBackwardsExpiryApproval,
      }),
    );
    if (invariantViolation) {
      throw new ValidationError(invariantViolation.message);
    }

    const oldExpiry = lot.attributes.expiryDate ?? null;
    const newExpiry = normalizeLotDate(input.newExpiryDate)!;

    await postgresLotRepository.updateMasterAttributes(db, input.lotId, {
      expiryDate: newExpiry,
    });

    const productRes = await db.query<{ name: string }>(
      `SELECT name FROM products WHERE id = $1`,
      [lot.productId],
    );
    const productName = productRes.rows[0]?.name ?? 'Unknown Product';

    await appendLotExpiryAudit(db, {
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      productId: lot.productId,
      productName,
      oldExpiryDate: oldExpiry,
      newExpiryDate: newExpiry,
      changedById: input.userId,
      changedByName: input.userName,
      reason: input.reason.trim(),
      ipAddress: input.ipAddress,
    });

    const updated = await getLotByIdWithClient(db, input.lotId);
    if (!updated) {
      throw new ValidationError('Lot not found after update');
    }
    return updated;
  },

  async transitionLotStatus(client: unknown, input: LotStatusTransitionInput): Promise<InventoryLot> {
    const db = client as DbClient;
    await postgresLotRepository.updateMasterStatus(db, input.lotId, input.newStatus);
    const lot = await getLotByIdWithClient(db, input.lotId);
    if (!lot) throw new ValidationError('Lot not found');
    return lot;
  },

  async transferLot(): Promise<void> {
    throw new ValidationError('LotService.transferLot not yet implemented');
  },

  async consumeLot(client: unknown, input: LotConsumeInput): Promise<LotConsumeResult> {
    const db = client as DbClient;

    if (input.quantity <= 0) {
      throw new ValidationError('Consume quantity must be positive');
    }

    const businessDate = getBusinessDate();
    const productPolicy = await fetchProductLotPolicy(db, input.productId);
    const minDays = input.minDaysBeforeExpiry ?? 0;
    const multistore = await isMultistoreEnabled(db);
    const useStore = multistore && Boolean(input.storeLocationId);
    const crossStoreDeduct = Boolean(
      multistore
      && input.deductAcrossAllStoreBalances
      && input.specificLotId
      && !input.storeLocationId,
    );

    const policy = input.selectionPolicy
      ?? (input.specificLotId ? 'MANUAL' as const : resolveDefaultSelectionPolicy(productPolicy.trackExpiry));

    const lots = useStore
      ? await loadStoreSelectableLots(db, input.productId, input.storeLocationId!, {
        forUpdate: true,
        minDaysBeforeExpiry: minDays,
        specificLotId: input.specificLotId,
      })
      : await loadGlobalSelectableLots(db, input.productId, {
        forUpdate: true,
        minDaysBeforeExpiry: minDays,
        specificLotId: input.specificLotId,
      });

    const selection = selectLots({
      policy,
      lots,
      quantity: input.quantity,
      businessDate,
      minDaysBeforeExpirySale: minDays,
      specificLotId: input.specificLotId,
    });

    if (selection.shortfall > 0.001 || selection.totalAllocated + 0.001 < input.quantity) {
      const label = input.productName || input.productId;
      throw new Error(
        `Insufficient stock for product ${label}: `
          + `requested ${input.quantity.toFixed(4)}, `
          + `short ${selection.shortfall.toFixed(4)}`,
      );
    }

    const recordMovementFlag = input.recordMovement !== false;
    const syncProductFlag = input.syncProduct !== false;
    const lotById = new Map(lots.map((lot) => [lot.lotId, lot]));

    for (const layer of selection.layers) {
      await postgresLotRepository.decrementMasterRemainingQuantity(
        db,
        layer.lotId,
        layer.quantity,
      );

      if (crossStoreDeduct && layer.lotId === input.specificLotId) {
        await deductBalancesAcrossStores(db, input.productId, layer.lotId, layer.quantity);
      } else if (useStore && input.storeLocationId) {
        const sourceLot = lotById.get(layer.lotId);
        if (sourceLot?.productLotId) {
          await warehouseInventoryRepository.adjustSellableQuantity(db, {
            storeLocationId: input.storeLocationId,
            productLotId: sourceLot.productLotId,
            productId: input.productId,
            quantity: layer.quantity,
            direction: 'OUT',
          });
        }
      }

      if (recordMovementFlag && input.movementType) {
        await recordMovement(db, {
          productId: input.productId,
          batchId: layer.lotId,
          movementType: input.movementType as MovementType,
          quantity: layer.quantity,
          unitCost: layer.costPrice,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          createdBy: input.userId,
        });
      }
    }

    if (syncProductFlag) {
      await syncProductQuantity(db, input.productId);
    }

    return {
      layers: selection.layers.map((layer) => ({
        lotId: layer.lotId,
        lotNumber: layer.lotNumber,
        quantity: layer.quantity,
        costPrice: layer.costPrice,
        productLotId: lotById.get(layer.lotId)?.productLotId ?? null,
      })),
      totalCost: selection.totalCost,
      selectionPolicy: policy,
      shortfall: selection.shortfall,
    };
  },

  async returnLot(client: unknown, input: LotReturnInput): Promise<InventoryLot> {
    const db = client as DbClient;
    const lot = await resolveReturnMasterLot(db, input);

    if (await isMultistoreEnabled(db)) {
      const returnStoreId = input.targetStoreLocationId
        ?? (await ensureReturnStore(db)).id;
      await syncMultistoreProjectionAndBalance(db, lot, input, returnStoreId);
    }

    return lot;
  },
};

/** Opening balance / CSV import */
export async function receiveOpeningLot(
  client: DbClient,
  input: LotOpeningReceiveInput,
): Promise<LotOpeningReceiveResult> {
  return lotService.receiveOpeningLot(client, input);
}

/** Ensure product_lots projection matches inventory_batches master (read-only expiry). */
export async function ensureProjectionFromMaster(
  client: DbClient,
  inventoryBatchId: string,
): Promise<string | null> {
  const lot = await getLotByIdWithClient(client, inventoryBatchId);
  if (!lot) return null;

  await postgresLotRepository.upsertProjection(client, {
    inventoryBatchId: lot.id,
    productId: lot.productId,
    lotNumber: lot.lotNumber,
    expiryDate: lot.attributes.expiryDate,
    costPrice: lot.costPrice,
    status: lot.status,
  });

  return getProductLotIdByBatchId(client, inventoryBatchId);
}

/** Type-safe wrapper for attribute correction from routes */
export async function correctLotExpiry(
  client: DbClient,
  input: CorrectLotAttributesContext,
): Promise<InventoryLot> {
  return lotService.correctLotAttributes(client, input);
}
