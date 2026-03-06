// Supplier Product Prices Repository
// Tracks supplier-specific pricing per product, auto-updated on GR finalization

import type { Pool, PoolClient } from 'pg';
import { pool as globalPool } from '../../db/pool.js';

export interface SupplierProductPrice {
    id: string;
    supplierId: string;
    productId: string;
    lastPurchasePrice: number;
    lastPurchaseDate: string | null;
    purchaseCount: number;
    minPriceSeen: number | null;
    maxPriceSeen: number | null;
    createdAt: string;
    updatedAt: string;
}

/**
 * Upsert supplier-product price record on GR finalization.
 * Called per product per supplier when a goods receipt is finalized.
 */
export async function upsertSupplierPrice(
    client: PoolClient | Pool,
    supplierId: string,
    productId: string,
    purchasePrice: number,
    purchaseDate: string | null
): Promise<void> {
    await client.query(
        `INSERT INTO supplier_product_prices (supplier_id, product_id, last_purchase_price, last_purchase_date, purchase_count, min_price_seen, max_price_seen)
     VALUES ($1, $2, $3, $4::date, 1, $3, $3)
     ON CONFLICT (supplier_id, product_id) DO UPDATE SET
       last_purchase_price = $3,
       last_purchase_date = COALESCE($4::date, supplier_product_prices.last_purchase_date),
       purchase_count = supplier_product_prices.purchase_count + 1,
       min_price_seen = LEAST(supplier_product_prices.min_price_seen, $3),
       max_price_seen = GREATEST(supplier_product_prices.max_price_seen, $3),
       updated_at = NOW()`,
        [supplierId, productId, purchasePrice, purchaseDate]
    );
}

/**
 * Get all supplier prices for a specific product.
 * Used on PO creation / reorder page to compare supplier prices.
 */
export async function getSupplierPricesForProduct(
    productId: string,
    dbPool?: Pool
): Promise<SupplierProductPrice[]> {
    const pool = dbPool || globalPool;
    const result = await pool.query(
        `SELECT 
       spp.id,
       spp.supplier_id AS "supplierId",
       s."CompanyName" AS "supplierName",
       s."SupplierCode" AS "supplierCode",
       spp.product_id AS "productId",
       spp.last_purchase_price AS "lastPurchasePrice",
       spp.last_purchase_date::text AS "lastPurchaseDate",
       spp.purchase_count AS "purchaseCount",
       spp.min_price_seen AS "minPriceSeen",
       spp.max_price_seen AS "maxPriceSeen",
       spp.created_at AS "createdAt",
       spp.updated_at AS "updatedAt"
     FROM supplier_product_prices spp
     JOIN suppliers s ON s."Id" = spp.supplier_id
     WHERE spp.product_id = $1
     ORDER BY spp.last_purchase_price ASC`,
        [productId]
    );
    return result.rows;
}

/**
 * Get all product prices for a specific supplier.
 * Used on supplier detail page.
 */
export async function getProductPricesForSupplier(
    supplierId: string,
    dbPool?: Pool
): Promise<SupplierProductPrice[]> {
    const pool = dbPool || globalPool;
    const result = await pool.query(
        `SELECT 
       spp.id,
       spp.supplier_id AS "supplierId",
       spp.product_id AS "productId",
       p.name AS "productName",
       p.sku AS "productSku",
       spp.last_purchase_price AS "lastPurchasePrice",
       spp.last_purchase_date::text AS "lastPurchaseDate",
       spp.purchase_count AS "purchaseCount",
       spp.min_price_seen AS "minPriceSeen",
       spp.max_price_seen AS "maxPriceSeen",
       spp.created_at AS "createdAt",
       spp.updated_at AS "updatedAt"
     FROM supplier_product_prices spp
     JOIN products p ON p.id = spp.product_id
     WHERE spp.supplier_id = $1
     ORDER BY p.name ASC`,
        [supplierId]
    );
    return result.rows;
}
