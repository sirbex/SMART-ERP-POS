import type { Pool, PoolClient } from 'pg';
import {
    normalizeStoreLocation,
    type StoreLocation,
    type StoreLocationDbRow,
    type StoreType,
} from '../../../../../shared/types/warehouseNetwork.js';

export type DbConn = Pool | PoolClient;

export const storeLocationRepository = {
    async listActive(conn: DbConn): Promise<StoreLocation[]> {
        const result = await conn.query<StoreLocationDbRow>(
            `SELECT *
             FROM store_locations
             WHERE is_active = true
             ORDER BY code ASC`,
        );
        return result.rows.map(normalizeStoreLocation);
    },

    async getById(conn: DbConn, id: string): Promise<StoreLocation | null> {
        const result = await conn.query<StoreLocationDbRow>(
            `SELECT * FROM store_locations WHERE id = $1`,
            [id],
        );
        return result.rows[0] ? normalizeStoreLocation(result.rows[0]) : null;
    },

    async findByCode(conn: DbConn, code: string): Promise<StoreLocation | null> {
        const result = await conn.query<StoreLocationDbRow>(
            `SELECT * FROM store_locations WHERE code = $1`,
            [code],
        );
        return result.rows[0] ? normalizeStoreLocation(result.rows[0]) : null;
    },

    /**
     * Active POS / restaurant shop store — never MAIN warehouse.
     * Prefers is_pos_selling among SELLING-type stores; falls back to first active SELLING store.
     */
    async getActivePosSellingStore(conn: DbConn): Promise<StoreLocation | null> {
        const result = await conn.query<StoreLocationDbRow>(
            `SELECT *
             FROM store_locations
             WHERE is_active = true
               AND store_type = 'SELLING'
             ORDER BY is_pos_selling DESC, code ASC
             LIMIT 1`,
        );
        return result.rows[0] ? normalizeStoreLocation(result.rows[0]) : null;
    },

    async getDefaultReceivingStore(conn: DbConn): Promise<StoreLocation | null> {
        const result = await conn.query<StoreLocationDbRow>(
            `SELECT *
             FROM store_locations
             WHERE is_active = true
               AND (
                 is_default_receiving = true
                 OR store_type = 'MAIN'
               )
             ORDER BY is_default_receiving DESC, code ASC
             LIMIT 1`,
        );
        return result.rows[0] ? normalizeStoreLocation(result.rows[0]) : null;
    },

    async getStoreByType(conn: DbConn, storeType: StoreType): Promise<StoreLocation | null> {
        const result = await conn.query<StoreLocationDbRow>(
            `SELECT *
             FROM store_locations
             WHERE is_active = true AND store_type = $1
             ORDER BY code ASC
             LIMIT 1`,
            [storeType],
        );
        return result.rows[0] ? normalizeStoreLocation(result.rows[0]) : null;
    },

    /**
     * Idempotent seed of MAIN (receiving), TRANSIT, and SELLING (POS) stores.
     */
    async ensureDefaultNetworkStores(conn: DbConn): Promise<{
        main: StoreLocation;
        transit: StoreLocation;
        selling: StoreLocation;
    }> {
        const main = await this.upsertByCode(conn, {
            code: 'MAIN',
            name: 'Main Warehouse',
            storeType: 'MAIN',
            isDefaultReceiving: true,
            isPosSelling: false,
        });

        const transit = await this.upsertByCode(conn, {
            code: 'TRANSIT',
            name: 'In Transit',
            storeType: 'TRANSIT',
            isDefaultReceiving: false,
            isPosSelling: false,
        });

        const selling = await this.upsertByCode(conn, {
            code: 'SELLING',
            name: 'Selling Floor',
            storeType: 'SELLING',
            isDefaultReceiving: false,
            isPosSelling: true,
        });

        return { main, transit, selling };
    },

    async create(
        conn: DbConn,
        data: {
            code: string;
            name: string;
            storeType: StoreType;
            isDefaultReceiving?: boolean;
            isPosSelling?: boolean;
            parentStoreId?: string | null;
            notes?: string | null;
        },
    ): Promise<StoreLocation> {
        const result = await conn.query<StoreLocationDbRow>(
            `INSERT INTO store_locations (
               code, name, store_type,
               is_default_receiving, is_pos_selling,
               parent_store_id, notes
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                data.code,
                data.name,
                data.storeType,
                data.isDefaultReceiving ?? false,
                data.isPosSelling ?? false,
                data.parentStoreId ?? null,
                data.notes ?? null,
            ],
        );
        return normalizeStoreLocation(result.rows[0]);
    },

    async upsertByCode(
        conn: DbConn,
        data: {
            code: string;
            name: string;
            storeType: StoreType;
            isDefaultReceiving?: boolean;
            isPosSelling?: boolean;
        },
    ): Promise<StoreLocation> {
        const result = await conn.query<StoreLocationDbRow>(
            `INSERT INTO store_locations (
               code, name, store_type, is_default_receiving, is_pos_selling
             ) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (code) DO UPDATE SET
               name = EXCLUDED.name,
               store_type = EXCLUDED.store_type,
               is_default_receiving = EXCLUDED.is_default_receiving,
               is_pos_selling = EXCLUDED.is_pos_selling,
               is_active = true,
               updated_at = NOW()
             RETURNING *`,
            [
                data.code,
                data.name,
                data.storeType,
                data.isDefaultReceiving ?? false,
                data.isPosSelling ?? false,
            ],
        );
        return normalizeStoreLocation(result.rows[0]);
    },
};
