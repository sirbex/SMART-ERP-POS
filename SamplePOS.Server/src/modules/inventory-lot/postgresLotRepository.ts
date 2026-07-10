import type { PoolClient } from 'pg';
import type { LotSourceType, InventoryLot, LotAttributes, LotDate, LotStoredStatus } from '@shared/inventory-lot/lotTypes.js';
import type { OpeningLotDuplicateStrategy } from '@shared/inventory-lot/lotEvents.js';
import type {
  ILotRepository,
  LotMasterWrite,
  LotProjectionWrite,
} from '@shared/inventory-lot/lotRepository.js';
import { normalizeLotDate } from '@shared/inventory-lot/lotRules.js';

type DbClient = PoolClient;

function rowToInventoryLot(row: Record<string, unknown>): InventoryLot {
  const received = normalizeLotDate(row.received_date as string)
    ?? normalizeLotDate(row.created_at as string)
    ?? '';
  return {
    id: String(row.id),
    productId: String(row.product_id),
    lotNumber: String(row.batch_number),
    attributes: {
      expiryDate: normalizeLotDate(row.expiry_date as string | null),
      manufacturingDate: normalizeLotDate(row.manufacturing_date as string | null),
      receivedDate: received,
    },
    quantity: Number(row.quantity ?? 0),
    remainingQuantity: Number(row.remaining_quantity ?? 0),
    costPrice: Number(row.cost_price ?? 0),
    status: (row.status as LotStoredStatus) ?? 'ACTIVE',
    genealogy: {
      sourceType: (row.source_type as LotSourceType) ?? 'GOODS_RECEIPT',
      goodsReceiptId: (row.goods_receipt_id as string) ?? null,
      goodsReceiptItemId: (row.goods_receipt_item_id as string) ?? null,
    },
    isBonus: Boolean(row.is_bonus),
  };
}

/**
 * Postgres implementation — sole module allowed to mutate inventory_batches / product_lots expiry.
 */
