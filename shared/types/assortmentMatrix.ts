/**
 * Phase 4 — company-wide per-store availability matrix.
 */

import type { ProductDistributionPolicy } from './productDistribution.js';

/** POS availability at a store for matrix display and edits. */
export type AssortmentCellStatus = 'ACTIVE' | 'HIDDEN' | 'UNASSIGNED';

export interface AssortmentMatrixStoreColumn {
    storeLocationId: string;
    storeCode: string;
    storeName: string;
    storeType: string;
}

export interface AssortmentMatrixCell {
    storeLocationId: string;
    status: AssortmentCellStatus;
    /** Sellable qty at this store in base UoM units. */
    availableQty?: number;
}

export interface AssortmentMatrixRow {
    productId: string;
    productName: string;
    sku: string | null;
    barcode: string | null;
    category: string | null;
    distributionPolicy: ProductDistributionPolicy;
    /** Product UoM ladder from product_uoms (JSON). */
    uoms?: unknown;
    cells: AssortmentMatrixCell[];
}

export interface AssortmentMatrixDto {
    stores: AssortmentMatrixStoreColumn[];
    rows: AssortmentMatrixRow[];
    total: number;
    page: number;
    pageSize: number;
    /** Distinct product categories for filter dropdown. */
    categories: string[];
}

export interface UpdateAssortmentMatrixCellDto {
    productId: string;
    storeLocationId: string;
    status: AssortmentCellStatus;
}
