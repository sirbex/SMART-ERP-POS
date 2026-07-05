import type { Pool, PoolClient } from 'pg';
import { productUomsJsonSql } from './inventoryStockSqlFragments.js';
import { productPosVisibleAtStoreSql } from './productDistributionSqlFragments.js';

export type DbConn = Pool | PoolClient;

export type PosProductSearchRow = Record<string, unknown>;

const productMatchClause = (paramRef: string): string => `(
    p.name ILIKE ${paramRef}
    OR COALESCE(p.sku, '') ILIKE ${paramRef}
    OR COALESCE(p.barcode, '') ILIKE ${paramRef}
    OR COALESCE(p.generic_name, '') ILIKE ${paramRef}
    OR COALESCE(p.category, '') ILIKE ${paramRef}
  )`;

function productSelectColumns(): string {
    return `
      p.id AS product_id,
      p.name AS product_name,
      p.sku,
      p.barcode,
      p.generic_name,
      p.category,
      p.product_type,
      p.is_taxable,
      p.tax_rate,
      p.min_days_before_expiry_sale,
      pv.selling_price,
      COALESCE(NULLIF(pv.average_cost, 0), pv.cost_price) AS average_cost,
      ${productUomsJsonSql('p', 'pv')} AS uoms`;
}

/**
 * Legacy single-store POS search — sellable stock from inventory_batches only.
 * Omits products with no sellable qty; expired lots excluded from aggregation.
 */
export async function searchLegacyPosProducts(
    conn: DbConn,
    searchTerm: string,
    limit: number,
): Promise<PosProductSearchRow[]> {
    const pattern = `%${searchTerm.trim()}%`;
    const result = await conn.query(
        `WITH sellable AS (
           SELECT
             b.product_id,
             SUM(b.remaining_quantity) AS total_stock,
             MIN(b.expiry_date) FILTER (WHERE b.remaining_quantity > 0) AS nearest_expiry
           FROM inventory_batches b
           INNER JOIN products p2 ON p2.id = b.product_id
           WHERE b.status = 'ACTIVE'
             AND b.remaining_quantity > 0
             AND (b.expiry_date IS NULL OR b.expiry_date > CURRENT_DATE)
             AND (
               b.expiry_date IS NULL
               OR b.expiry_date > CURRENT_DATE + COALESCE(p2.min_days_before_expiry_sale, 0) * INTERVAL '1 day'
             )
           GROUP BY b.product_id
           HAVING SUM(b.remaining_quantity) > 0
         )
         SELECT
           ${productSelectColumns()},
           sellable.total_stock,
           sellable.nearest_expiry
         FROM products p
         INNER JOIN sellable ON sellable.product_id = p.id
         LEFT JOIN product_valuation pv ON pv.product_id = p.id
         WHERE p.is_active = true
           AND ${productMatchClause('$1')}
         ORDER BY p.name ASC
         LIMIT $2`,
        [pattern, limit],
    );
    return result.rows;
}

/**
 * Service lines (no stock requirement) matching search — legacy + multistore.
 */
export async function searchServiceProducts(
    conn: DbConn,
    searchTerm: string,
    limit: number,
): Promise<PosProductSearchRow[]> {
    const pattern = `%${searchTerm.trim()}%`;
    const result = await conn.query(
        `SELECT
           ${productSelectColumns()},
           0::numeric AS total_stock,
           NULL::date AS nearest_expiry
         FROM products p
         LEFT JOIN product_valuation pv ON pv.product_id = p.id
         WHERE p.is_active = true
           AND p.product_type = 'service'
           AND ${productMatchClause('$1')}
         ORDER BY p.name ASC
         LIMIT $2`,
        [pattern, limit],
    );
    return result.rows;
}

/**
 * Multistore POS search — strictly scoped to store_location_id.
 * Omits zero-stock and expired/blocked lots entirely.
 */
export async function searchMultistorePosProducts(
    conn: DbConn,
    storeLocationId: string,
    searchTerm: string,
    limit: number,
): Promise<PosProductSearchRow[]> {
    const pattern = `%${searchTerm.trim()}%`;
    const result = await conn.query(
        `WITH sellable AS (
           SELECT
             ib.product_id,
             SUM(
               GREATEST(
                 ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed,
                 0
               )
             ) AS total_stock,
             MIN(pl.expiry_date) FILTER (WHERE ib.quantity_on_hand > 0) AS nearest_expiry
           FROM inventory_balances ib
           INNER JOIN product_lots pl ON pl.id = ib.product_lot_id
           INNER JOIN products p2 ON p2.id = ib.product_id
           WHERE ib.store_location_id = $1
             AND pl.status = 'ACTIVE'
             AND NOT ib.blocked
             AND ib.quantity_on_hand > 0
             AND (pl.expiry_date IS NULL OR pl.expiry_date > CURRENT_DATE)
             AND (
               pl.expiry_date IS NULL
               OR pl.expiry_date > CURRENT_DATE + COALESCE(p2.min_days_before_expiry_sale, 0) * INTERVAL '1 day'
             )
           GROUP BY ib.product_id
           HAVING SUM(
             GREATEST(
               ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed,
               0
             )
           ) > 0
         )
         SELECT
           ${productSelectColumns()},
           sellable.total_stock,
           sellable.nearest_expiry,
           $1::uuid AS store_location_id
         FROM products p
         INNER JOIN sellable ON sellable.product_id = p.id
         LEFT JOIN product_valuation pv ON pv.product_id = p.id
         WHERE p.is_active = true
           AND p.product_type <> 'service'
           AND ${productPosVisibleAtStoreSql('p', '$1')}
           AND ${productMatchClause('$2')}
         ORDER BY p.name ASC
         LIMIT $3`,
        [storeLocationId, pattern, limit],
    );
    return result.rows;
}

