/**
 * Feature flag: loss_quarantine_document_enabled (ADR-004 Phase 2A)
 * Defaults false — flag-off = no disposal-document requirement.
 */

import type { Pool, PoolClient } from 'pg';
import { tableHasColumn } from '../../db/schemaColumnCache.js';

export type DbConn = Pool | PoolClient;

export async function isLossQuarantineDocumentEnabled(conn: DbConn): Promise<boolean> {
  const hasFlagColumn = await tableHasColumn(
    conn,
    'system_settings',
    'loss_quarantine_document_enabled',
  );
  if (!hasFlagColumn) {
    return false;
  }

  const result = await conn.query<{ enabled: boolean }>(
    `SELECT COALESCE(loss_quarantine_document_enabled, false) AS enabled
     FROM system_settings
     LIMIT 1`,
  );

  return result.rows[0]?.enabled ?? false;
}
