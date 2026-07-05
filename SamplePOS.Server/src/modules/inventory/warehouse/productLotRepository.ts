import type { Pool, PoolClient } from 'pg';
import {
    normalizeProductLot,
    type ProductLot,
    type ProductLotDbRow,
    type ProductLotStatus,
} from '../../../../../shared/types/warehouseNetwork.js';

export type DbConn = Pool | PoolClient;

export const productLotRepository = {
    async getById(conn: DbConn, lotId: string): Promise<ProductLot | null> {
        const result = await conn.query<ProductLotDbRow>(
            `SELECT * FROM product_lots WHERE id = $1`,
            [lotId],
        );
        return result.rows[0] ? normalizeProductLot(result.rows[0]) : null;
    },

    async listActiveByProduct(conn: DbConn, productId: string): Promise<ProductLot[]> {
        const result = await conn.query<ProductLotDbRow>(
            `SELECT *
             FROM product_lots
             WHERE product_id = $1
               AND status = 'ACTIVE'
               AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
             ORDER BY expiry_date ASC NULLS LAST, received_date ASC`,
            [productId],
        );
        return result.rows.map(normalizeProductLot);
    },

    /**
     * UPSERT lot identity — prevents duplicate lot rows per product + lot_number.
     */
    async upsertLot(
        conn: DbConn,
        data: {
            productId: string;
            lotNumber: string;
            expiryDate?: string | null;
            costPrice: number;
            goodsReceiptId?: string | null;
            inventoryBatchId?: string | null;
            isBonus?: boolean;
            status?: ProductLotStatus;
            notes?: string | null;
        },
    ): Promise<ProductLot> {
        const result = await conn.query<ProductLotDbRow>(
            `INSERT INTO product_lots (
               product_id, lot_number, expiry_date, cost_price,
               goods_receipt_id, inventory_batch_id, is_bonus, status, notes
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (product_id, lot_number) DO UPDATE SET
               expiry_date = COALESCE(EXCLUDED.expiry_date, product_lots.expiry_date),
               cost_price = EXCLUDED.cost_price,
               goods_receipt_id = COALESCE(EXCLUDED.goods_receipt_id, product_lots.goods_receipt_id),
               inventory_batch_id = COALESCE(EXCLUDED.inventory_batch_id, product_lots.inventory_batch_id),
               is_bonus = EXCLUDED.is_bonus,
               status = EXCLUDED.status,
               notes = COALESCE(EXCLUDED.notes, product_lots.notes),
               updated_at = NOW()
             RETURNING *`,
            [
                data.productId,
                data.lotNumber,
                data.expiryDate ?? null,
                data.costPrice,
                data.goodsReceiptId ?? null,
                data.inventoryBatchId ?? null,
                data.isBonus ?? false,
                data.status ?? 'ACTIVE',
                data.notes ?? null,
            ],
        );
        return normalizeProductLot(result.rows[0]);
    },
};
