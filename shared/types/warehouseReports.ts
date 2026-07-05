/** Phase 13 — multistore warehouse network reporting DTOs */

export interface WarehouseNetworkSummary {
    asOfDate: string;
    activeStoreCount: number;
    totalSellableQty: number;
    totalInventoryValue: number;
    pendingTransferCount: number;
    transfersLast7Days: number;
    expiredQtyOnHand: number;
    nearExpiryQty: number;
    quarantineQty: number;
    lowStockProductCount: number;
}

export interface StoreStockSummaryRow {
    storeLocationId: string;
    storeCode: string;
    storeName: string;
    storeType: string;
    productCount: number;
    lotCount: number;
    sellableQty: number;
    reservedQty: number;
    inventoryValue: number;
}

export interface TransferActivityRow {
    status: string;
    count: number;
    totalQty: number;
    totalValue: number;
}

export interface TransferByStoreRow {
    storeLocationId: string;
    storeCode: string;
    storeName: string;
    direction: 'OUT' | 'IN';
    transferCount: number;
    totalQty: number;
}

export interface ExpiryExposureRow {
    storeLocationId: string;
    storeCode: string;
    storeName: string;
    expiredQty: number;
    expiringWithin30DaysQty: number;
    lotCount: number;
}

export interface QuarantineStoreRow {
    storeLocationId: string;
    storeCode: string;
    storeName: string;
    storeType: string;
    productCount: number;
    sellableQty: number;
    inventoryValue: number;
}

export interface WarehouseNetworkReport {
    summary: WarehouseNetworkSummary;
    stockByStore: StoreStockSummaryRow[];
    transferActivity: TransferActivityRow[];
    transfersByStore: TransferByStoreRow[];
    expiryExposure: ExpiryExposureRow[];
    quarantineStores: QuarantineStoreRow[];
}
