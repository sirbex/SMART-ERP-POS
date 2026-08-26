import type { InventoryLot, LotAttributes, LotDate, LotSourceType, LotStoredStatus } from './lotTypes.js';
import type { LotAuditRecord, LotExpiryAuditRecord } from './lotAudit.js';
import type { LotEvent, OpeningLotDuplicateStrategy } from './lotEvents.js';

export interface LotMasterWrite {
  productId: string;
  lotNumber: string;
  attributes: LotAttributes;
  quantity: number;
  remainingQuantity: number;
  costPrice: number;
  status: LotStoredStatus;
  sourceType: LotSourceType;
  goodsReceiptId?: string | null;
  goodsReceiptItemId?: string | null;
  purchaseOrderId?: string | null;
  purchaseOrderItemId?: string | null;
  isBonus?: boolean;
  /** Genealogy — set for SPLIT children when column exists */
  parentLotId?: string | null;
}

export interface LotProjectionWrite {
  inventoryBatchId: string;
  productId: string;
  lotNumber: string;
  expiryDate?: LotDate | null;
  costPrice: number;
  goodsReceiptId?: string | null;
  status?: LotStoredStatus;
  isBonus?: boolean;
}

/**
 * Only implementation may execute SQL against lot storage (ADR-002 §5.3).
 */
export interface ILotRepository {
  getById(lotId: string): Promise<InventoryLot | null>;
  getByProductAndLotNumber(productId: string, lotNumber: string): Promise<InventoryLot | null>;

  upsertMaster(client: unknown, data: LotMasterWrite): Promise<InventoryLot>;
  upsertProjection(client: unknown, data: LotProjectionWrite): Promise<void>;
  updateMasterAttributes(client: unknown, lotId: string, attributes: Partial<LotAttributes>): Promise<void>;
  updateMasterStatus(client: unknown, lotId: string, status: LotStoredStatus): Promise<void>;

  /**
   * Opening balance import — UPSERT or SKIP on (product_id, batch_number) conflict.
   * Returns null when SKIP strategy hits an existing lot.
   */
  upsertOpeningBalanceMaster(
    client: unknown,
    data: LotMasterWrite,
    duplicateStrategy: OpeningLotDuplicateStrategy,
  ): Promise<InventoryLot | null>;

  increaseMasterRemainingQuantity(
    client: unknown,
    batchId: string,
    quantity: number,
  ): Promise<InventoryLot>;

  createReturnMaster(
    client: unknown,
    data: {
      productId: string;
      lotNumber: string;
      quantity: number;
      costPrice: number;
      expiryDate?: LotDate | null;
      notes?: string | null;
    },
  ): Promise<InventoryLot>;

  decrementMasterRemainingQuantity(
    client: unknown,
    batchId: string,
    quantity: number,
  ): Promise<InventoryLot>;

  /** Ensure MAIN batch exists for legacy single-store adjustment flows. */
  ensureMainBatch(client: unknown, productId: string, costPrice: number): Promise<InventoryLot>;

  reactivateMasterBatch(client: unknown, batchId: string): Promise<void>;
}

export interface ILotAuditRepository {
  appendExpiryCorrection(client: unknown, record: LotExpiryAuditRecord): Promise<void>;
  appendAudit(client: unknown, record: LotAuditRecord): Promise<void>;
  listByLotId(lotId: string): Promise<LotAuditRecord[]>;
}

export interface ILotEventPublisher {
  publish(client: unknown, event: LotEvent): Promise<void>;
}