export const postgresLotRepository: ILotRepository = {
  async getById(): Promise<InventoryLot | null> {
    throw new Error('Use getLotByIdWithClient(client, lotId)');
  },

  async getByProductAndLotNumber(): Promise<InventoryLot | null> {
    throw new Error('Use getLotByProductAndNumberWithClient');
  },

  async upsertMaster(client: unknown, data: LotMasterWrite): Promise<InventoryLot> {
    const db = client as DbClient;
    const expiry = normalizeLotDate(data.attributes.expiryDate);
    const sourceType = data.sourceType;

    const result = await db.query(
      `INSERT INTO inventory_batches (
         product_id, batch_number, quantity, remaining_quantity,
         expiry_date, cost_price, goods_receipt_id, goods_receipt_item_id,
         purchase_order_id, purchase_order_item_id,
         is_bonus, source_type, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        data.productId,
        data.lotNumber,
        data.quantity,
        data.remainingQuantity,
        expiry,
        data.costPrice,
        data.goodsReceiptId ?? null,
        data.goodsReceiptItemId ?? null,
        data.purchaseOrderId ?? null,
        data.purchaseOrderItemId ?? null,
        data.isBonus ?? false,
        sourceType,
        data.status,
      ],
    );
    return rowToInventoryLot(result.rows[0]);
  },

  async upsertProjection(client: unknown, data: LotProjectionWrite): Promise<void> {
    const db = client as DbClient;
    if (!data.inventoryBatchId) {
      throw new Error('INV-001: product_lots projection requires inventory_batch_id');
    }
    const expiry = normalizeLotDate(data.expiryDate);

    await db.query(
      `INSERT INTO product_lots (
         product_id, lot_number, expiry_date, cost_price,
         goods_receipt_id, inventory_batch_id, is_bonus, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (product_id, lot_number) DO UPDATE SET
         expiry_date = EXCLUDED.expiry_date,
         cost_price = EXCLUDED.cost_price,
         goods_receipt_id = COALESCE(EXCLUDED.goods_receipt_id, product_lots.goods_receipt_id),
         inventory_batch_id = EXCLUDED.inventory_batch_id,
         is_bonus = EXCLUDED.is_bonus,
         status = EXCLUDED.status,
         updated_at = NOW()`,
      [
        data.productId,
        data.lotNumber,
        expiry,
        data.costPrice,
        data.goodsReceiptId ?? null,
        data.inventoryBatchId,
        data.isBonus ?? false,
        data.status ?? 'ACTIVE',
      ],
    );
  },

  async updateMasterAttributes(client: unknown, lotId: string, attributes: Partial<LotAttributes>): Promise<void> {
    const db = client as DbClient;
    await db.query('SELECT id FROM inventory_batches WHERE id = $1 FOR UPDATE', [lotId]);

    if (attributes.expiryDate !== undefined) {
      const expiry = normalizeLotDate(attributes.expiryDate);
      await db.query(
        `UPDATE inventory_batches SET expiry_date = $1, updated_at = NOW() WHERE id = $2`,
        [expiry, lotId],
      );
      await db.query(
        `UPDATE product_lots SET expiry_date = $1, updated_at = NOW()
         WHERE inventory_batch_id = $2`,
        [expiry, lotId],
      );
    }
  },

  async updateMasterStatus(client: unknown, lotId: string, status: LotStoredStatus): Promise<void> {
    const db = client as DbClient;
    await db.query(
      `UPDATE inventory_batches SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, lotId],
    );
    await db.query(
      `UPDATE product_lots SET status = $1, updated_at = NOW() WHERE inventory_batch_id = $2`,
      [status, lotId],
    );
  },

  async upsertOpeningBalanceMaster(
    client: unknown,
    data: LotMasterWrite,
    duplicateStrategy: OpeningLotDuplicateStrategy,
  ): Promise<InventoryLot | null> {
    const db = client as DbClient;
    const expiry = normalizeLotDate(data.attributes.expiryDate);

    let conflictSql = '';
    if (duplicateStrategy === 'UPDATE') {
      conflictSql = `ON CONFLICT (product_id, batch_number) DO UPDATE SET
         quantity = EXCLUDED.quantity,
         remaining_quantity = EXCLUDED.remaining_quantity,
         cost_price = EXCLUDED.cost_price,
         expiry_date = EXCLUDED.expiry_date,
         updated_at = NOW()`;
    } else if (duplicateStrategy === 'SKIP') {
      conflictSql = 'ON CONFLICT (product_id, batch_number) DO NOTHING';
    }

    const result = await db.query(
      `INSERT INTO inventory_batches (
         product_id, batch_number, quantity, remaining_quantity,
         expiry_date, cost_price, goods_receipt_id, goods_receipt_item_id,
         is_bonus, source_type, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'OPENING_BALANCE', $10)
       ${conflictSql}
       RETURNING *`,
      [
        data.productId,
        data.lotNumber,
        data.quantity,
        data.remainingQuantity,
        expiry,
        data.costPrice,
        data.goodsReceiptId ?? null,
        data.goodsReceiptItemId ?? null,
        data.isBonus ?? false,
        data.status,
      ],
    );

    if (result.rows.length === 0) return null;
    return rowToInventoryLot(result.rows[0]);
  },

  async increaseMasterRemainingQuantity(
    client: unknown,
    batchId: string,
    quantity: number,
  ): Promise<InventoryLot> {
    const db = client as DbClient;
    const result = await db.query(
      `UPDATE inventory_batches
       SET remaining_quantity = remaining_quantity + $1,
           status = CASE
             WHEN remaining_quantity + $1 > 0 THEN 'ACTIVE'::batch_status
             ELSE status
           END,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [quantity, batchId],
    );
    if (result.rows.length === 0) {
      throw new Error(`Lot master not found: ${batchId}`);
    }
    return rowToInventoryLot(result.rows[0]);
  },

  async createReturnMaster(
    client: unknown,
    data: {
      productId: string;
      lotNumber: string;
      quantity: number;
      costPrice: number;
      expiryDate?: LotDate | null;
      notes?: string | null;
    },
  ): Promise<InventoryLot> {
    const db = client as DbClient;
    const expiry = normalizeLotDate(data.expiryDate);
    const result = await db.query(
      `INSERT INTO inventory_batches (
         product_id, batch_number, quantity, remaining_quantity,
         expiry_date, cost_price, received_date, status, notes, source_type
       ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, 'ACTIVE', $7, 'CUSTOMER_RETURN')
       RETURNING *`,
      [
        data.productId,
        data.lotNumber,
        data.quantity,
        data.quantity,
        expiry,
        data.costPrice,
        data.notes ?? null,
      ],
    );
    return rowToInventoryLot(result.rows[0]);
  },

  /** Ensure MAIN batch exists for legacy single-store adjustment flows. */
  async ensureMainBatch(
    client: unknown,
    productId: string,
    costPrice: number,
  ): Promise<InventoryLot> {
    const db = client as DbClient;
    const result = await db.query(
      `INSERT INTO inventory_batches
         (product_id, batch_number, quantity, remaining_quantity, cost_price, received_date, status)
       VALUES ($1, 'MAIN', 0, 0, $2, CURRENT_DATE, 'ACTIVE')
       ON CONFLICT (product_id, batch_number) DO UPDATE
         SET status = 'ACTIVE', updated_at = NOW()
       RETURNING *`,
      [productId, costPrice],
    );
    return rowToInventoryLot(result.rows[0]);
  },

  async reactivateMasterBatch(client: unknown, batchId: string): Promise<void> {
    const db = client as DbClient;
    await db.query(
      `UPDATE inventory_batches SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1`,
      [batchId],
    );
  },

  async decrementMasterRemainingQuantity(
    client: unknown,
    batchId: string,
    quantity: number,
  ): Promise<InventoryLot> {
    const db = client as DbClient;
    const result = await db.query(
      `UPDATE inventory_batches
       SET remaining_quantity = remaining_quantity - $1,
           status = CASE
             WHEN remaining_quantity - $1 <= 0 THEN 'DEPLETED'::batch_status
             ELSE status
           END,
           updated_at = NOW()
       WHERE id = $2
         AND remaining_quantity >= $1
       RETURNING *`,
      [quantity, batchId],
    );
    if (result.rows.length === 0) {
      throw new Error(`Insufficient lot quantity for batch ${batchId}`);
    }
    return rowToInventoryLot(result.rows[0]);
  },
};

export async function getLotByIdWithClient(db: DbClient, lotId: string): Promise<InventoryLot | null> {
  const result = await db.query(
    `SELECT ib.*
     FROM inventory_batches ib
     WHERE ib.id = $1`,
    [lotId],
  );
  return result.rows[0] ? rowToInventoryLot(result.rows[0]) : null;
}

export async function getProductLotIdByBatchId(
  db: DbClient,
  inventoryBatchId: string,
): Promise<string | null> {
  const result = await db.query<{ id: string }>(
    `SELECT id FROM product_lots WHERE inventory_batch_id = $1 LIMIT 1`,
    [inventoryBatchId],
  );
  return result.rows[0]?.id ?? null;
}

export async function appendLotExpiryAudit(
  client: DbClient,
  record: {
    lotId: string;
    lotNumber: string;
    productId: string;
    productName: string;
    oldExpiryDate: LotDate | null;
    newExpiryDate: LotDate;
    changedById: string;
    changedByName: string;
    reason: string;
    ipAddress?: string | null;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO batch_expiry_audit
       (batch_id, batch_number, product_id, product_name,
        old_expiry_date, new_expiry_date,
        changed_by_id, changed_by_name, reason, ip_address)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      record.lotId,
      record.lotNumber,
      record.productId,
      record.productName,
      record.oldExpiryDate,
      record.newExpiryDate,
      record.changedById,
      record.changedByName,
      record.reason,
      record.ipAddress ?? null,
    ],
  );
}
