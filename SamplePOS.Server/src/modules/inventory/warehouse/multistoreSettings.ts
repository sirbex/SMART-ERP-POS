import type { Pool, PoolClient } from 'pg';
import { tableHasColumn } from '../../../db/schemaColumnCache.js';

export type DbConn = Pool | PoolClient;

let warehouseTablesExistCache: boolean | undefined;

/**
 * Returns true only when tenant has enabled multistore AND warehouse schema is present.
 * Defaults to false — preserves legacy single-store behaviour.
 */
export async function isMultistoreEnabled(conn: DbConn): Promise<boolean> {
    const hasFlagColumn = await tableHasColumn(conn, 'system_settings', 'is_multistore_enabled');
    if (!hasFlagColumn) {
        return false;
    }

    const settingsResult = await conn.query<{ enabled: boolean }>(
        `SELECT COALESCE(is_multistore_enabled, false) AS enabled
         FROM system_settings
         LIMIT 1`,
    );

    if (!settingsResult.rows[0]?.enabled) {
        return false;
    }

    return warehouseSchemaExists(conn);
}

async function warehouseSchemaExists(conn: DbConn): Promise<boolean> {
    if (warehouseTablesExistCache !== undefined) {
        return warehouseTablesExistCache;
    }

    const result = await conn.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'store_locations'
         ) AS exists`,
    );

    warehouseTablesExistCache = result.rows[0]?.exists === true;
    return warehouseTablesExistCache;
}

/** Test-only: reset cached warehouse schema probe */
export function clearMultistoreSettingsCache(): void {
    warehouseTablesExistCache = undefined;
}