/** Full POS catalog (no text filter) — legacy sellable products + services. */
export async function listLegacyPosCatalog(conn: DbConn): Promise<PosProductSearchRow[]> {
    const inventory = await conn.query(
        `WITH sellable AS (
           SELECT
             b.product_id,
             SUM(b.remaining_quantity) AS total_stock,
             MIN(b.expiry_date) FILTER (WHERE b.remaining_quantity > 0) AS nearest_expiry
           FROM inventory_batches b
           INNER JOIN products p2 ON p2.id = b.product_id
           WHERE b.status = 'ACTIVE'
             AND b.remaining_quantity > 0
             AND (b.expiry_date IS NULL OR b.expiry_date > CURRENT_DATE)
             AND (
               b.expiry_date IS NULL
               OR b.expiry_date > CURRENT_DATE + COALESCE(p2.min_days_before_expiry_sale, 0) * INTERVAL '1 day'
             )
           GROUP BY b.product_id
           HAVING SUM(b.remaining_quantity) > 0
         )
         SELECT
           ${productSelectColumns()},
           sellable.total_stock,
           sellable.nearest_expiry,
           pi.reorder_level,
           CASE WHEN sellable.total_stock <= pi.reorder_level THEN true ELSE false END AS needs_reorder,
           0::numeric AS qty_reserved
         FROM products p
         INNER JOIN sellable ON sellable.product_id = p.id
         LEFT JOIN product_inventory pi ON pi.product_id = p.id
         LEFT JOIN product_valuation pv ON pv.product_id = p.id
         WHERE p.is_active = true`,
    );

    const services = await conn.query(
        `SELECT
           ${productSelectColumns()},
           0::numeric AS total_stock,
           NULL::date AS nearest_expiry,
           pi.reorder_level,
           false AS needs_reorder,
           0::numeric AS qty_reserved
         FROM products p
         LEFT JOIN product_inventory pi ON pi.product_id = p.id
         LEFT JOIN product_valuation pv ON pv.product_id = p.id
         WHERE p.is_active = true AND p.product_type = 'service'`,
    );

    return [...inventory.rows, ...services.rows];
}

/** Full POS catalog for multistore — active selling store only. */
export async function listMultistorePosCatalog(
    conn: DbConn,
    storeLocationId: string,
): Promise<PosProductSearchRow[]> {
    const inventory = await conn.query(
        `WITH sellable AS (
           SELECT
             ib.product_id,
             SUM(
               GREATEST(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed, 0)
             ) AS total_stock,
             MIN(pl.expiry_date) FILTER (WHERE ib.quantity_on_hand > 0) AS nearest_expiry,
             SUM(ib.quantity_reserved) AS qty_reserved,
             SUM(ib.quantity_damaged) AS qty_damaged,
             SUM(ib.quantity_expired) AS qty_expired,
             SUM(ib.quantity_incoming) AS qty_incoming,
             SUM(ib.quantity_transfer_in) AS qty_transfer_in,
             SUM(ib.quantity_transfer_out) AS qty_transfer_out,
             SUM(ib.quantity_committed) AS qty_committed
           FROM inventory_balances ib
           INNER JOIN product_lots pl ON pl.id = ib.product_lot_id
           INNER JOIN products p2 ON p2.id = ib.product_id
           WHERE ib.store_location_id = $1
             AND pl.status = 'ACTIVE'
             AND NOT ib.blocked
             AND ib.quantity_on_hand > 0
             AND (pl.expiry_date IS NULL OR pl.expiry_date > CURRENT_DATE)
             AND (
               pl.expiry_date IS NULL
               OR pl.expiry_date > CURRENT_DATE + COALESCE(p2.min_days_before_expiry_sale, 0) * INTERVAL '1 day'
             )
           GROUP BY ib.product_id
           HAVING SUM(
             GREATEST(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed, 0)
           ) > 0
         )
         SELECT
           ${productSelectColumns()},
           sellable.total_stock,
           sellable.nearest_expiry,
           $1::uuid AS store_location_id,
           pi.reorder_level,
           CASE WHEN sellable.total_stock <= pi.reorder_level THEN true ELSE false END AS needs_reorder,
           sellable.qty_reserved,
           sellable.qty_damaged,
           sellable.qty_expired,
           sellable.qty_incoming,
           sellable.qty_transfer_in,
           sellable.qty_transfer_out,
           sellable.qty_committed
         FROM products p
         INNER JOIN sellable ON sellable.product_id = p.id
         LEFT JOIN product_inventory pi ON pi.product_id = p.id
         LEFT JOIN product_valuation pv ON pv.product_id = p.id
         WHERE p.is_active = true AND p.product_type <> 'service'
           AND ${productPosVisibleAtStoreSql('p', '$1')}`,
        [storeLocationId],
    );

    const services = await conn.query(
        `SELECT
           ${productSelectColumns()},
           0::numeric AS total_stock,
           NULL::date AS nearest_expiry,
           $1::uuid AS store_location_id,
           pi.reorder_level,
           false AS needs_reorder,
           0::numeric AS qty_reserved,
           0::numeric AS qty_damaged,
           0::numeric AS qty_expired,
           0::numeric AS qty_incoming,
           0::numeric AS qty_transfer_in,
           0::numeric AS qty_transfer_out,
           0::numeric AS qty_committed
         FROM products p
         LEFT JOIN product_inventory pi ON pi.product_id = p.id
         LEFT JOIN product_valuation pv ON pv.product_id = p.id
         WHERE p.is_active = true AND p.product_type = 'service'`,
        [storeLocationId],
    );

    return [...inventory.rows, ...services.rows];
}
