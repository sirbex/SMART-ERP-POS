/**
 * Feature flag: vat_remittance_document_enabled (ADR-005 Phase 3A)
 * Defaults false — flag-off = existing tax reports / WHT remit unchanged.
 */

import type { Pool, PoolClient } from 'pg';
import { tableHasColumn } from '../../db/schemaColumnCache.js';

export type DbConn = Pool | PoolClient;

export async function isVatRemittanceDocumentEnabled(conn: DbConn): Promise<boolean> {
  const hasFlagColumn = await tableHasColumn(
    conn,
    'system_settings',
    'vat_remittance_document_enabled',
  );
  if (!hasFlagColumn) {
    return false;
  }

  const result = await conn.query<{ enabled: boolean }>(
    `SELECT COALESCE(vat_remittance_document_enabled, false) AS enabled
     FROM system_settings
     LIMIT 1`,
  );

  return result.rows[0]?.enabled ?? false;
}
