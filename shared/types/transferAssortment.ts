/**
 * Phase 3 — automatic assortment expansion when transferring to a store without the product.
 */

export type TransferAssortmentExpansionPolicy = 'PROMPT' | 'ALWAYS_EXPAND' | 'TRANSFER_ONLY';

export const TRANSFER_ASSORTMENT_EXPANSION_POLICIES: readonly TransferAssortmentExpansionPolicy[] = [
    'PROMPT',
    'ALWAYS_EXPAND',
    'TRANSFER_ONLY',
] as const;

export const DEFAULT_TRANSFER_ASSORTMENT_EXPANSION_POLICY: TransferAssortmentExpansionPolicy =
    'PROMPT';

export type AssortmentGapReason = 'NOT_ASSIGNED' | 'HIDDEN_AT_STORE';

export interface AssortmentGap {
    productId: string;
    productName: string;
    sku: string | null;
    distributionPolicy: 'GLOBAL' | 'RESTRICTED';
    reason: AssortmentGapReason;
}

export interface AssortmentExpansionDecision {
    productId: string;
    expandPermanently: boolean;
}

export interface PreviewTransferAssortmentResult {
    policy: TransferAssortmentExpansionPolicy;
    gaps: AssortmentGap[];
    requiresPrompt: boolean;
}

export interface AppliedAssortmentExpansion {
    productId: string;
    productName: string;
    storeLocationId: string;
}
