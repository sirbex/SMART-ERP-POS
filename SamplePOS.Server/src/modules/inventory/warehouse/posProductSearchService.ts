import type { Pool, PoolClient } from 'pg';
import { UnitOfWork } from '../../../db/unitOfWork.js';
import { ValidationError } from '../../../middleware/errorHandler.js';
import { isMultistoreEnabled } from './multistoreSettings.js';
import { storeLocationRepository } from './storeLocationRepository.js';
import {
    listLegacyPosCatalog,
    listMultistorePosCatalog,
    searchLegacyPosProducts,
    searchMultistorePosProducts,
    searchServiceProducts,
    type PosProductSearchRow,
} from './posProductSearchRepository.js';
import {
    lockLegacyBatchesForAllocation,
    lockMultistoreBalancesForAllocation,
    type PosAllocationLockResult,
} from './posAllocationLockRepository.js';

export type DbConn = Pool | PoolClient;

const DEFAULT_SEARCH_LIMIT = 50;
const MAX_SEARCH_LIMIT = 100;

export interface PosProductSearchOptions {
    query: string;
    limit?: number;
}

export const posProductSearchService = {
    async resolveActiveSellingStoreId(conn: DbConn): Promise<string | null> {
        const store = await storeLocationRepository.getActivePosSellingStore(conn);
        return store?.id ?? null;
    },

    /**
     * POS catalog sync — only sellable products (stock > 0, non-expired) + services.
     * Legacy tenants: inventory_batches path unchanged in semantics.
     */
    async getPosCatalog(conn: DbConn): Promise<PosProductSearchRow[]> {
        if (!(await isMultistoreEnabled(conn))) {
            return listLegacyPosCatalog(conn);
        }

        const storeId = await this.resolveActiveSellingStoreId(conn);
        if (!storeId) {
            return searchServiceProducts(conn, '', MAX_SEARCH_LIMIT);
        }

        return listMultistorePosCatalog(conn, storeId);
    },

    /**
     * POS product search — store-isolated when multistore enabled.
     * Returns empty array when no matches (client shows "No results found").
     */
    async searchProducts(
        conn: DbConn,
        options: PosProductSearchOptions,
    ): Promise<{ storeLocationId: string | null; results: PosProductSearchRow[] }> {
        const term = options.query?.trim() ?? '';
        if (!term) {
            return { storeLocationId: null, results: [] };
        }

        const limit = Math.min(Math.max(options.limit ?? DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT);

        if (!(await isMultistoreEnabled(conn))) {
            const [inventory, services] = await Promise.all([
                searchLegacyPosProducts(conn, term, limit),
                searchServiceProducts(conn, term, limit),
            ]);
            return {
                storeLocationId: null,
                results: mergeSearchResults(inventory, services, limit),
            };
        }

        const storeId = await this.resolveActiveSellingStoreId(conn);
        if (!storeId) {
            const services = await searchServiceProducts(conn, term, limit);
            return { storeLocationId: null, results: services };
        }

        const [inventory, services] = await Promise.all([
            searchMultistorePosProducts(conn, storeId, term, limit),
            searchServiceProducts(conn, term, limit),
        ]);

        return {
            storeLocationId: storeId,
            results: mergeSearchResults(inventory, services, limit),
        };
    },

    /**
     * FEFO allocation lock preview inside a single transaction.
     * Uses SELECT … FOR UPDATE on inventory_batches (legacy) or inventory_balances (multistore).
     */
    async lockAllocation(
        pool: Pool,
        productId: string,
        quantity: number,
    ): Promise<PosAllocationLockResult> {
        if (quantity <= 0) {
            throw new ValidationError('Quantity must be positive');
        }

        return UnitOfWork.run(pool, async (client) => {
            if (!(await isMultistoreEnabled(client))) {
                const result = await lockLegacyBatchesForAllocation(client, productId, quantity);
                if (!result.sufficient) {
                    throw new ValidationError(
                        `Insufficient sellable stock for product ${productId}. ` +
                            `Requested ${quantity}, available ${result.allocatedQuantity}.`,
                    );
                }
                return result;
            }

            const storeId = await posProductSearchService.resolveActiveSellingStoreId(client);
            if (!storeId) {
                throw new ValidationError(
                    'Multistore POS/restaurant requires an active shop store (store_type=SELLING). MAIN warehouse cannot sell.',
                );
            }

            const result = await lockMultistoreBalancesForAllocation(
                client,
                storeId,
                productId,
                quantity,
            );

            if (!result.sufficient) {
                throw new ValidationError(
                    `Insufficient sellable stock at store ${storeId} for product ${productId}. ` +
                        `Requested ${quantity}, available ${result.allocatedQuantity}.`,
                );
            }

            return result;
        });
    },
};

function mergeSearchResults(
    inventory: PosProductSearchRow[],
    services: PosProductSearchRow[],
    limit: number,
): PosProductSearchRow[] {
    const seen = new Set<string>();
    const merged: PosProductSearchRow[] = [];

    for (const row of [...inventory, ...services]) {
        const id = String(row.product_id);
        if (seen.has(id)) continue;
        seen.add(id);
        merged.push(row);
        if (merged.length >= limit) break;
    }

    return merged;
}
