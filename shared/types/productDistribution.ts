/**
 * Product store distribution / assortment policy (Phase 2).
 */

export type ProductDistributionPolicy = 'GLOBAL' | 'RESTRICTED';

export const PRODUCT_DISTRIBUTION_POLICIES: readonly ProductDistributionPolicy[] = [
    'GLOBAL',
    'RESTRICTED',
] as const;

export interface ProductStoreAssignment {
    storeLocationId: string;
    storeCode: string;
    storeName: string;
    storeType: string;
    /** RESTRICTED: product is in assortment at this store. */
    isAssigned: boolean;
    /** GLOBAL: can hide from POS at this store while still global. */
    isPosVisible: boolean;
    /** Whether POS/search would show this product at the store (if in stock). */
    effectivePosVisible: boolean;
}

export interface ProductDistributionPolicyDto {
    productId: string;
    distributionPolicy: ProductDistributionPolicy;
    stores: ProductStoreAssignment[];
}

export interface UpdateProductDistributionPolicyDto {
    distributionPolicy: ProductDistributionPolicy;
    assignments: Array<{
        storeLocationId: string;
        isAssigned?: boolean;
        isPosVisible?: boolean;
    }>;
}
