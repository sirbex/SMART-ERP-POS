/**
 * Ensure Bad Debt Expense (5210) exists — idempotent (ADR-006 Phase 4A)
 */

import type { PoolClient } from 'pg';
import { AccountCodes } from '../../services/glEntryService.js';
import logger from '../../utils/logger.js';

/**
 * Ensures account 5210 exists before AR write-off posting (Phase 4B+).
 * Idempotent — mirrors shared/sql/550_bad_debt_foundation.sql.
 */
export async function ensureBadDebtExpenseAccount(client: PoolClient): Promise<string> {
  const code = AccountCodes.BAD_DEBT_EXPENSE;
  const existing = await client.query<{ id: string }>(
    `SELECT "Id" AS id FROM accounts
     WHERE "AccountCode" = $1 AND "IsActive" = true AND "IsPostingAccount" = true
     LIMIT 1`,
    [code],
  );
  if (existing.rows.length > 0) {
    return code;
  }

  await client.query(
    `INSERT INTO accounts (
      "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
      "IsPostingAccount", "IsActive", "Level", "CurrentBalance",
      "AllowManualPosting", "SystemAccountTag", "Description",
      "CreatedAt", "UpdatedAt"
    )
    SELECT
      gen_random_uuid(), $1, 'Bad Debt Expense', 'EXPENSE', 'DEBIT',
      true, true, 2, 0,
      false, 'BAD_DEBT_EXPENSE',
      'ADR-006: uncollectible customer receivables (direct write-off)',
      NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = $1)`,
    [code],
  );

  const again = await client.query<{ id: string }>(
    `SELECT "Id" AS id FROM accounts WHERE "AccountCode" = $1 LIMIT 1`,
    [code],
  );
  if (again.rows.length === 0) {
    throw new Error(`Failed to ensure Bad Debt Expense account ${code}`);
  }

  logger.info('Ensured Bad Debt Expense account', { accountCode: code });
  return code;
}
