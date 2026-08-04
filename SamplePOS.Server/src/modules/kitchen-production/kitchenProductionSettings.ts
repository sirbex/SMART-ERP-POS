/**
 * Kitchen Production feature flag — ADR-005.
 * Fail-closed: missing column / error → disabled.
 */

import type { Pool, PoolClient } from 'pg';

type Db = Pool | PoolClient;

let columnExistsCache: boolean | null = null;

export async function kitchenProductionColumnExists(conn: Db): Promise<boolean> {
  if (columnExistsCache !== null) return columnExistsCache;
  try {
    const r = await conn.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'system_settings'
         AND column_name = 'kitchen_production_enabled'
       LIMIT 1`,
    );
    columnExistsCache = r.rows.length > 0;
  } catch {
    columnExistsCache = false;
  }
  return columnExistsCache;
}

/** Test helper */
export function resetKitchenProductionSettingsCache(): void {
  columnExistsCache = null;
}

export async function isKitchenProductionEnabled(conn: Db): Promise<boolean> {
  if (!(await kitchenProductionColumnExists(conn))) return false;
  try {
    const r = await conn.query<{ kitchen_production_enabled: boolean }>(
      `SELECT kitchen_production_enabled FROM system_settings LIMIT 1`,
    );
    return Boolean(r.rows[0]?.kitchen_production_enabled);
  } catch {
    return false;
  }
}
