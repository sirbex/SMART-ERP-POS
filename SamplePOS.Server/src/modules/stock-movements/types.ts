// Stock Movement Types
// Shared type definitions for stock movement module

/**
 * Stock movement types
 */
export type MovementType =
  | 'GOODS_RECEIPT'
  | 'SALE'
  | 'DELIVERY'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'RETURN'
  | 'SUPPLIER_RETURN'
  | 'DAMAGE'
  | 'EXPIRY'
  | 'OPENING_BALANCE';

/**
 * Manual movement types (can be created manually)
 */
export const MANUAL_MOVEMENT_TYPES: MovementType[] = [
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'DAMAGE',
  'EXPIRY',
  'RETURN',
];

/**
 * IN movement types (increase stock)
 */
export const IN_MOVEMENT_TYPES: MovementType[] = [
  'GOODS_RECEIPT',
  'ADJUSTMENT_IN',
  'TRANSFER_IN',
  'RETURN',
  'OPENING_BALANCE',
];

/**
 * OUT movement types (decrease stock)
 */
export const OUT_MOVEMENT_TYPES: MovementType[] = [
  'SALE',
  'DELIVERY',
  'ADJUSTMENT_OUT',
  'TRANSFER_OUT',
  'SUPPLIER_RETURN',
  'DAMAGE',
  'EXPIRY',
];

/**
 * Stock movement record
 */
export interface StockMovement {
  id: string;
  movementNumber: string;
  productId: string;
  batchId: string | null;
  movementType: MovementType;
  quantity: number;
  unitCost: number | null;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdById: string | null;
  createdAt: Date;
}

/**
 * Stock movement with product details
 */
export interface StockMovementWithDetails extends StockMovement {
  productName: string;
  productCategory?: string | null;
  productUom?: string | null;
  batchNumber: string | null;
  saleNumber?: string | null;
  grNumber?: string | null;
  supplierName?: string | null;
  balanceAfter?: number | null;
}

/**
 * Movement filters
 */
export interface MovementFilters {
  movementType?: MovementType | MovementType[];
  startDate?: string;
  endDate?: string;
  search?: string;
}

/**
 * Record movement data
 */
export interface RecordMovementData {
  productId: string;
  batchId?: string | null;
  movementType: MovementType;
  quantity: number;
  unitCost?: number | null;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}
