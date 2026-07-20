/**
 * Bank book GLs must carry a liquidity SystemAccountTag so TREASURY_DEPOSIT
 * governance accepts Dr Bank / Cr 1015. CoA "Create & use this GL" historically
 * left SystemAccountTag null — heal that whenever a GL is linked or deposited to.
 */
import type { PoolClient } from 'pg';
import logger from '../../utils/logger.js';

/** Tags that already identify liquidity — never overwrite with BANK. */
export const RESERVED_LIQUIDITY_TAGS = new Set([
  'CASH',
  'BANK',
  'PETTY_CASH',
  'MOBILE_MONEY',
  'CARD_CLEARING',
  'UNDEPOSITED_FUNDS',
]);

/**
 * Stamp SystemAccountTag=BANK on an untagged posting Asset GL.
 * Idempotent. Safe to call on every bank create/update and before every deposit.
 */
export async function ensureBankGlLiquidityTag(
  client: PoolClient,
  glAccountId: string,
): Promise<{ stamped: boolean; accountCode: string | null }> {
  const result = await client.query<{
    AccountCode: string;
    AccountName: string;
    AccountType: string;
    IsPostingAccount: boolean | null;
    SystemAccountTag: string | null;
  }>(
    `
      SELECT "AccountCode", "AccountName", "AccountType", "IsPostingAccount", "SystemAccountTag"
      FROM accounts
      WHERE "Id" = $1 AND "IsActive" = TRUE
    `,
    [glAccountId],
  );
  if (result.rows.length === 0) {
    return { stamped: false, accountCode: null };
  }
  const row = result.rows[0];
  if (String(row.AccountType).toUpperCase() !== 'ASSET') {
    return { stamped: false, accountCode: row.AccountCode };
  }
  if (row.IsPostingAccount === false) {
    return { stamped: false, accountCode: row.AccountCode };
  }

  const tag = row.SystemAccountTag ? String(row.SystemAccountTag).trim().toUpperCase() : '';
  if (tag && RESERVED_LIQUIDITY_TAGS.has(tag)) {
    return { stamped: false, accountCode: row.AccountCode };
  }

  // Untagged, or tagged with a non-liquidity custom value that blocks deposits:
  // only overwrite empty tags (never steal AR/AP/etc.).
  if (tag) {
    return { stamped: false, accountCode: row.AccountCode };
  }

  await client.query(
    `
      UPDATE accounts
      SET "SystemAccountTag" = 'BANK',
          "UpdatedAt" = NOW()
      WHERE "Id" = $1
        AND ("SystemAccountTag" IS NULL OR TRIM("SystemAccountTag") = '')
    `,
    [glAccountId],
  );
  logger.info('Stamped BANK tag on bank-linked GL', {
    glAccountId,
    accountCode: row.AccountCode,
    accountName: row.AccountName,
  });
  return { stamped: true, accountCode: row.AccountCode };
}
