/**
 * Ensure Petty Cash (1012) exists — idempotent (Phase 1D)
 */

import type { Pool, PoolClient } from 'pg';

export type DbConn = Pool | PoolClient;

export async function ensurePettyCashAccount(conn: DbConn): Promise<string> {
  const existing = await conn.query<{ Id: string }>(
    `SELECT "Id" FROM accounts WHERE "AccountCode" = '1012' LIMIT 1`,
  );
  if (existing.rows[0]?.Id) {
    await conn.query(
      `UPDATE accounts
       SET "AccountName" = 'Petty Cash',
           "SystemAccountTag" = 'PETTY_CASH',
           "AllowManualPosting" = false,
           "IsActive" = true,
           "UpdatedAt" = NOW()
       WHERE "AccountCode" = '1012'`,
    );
    return existing.rows[0].Id;
  }

  const inserted = await conn.query<{ Id: string }>(
    `INSERT INTO accounts (
       "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
       "IsPostingAccount", "IsActive", "Level", "CurrentBalance",
       "AllowManualPosting", "SystemAccountTag", "CreatedAt", "UpdatedAt"
     ) VALUES (
       gen_random_uuid(), '1012', 'Petty Cash', 'ASSET', 'DEBIT',
       true, true, 2, 0, false, 'PETTY_CASH', NOW(), NOW()
     )
     RETURNING "Id"`,
  );
  return inserted.rows[0].Id;
}
