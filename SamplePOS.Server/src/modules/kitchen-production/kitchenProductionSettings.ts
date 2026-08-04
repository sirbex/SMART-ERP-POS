/**
 * Kitchen Production feature flag — ADR-005.
 * Fail-closed: missing column / error → disabled.
 *
 * Business rule: kitchen production is a restaurant-domain capability.
 * It is only effective when restaurant mode is ON for the tenant.
 */

import type { Pool, PoolClient } from 'pg';
import { isRestaurantModeEnabled } from '../restaurant/restaurantSettings.js';

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

/**
 * True only when:
 *  1) restaurant_mode_enabled is on (tenant restaurant setting), AND
 *  2) kitchen_production_enabled is on.
 *
 * Restaurant off ⇒ kitchen production off for every tenant (nav, API, posts).
 */
export async function isKitchenProductionEnabled(conn: Db): Promise<boolean> {
  if (!(await isRestaurantModeEnabled(conn))) return false;
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
