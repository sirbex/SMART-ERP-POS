/**
 * Inventory Lot domain — canonical business types (ADR-002).
 * Expiry is an attribute of InventoryLot, not a separate domain.
 */

/** Stored in inventory_batches.status / product_lots.status */
export type LotStoredStatus =
  | 'ACTIVE'
  | 'DEPLETED'
  | 'EXPIRED'
  | 'QUARANTINED'
  | 'RECALLED'
  | 'DISPOSED'
  | 'ARCHIVED'
  | 'BLOCKED';

/** Includes computed EXPIRING — never persisted */
export type LotDisplayStatus = LotStoredStatus | 'EXPIRING';

export const LOT_STORED_STATUSES: readonly LotStoredStatus[] = [
  'ACTIVE',
  'DEPLETED',
  'EXPIRED',
  'QUARANTINED',
  'RECALLED',
  'DISPOSED',
  'ARCHIVED',
  'BLOCKED',
] as const;

export type LotSourceType =
  | 'GOODS_RECEIPT'
  | 'OPENING_BALANCE'
  | 'ADJUSTMENT'
  | 'PRODUCTION'
  | 'CUSTOMER_RETURN'
  | 'SUPPLIER_RETURN'
  | 'SPLIT'
  | 'MERGE';

/** YYYY-MM-DD calendar date string (business timezone applied by caller) */
export type LotDate = string;

export interface LotGenealogy {
  parentLotId?: string | null;
  sourceType: LotSourceType;
  goodsReceiptId?: string | null;
  goodsReceiptItemId?: string | null;
}

/** Date and identity attributes owned by the lot master */
export interface LotAttributes {
  expiryDate?: LotDate | null;
  manufacturingDate?: LotDate | null;
  receivedDate: LotDate;
}

/**
 * Canonical business object — one identity per (productId, lotNumber).
 * Authoritative storage: inventory_batches. Multistore projection: product_lots.
 */
export interface InventoryLot {
  id: string;
  productId: string;
  lotNumber: string;
  attributes: LotAttributes;
  quantity: number;
  remainingQuantity: number;
  costPrice: number;
  status: LotStoredStatus;
  genealogy: LotGenealogy;
  isBonus?: boolean;
}

/** Product-level policy affecting lot validation and selection */
export interface ProductLotPolicy {
  trackExpiry: boolean;
  minDaysBeforeExpirySale?: number;
}

export type LotRiskTier = 'CRITICAL' | 'WARNING' | 'NORMAL' | 'NONE';

export interface LotExposure {
  lotId: string;
  productId: string;
  lotNumber: string;
  expiryDate: LotDate | null;
  remainingQuantity: number;
  costPrice: number;
  exposedValue: number;
  daysRemaining: number | null;
  riskTier: LotRiskTier;
  displayStatus: LotDisplayStatus;
}

export type SelectionPolicy = 'FEFO' | 'FIFO' | 'LIFO' | 'MANUAL';
