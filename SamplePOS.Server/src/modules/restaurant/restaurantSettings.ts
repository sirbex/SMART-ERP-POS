/**
 * Feature flag: restaurant.mode.enabled (system_settings.restaurant_mode_enabled)
 * Defaults false — flag-off = no restaurant behavior for retail tenants.
 */

import type { Pool, PoolClient } from 'pg';
import { tableHasColumn } from '../../db/schemaColumnCache.js';

export type DbConn = Pool | PoolClient;

export async function isRestaurantModeEnabled(conn: DbConn): Promise<boolean> {
  const hasFlagColumn = await tableHasColumn(conn, 'system_settings', 'restaurant_mode_enabled');
  if (!hasFlagColumn) {
    return false;
  }

  const result = await conn.query<{ enabled: boolean }>(
    `SELECT COALESCE(restaurant_mode_enabled, false) AS enabled
     FROM system_settings
     LIMIT 1`,
  );

  return result.rows[0]?.enabled ?? false;
}
