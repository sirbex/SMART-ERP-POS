/**
 * Feature flag: treasury.document.enabled (system_settings.treasury_document_enabled)
 * Defaults false — Phase 1A flag-off = no behavior change for legacy paths.
 */

import type { Pool, PoolClient } from 'pg';
import { tableHasColumn } from '../../db/schemaColumnCache.js';

export type DbConn = Pool | PoolClient;

export async function isTreasuryDocumentEnabled(conn: DbConn): Promise<boolean> {
  const hasFlagColumn = await tableHasColumn(conn, 'system_settings', 'treasury_document_enabled');
  if (!hasFlagColumn) {
    return false;
  }

  const result = await conn.query<{ enabled: boolean }>(
    `SELECT COALESCE(treasury_document_enabled, false) AS enabled
     FROM system_settings
     LIMIT 1`,
  );

  return result.rows[0]?.enabled ?? false;
}
