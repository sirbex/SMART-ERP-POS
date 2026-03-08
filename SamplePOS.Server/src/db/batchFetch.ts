/**
 * Batch-Fetch Utilities
 * 
 * Generic helpers to convert N+1 individual queries into single batch queries.
 * Used by services to pre-load related data before per-item processing loops.
 * 
 * Pattern: Collect all IDs up front → single IN-clause query → build lookup Map
 * 
 * Performance impact:
 *   Sales:  ~80 queries/10 items → ~12
 *   GR:     ~140 queries/10 lines → ~15
 */

import { Pool, PoolClient } from 'pg';

type DbConnection = Pool | PoolClient;

// ============================================================================
// GENERIC BATCH FETCH
// ============================================================================

/**
 * Fetch rows matching a list of IDs with a single query.
 * Returns a Map keyed by the specified column value.
 *
 * @param conn    - Pool or PoolClient
 * @param sql     - Query text with a $1 placeholder for the ID array, e.g.
 *                  `SELECT * FROM products WHERE id = ANY($1::uuid[])`
 * @param ids     - Array of IDs to fetch
 * @param keyCol  - Column name used as key in the returned Map (default: 'id')
 * @param extraParams - Additional bind parameters ($2, $3, …)
 * @returns Map<string, T>
 */
export async function batchFetchMap<T extends Record<string, unknown>>(
    conn: DbConnection,
    sql: string,
    ids: string[],
    keyCol: string = 'id',
    extraParams: unknown[] = []
): Promise<Map<string, T>> {
    const map = new Map<string, T>();
    if (ids.length === 0) return map;

    // Deduplicate to avoid redundant rows
    const uniqueIds = [...new Set(ids)];
    const result = await conn.query<T>(sql, [uniqueIds, ...extraParams]);

    for (const row of result.rows) {
        const key = String(row[keyCol]);
        map.set(key, row);
    }

    return map;
}

/**
 * Fetch rows matching a list of IDs, returning an array-valued Map.
 * For one-to-many relations (e.g., product_uoms for multiple products).
 *
 * @param conn    - Pool or PoolClient
 * @param sql     - Query text with $1 placeholder for the ID array
 * @param ids     - Array of IDs to fetch
 * @param keyCol  - Column name used as key in the returned Map
 * @param extraParams - Additional bind parameters ($2, $3, …)
 * @returns Map<string, T[]>
 */
export async function batchFetchGroupMap<T extends Record<string, unknown>>(
    conn: DbConnection,
    sql: string,
    ids: string[],
    keyCol: string,
    extraParams: unknown[] = []
): Promise<Map<string, T[]>> {
    const map = new Map<string, T[]>();
    if (ids.length === 0) return map;

    const uniqueIds = [...new Set(ids)];
    const result = await conn.query<T>(sql, [uniqueIds, ...extraParams]);

    for (const row of result.rows) {
        const key = String(row[keyCol]);
        const existing = map.get(key);
        if (existing) {
            existing.push(row);
        } else {
            map.set(key, [row]);
        }
    }

    return map;
}

// ============================================================================
// DOMAIN-SPECIFIC BATCH FETCHERS (Sales)
// ============================================================================

export interface ProductBatchRow {
    [key: string]: unknown;
    id: string;
    costing_method: string;
    selling_price: string;
    cost_price: string;
    average_cost: string;
    is_active: boolean;
    min_price: string | null;
    max_discount_percentage: string | null;
}

export interface ProductUomRow {
    [key: string]: unknown;
    product_id: string;
    uom_id: string;
    name: string;
    symbol: string;
    conversion_factor: string;
    is_default: boolean;
}

export interface StockAvailabilityRow {
    product_id: string;
    total_available: string;
}

/**
 * Pre-fetch product data for a list of product IDs.
 * Combines product details, active status, and pricing info in a single query.
 */
export async function batchFetchProducts(
    conn: DbConnection,
    productIds: string[]
): Promise<Map<string, ProductBatchRow>> {
    return batchFetchMap<ProductBatchRow>(
        conn,
        `SELECT p.id, pv.costing_method, pv.selling_price, pv.cost_price, 
            COALESCE(pv.average_cost, '0') as average_cost,
            p.is_active, p.min_price, p.max_discount_percentage
     FROM products p
     LEFT JOIN product_valuation pv ON pv.product_id = p.id
     WHERE p.id = ANY($1::uuid[])`,
        productIds
    );
}

/**
 * Pre-fetch all UoM records for a list of product IDs.
 * Returns Map<productId, UomRow[]> for lookup during item processing.
 */
export async function batchFetchProductUoms(
    conn: DbConnection,
    productIds: string[]
): Promise<Map<string, ProductUomRow[]>> {
    return batchFetchGroupMap<ProductUomRow>(
        conn,
        `SELECT pu.product_id, pu.uom_id, u.name, u.symbol, 
            pu.conversion_factor::text, pu.is_default
     FROM product_uoms pu
     JOIN uoms u ON u.id = pu.uom_id
     WHERE pu.product_id = ANY($1::uuid[])`,
        productIds,
        'product_id'
    );
}

/**
 * Pre-fetch stock availability for a list of product IDs.
 * Returns Map<productId, total_available: number>.
 */
export async function batchFetchStockAvailability(
    conn: DbConnection,
    productIds: string[]
): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();

    const uniqueIds = [...new Set(productIds)];
    const result = await conn.query<StockAvailabilityRow>(
        `SELECT product_id, 
            COALESCE(SUM(remaining_quantity), 0)::text as total_available
     FROM product_batches 
     WHERE product_id = ANY($1::uuid[])
       AND remaining_quantity > 0
       AND status = 'ACTIVE'
     GROUP BY product_id`,
        [uniqueIds]
    );

    const map = new Map<string, number>();
    for (const row of result.rows) {
        map.set(row.product_id, parseFloat(row.total_available));
    }
    return map;
}
