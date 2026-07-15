/**
 * Feature flag: bad_debt_writeoff_enabled (ADR-006 Phase 4A)
 * Defaults false — flag-off = no AR write-off gateway behavior.
 */

import type { Pool, PoolClient } from 'pg';
import { tableHasColumn } from '../../db/schemaColumnCache.js';

export type DbConn = Pool | PoolClient;

export async function isBadDebtWriteoffEnabled(conn: DbConn): Promise<boolean> {
  const hasFlagColumn = await tableHasColumn(conn, 'system_settings', 'bad_debt_writeoff_enabled');
  if (!hasFlagColumn) {
    return false;
  }

  const result = await conn.query<{ enabled: boolean }>(
    `SELECT COALESCE(bad_debt_writeoff_enabled, false) AS enabled
     FROM system_settings
     LIMIT 1`,
  );

  return result.rows[0]?.enabled ?? false;
}
