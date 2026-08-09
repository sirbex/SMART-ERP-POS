import type { PoolClient } from 'pg';
import { AccountCodes } from '../../services/glEntryService.js';
import logger from '../../utils/logger.js';

/**
 * Ensure 2210 Store Credit / Exchange Liability exists (separate from 2200 customer advances).
 * Idempotent — safe before every exchange GL post.
 */
export async function ensureStoreCreditAccount(client: PoolClient): Promise<string> {
  const code = AccountCodes.STORE_CREDIT;
  const existing = await client.query<{ id: string }>(
    `SELECT "Id" AS id FROM accounts
     WHERE "AccountCode" = $1 AND "IsActive" = true
     LIMIT 1`,
    [code],
  );
  if (existing.rows.length > 0) return code;

  const parent = await client.query<{ parent_account_id: string | null }>(
    `SELECT "ParentAccountId" AS parent_account_id
     FROM accounts WHERE "AccountCode" = $1 LIMIT 1`,
    [AccountCodes.CUSTOMER_DEPOSITS],
  );

  await client.query(
    `INSERT INTO accounts (
        "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
        "IsActive", "ParentAccountId", "Description", "Level", "IsPostingAccount",
        "AllowAutomatedPosting", "CurrentBalance", "CreatedAt", "UpdatedAt"
     ) VALUES (
        gen_random_uuid(), $1, $2, 'LIABILITY', 'CREDIT',
        true, $3, $4, 1, true,
        true, 0, NOW(), NOW()
     )
     ON CONFLICT ("AccountCode") DO NOTHING`,
    [
      code,
      'Store Credit / Exchange Liability',
      parent.rows[0]?.parent_account_id ?? null,
      'Unapplied product-exchange / return store credit (not cash customer advances)',
    ],
  );

  logger.info('Ensured store credit GL account', { accountCode: code });
  return code;
}
