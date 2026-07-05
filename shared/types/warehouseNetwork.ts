/**
 * Multi-Store Warehouse Network — Phase 2/3 types
 *
 * Composite inventory layer: Store → Product → Lot → Qty (inventory_balances).
 * Legacy single-store per-product state: inventory_aggregate_balances (306).
 */

/** Physical/logical store classification (matches PostgreSQL store_type ENUM). */
export type StoreType =
    | 'MAIN'
    | 'SELLING'
    | 'TRANSIT'
    | 'DAMAGE'
    | 'EXPIRED'
    | 'RETURN';

export const STORE_TYPES: readonly StoreType[] = [
    'MAIN',
    'SELLING',
    'TRANSIT',
    'DAMAGE',
    'EXPIRED',
    'RETURN',
] as const;

/** Lot lifecycle status for product_lots.status */
export type ProductLotStatus =
    | 'ACTIVE'
    | 'DEPLETED'
    | 'EXPIRED'
    | 'QUARANTINED'
    | 'BLOCKED';

export const PRODUCT_LOT_STATUSES: readonly ProductLotStatus[] = [
    'ACTIVE',
    'DEPLETED',
    'EXPIRED',
    'QUARANTINED',
    'BLOCKED',
] as const;

export interface StoreLocation {
    id: string;
    code: string;
    name: string;
    storeType: StoreType;
    isActive: boolean;
    isDefaultReceiving: boolean;
    isPosSelling: boolean;
    parentStoreId?: string | null;
    notes?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface StoreLocationDbRow {
    id: string;
    code: string;
    name: string;
    store_type: StoreType;
    is_active: boolean;
    is_default_receiving: boolean;
    is_pos_selling: boolean;
    parent_store_id?: string | null;
    notes?: string | null;
    created_at: string;
    updated_at: string;
}

export interface ProductLot {
    id: string;
    productId: string;
    lotNumber: string;
    expiryDate?: string | null;
    costPrice: number;
    receivedDate: string;
    status: ProductLotStatus;
    goodsReceiptId?: string | null;
    inventoryBatchId?: string | null;
    isBonus: boolean;
    notes?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface ProductLotDbRow {
    id: string;
    product_id: string;
    lot_number: string;
    expiry_date?: string | null;
    cost_price: string;
    received_date: string;
    status: ProductLotStatus;
    goods_receipt_id?: string | null;
    inventory_batch_id?: string | null;
    is_bonus: boolean;
    notes?: string | null;
    created_at: string;
    updated_at: string;
}

/** Composite multistore balance: store × product × lot. */
export interface InventoryBalance {
    id: string;
    storeLocationId: string;
    productId: string;
    productLotId: string;
    quantityOnHand: number;
    quantityReserved: number;
    quantityDamaged: number;
    quantityExpired: number;
    quantityIncoming: number;
    quantityTransferIn: number;
    quantityTransferOut: number;
    quantityCommitted: number;
    blocked: boolean;
    updatedAt: string;
}

export interface InventoryBalanceDbRow {
    id: string;
    store_location_id: string;
    product_id: string;
    product_lot_id: string;
    quantity_on_hand: string;
    quantity_reserved: string;
    quantity_damaged: string;
    quantity_expired: string;
    quantity_incoming: string;
    quantity_transfer_in: string;
    quantity_transfer_out: string;
    quantity_committed: string;
    blocked: boolean;
    updated_at: string;
}

/** Legacy per-product state cache (migration 306, renamed in 525). */
export interface InventoryAggregateBalance {
    productId: string;
    quantityOnHand: number;
    totalReceived: number;
    totalSold: number;
    totalAdjusted: number;
    lastMovementDate?: string | null;
    updatedAt: string;
}

export interface InventoryAggregateBalanceDbRow {
    product_id: string;
    quantity_on_hand: string;
    total_received: string;
    total_sold: string;
    total_adjusted: string;
    last_movement_date?: string | null;
    updated_at: string;
}

export function normalizeStoreLocation(row: StoreLocationDbRow): StoreLocation {
    return {
        id: row.id,
        code: row.code,
        name: row.name,
        storeType: row.store_type,
        isActive: row.is_active,
        isDefaultReceiving: row.is_default_receiving,
        isPosSelling: row.is_pos_selling,
        parentStoreId: row.parent_store_id ?? null,
        notes: row.notes ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function normalizeProductLot(row: ProductLotDbRow): ProductLot {
    return {
        id: row.id,
        productId: row.product_id,
        lotNumber: row.lot_number,
        expiryDate: row.expiry_date ?? null,
        costPrice: parseFloat(row.cost_price),
        receivedDate: row.received_date,
        status: row.status,
        goodsReceiptId: row.goods_receipt_id ?? null,
        inventoryBatchId: row.inventory_batch_id ?? null,
        isBonus: row.is_bonus,
        notes: row.notes ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function normalizeInventoryBalance(row: InventoryBalanceDbRow): InventoryBalance {
    return {
        id: row.id,
        storeLocationId: row.store_location_id,
        productId: row.product_id,
        productLotId: row.product_lot_id,
        quantityOnHand: parseFloat(row.quantity_on_hand),
        quantityReserved: parseFloat(row.quantity_reserved),
        quantityDamaged: parseFloat(row.quantity_damaged),
        quantityExpired: parseFloat(row.quantity_expired),
        quantityIncoming: parseFloat(row.quantity_incoming),
        quantityTransferIn: parseFloat(row.quantity_transfer_in),
        quantityTransferOut: parseFloat(row.quantity_transfer_out),
        quantityCommitted: parseFloat(row.quantity_committed),
        blocked: row.blocked,
        updatedAt: row.updated_at,
    };
}

export function normalizeInventoryAggregateBalance(
    row: InventoryAggregateBalanceDbRow,
): InventoryAggregateBalance {
    return {
        productId: row.product_id,
        quantityOnHand: parseFloat(row.quantity_on_hand),
        totalReceived: parseFloat(row.total_received),
        totalSold: parseFloat(row.total_sold),
        totalAdjusted: parseFloat(row.total_adjusted),
        lastMovementDate: row.last_movement_date ?? null,
        updatedAt: row.updated_at,
    };
}

export function isStoreType(value: string): value is StoreType {
    return (STORE_TYPES as readonly string[]).includes(value);
}

export function isProductLotStatus(value: string): value is ProductLotStatus {
    return (PRODUCT_LOT_STATUSES as readonly string[]).includes(value);
}
