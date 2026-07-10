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
     * @deprecated Use LotService / postgresLotRepository.upsertProjection — projection writes are gateway-only.
     */
    async upsertLot(
        _conn: DbConn,
        _data: {
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
        throw new Error(
            'productLotRepository.upsertLot is retired — use LotService.receiveLot or postgresLotRepository.upsertProjection',
        );
    },
};
