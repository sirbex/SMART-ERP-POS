import { BusinessError } from '../../../middleware/errorHandler.js';
import type { DbConn } from './multistoreSettings.js';
import { isMultistoreEnabled } from './multistoreSettings.js';
import { productPosVisibleAtStoreSql } from './productDistributionSqlFragments.js';
import { productDistributionService } from './productDistributionService.js';
import type {
    AppliedAssortmentExpansion,
    AssortmentExpansionDecision,
    AssortmentGap,
    PreviewTransferAssortmentResult,
    TransferAssortmentExpansionPolicy,
} from '../../../../../shared/types/transferAssortment.js';
import {
    DEFAULT_TRANSFER_ASSORTMENT_EXPANSION_POLICY,
} from '../../../../../shared/types/transferAssortment.js';

type GapRow = {
    id: string;
    name: string;
    sku: string | null;
    distribution_policy: 'GLOBAL' | 'RESTRICTED';
    gap_reason: 'NOT_ASSIGNED' | 'HIDDEN_AT_STORE';
};

export const transferAssortmentService = {
    async getExpansionPolicy(conn: DbConn): Promise<TransferAssortmentExpansionPolicy> {
        const result = await conn.query<{
            transfer_assortment_expansion_policy: TransferAssortmentExpansionPolicy;
        }>(
            `SELECT transfer_assortment_expansion_policy
             FROM system_settings
             LIMIT 1`,
        );
        return (
            result.rows[0]?.transfer_assortment_expansion_policy ??
            DEFAULT_TRANSFER_ASSORTMENT_EXPANSION_POLICY
        );
    },

    async findAssortmentGaps(
        conn: DbConn,
        destinationStoreId: string,
        productIds: string[],
    ): Promise<AssortmentGap[]> {
        if (!(await isMultistoreEnabled(conn))) {
            return [];
        }

        const uniqueIds = [...new Set(productIds)];
        if (uniqueIds.length === 0) {
            return [];
        }

        const visibleSql = productPosVisibleAtStoreSql('p', '$2');
        const result = await conn.query<GapRow>(
            `SELECT
               p.id,
               p.name,
               p.sku,
               p.distribution_policy::text AS distribution_policy,
               CASE
                 WHEN p.distribution_policy = 'RESTRICTED'
                   AND NOT EXISTS (
                     SELECT 1 FROM product_store_assignments psa
                     WHERE psa.product_id = p.id
                       AND psa.store_location_id = $2
                       AND psa.is_assigned = true
                   )
                 THEN 'NOT_ASSIGNED'
                 ELSE 'HIDDEN_AT_STORE'
               END AS gap_reason
             FROM products p
             WHERE p.id = ANY($1::uuid[])
               AND NOT ${visibleSql}
             ORDER BY p.name ASC`,
            [uniqueIds, destinationStoreId],
        );

        return result.rows.map((row) => ({
            productId: row.id,
            productName: row.name,
            sku: row.sku,
            distributionPolicy: row.distribution_policy,
            reason: row.gap_reason,
        }));
    },

    async preview(
        conn: DbConn,
        destinationStoreId: string,
        productIds: string[],
    ): Promise<PreviewTransferAssortmentResult> {
        const policy = await transferAssortmentService.getExpansionPolicy(conn);
        const gaps = await transferAssortmentService.findAssortmentGaps(
            conn,
            destinationStoreId,
            productIds,
        );

        return {
            policy,
            gaps,
            requiresPrompt: policy === 'PROMPT' && gaps.length > 0,
        };
    },

    resolveExpansionDecisions(
        policy: TransferAssortmentExpansionPolicy,
        gaps: AssortmentGap[],
        dtoExpansions?: AssortmentExpansionDecision[],
    ): AssortmentExpansionDecision[] {
        if (gaps.length === 0) {
            return [];
        }

        if (policy === 'TRANSFER_ONLY') {
            return gaps.map((gap) => ({
                productId: gap.productId,
                expandPermanently: false,
            }));
        }

        if (policy === 'ALWAYS_EXPAND') {
            return gaps.map((gap) => ({
                productId: gap.productId,
                expandPermanently: true,
            }));
        }

        const byProductId = new Map(
            (dtoExpansions ?? []).map((entry) => [entry.productId, entry]),
        );
        const missing = gaps.filter((gap) => !byProductId.has(gap.productId));
        if (missing.length > 0) {
            throw new BusinessError(
                'Choose whether each product should transfer once or be added to the destination assortment.',
                'ASSORTMENT_EXPANSION_REQUIRED',
                { gaps: missing, policy },
            );
        }

        return gaps.map((gap) => byProductId.get(gap.productId)!);
    },

    async applyPermanentExpansions(
        conn: DbConn,
        destinationStoreId: string,
        decisions: AssortmentExpansionDecision[],
    ): Promise<AppliedAssortmentExpansion[]> {
        const applied: AppliedAssortmentExpansion[] = [];

        for (const decision of decisions) {
            if (!decision.expandPermanently) {
                continue;
            }

            const productName = await productDistributionService.expandProductToStore(
                conn,
                decision.productId,
                destinationStoreId,
            );

            applied.push({
                productId: decision.productId,
                productName,
                storeLocationId: destinationStoreId,
            });
        }

        return applied;
    },
};
