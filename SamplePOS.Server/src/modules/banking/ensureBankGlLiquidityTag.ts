/**
 * Bank book GLs must be liquidity accounts (TD-INV-6 / TREASURY_DEPOSIT).
 * CoA "Create & use this GL" historically left SystemAccountTag null — stamp BANK.
 * Never allow AR / inventory / equity / undeposited as a bank book GL.
 */
import type { PoolClient } from 'pg';
import {
  isLiquidityAccountCode,
  isLiquidityAccountTag,
} from '@shared/treasury/index.js';
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

/** Tags that must never be linked as a Banking → Bank Account GL. */
export const BLOCKED_BANK_BOOK_TAGS = new Set([
  'ACCOUNTS_RECEIVABLE',
  'ACCOUNTS_PAYABLE',
  'INVENTORY',
  'COGS',
  'OPENING_BALANCE_EQUITY',
  'BAD_DEBT_EXPENSE',
  'UNDEPOSITED_FUNDS',
]);

/** Well-known CoA codes that are never valid bank-book GLs. */
export const BLOCKED_BANK_BOOK_CODES = new Set([
  '1000', // header
  '1015', // undeposited clearing — not a bank book
  '1200', // AR
  '1250', // tax receivable
  '1300', // inventory
  '1500', // fixed assets header
  '2100', // AP
  '2200', // customer deposits
  '3050', // opening balance equity
]);

export function isBlockedBankBookGl(code: string, tag: string | null | undefined): boolean {
  const c = String(code || '').trim();
  const t = tag ? String(tag).trim().toUpperCase() : '';
  if (BLOCKED_BANK_BOOK_CODES.has(c)) return true;
  if (t && BLOCKED_BANK_BOOK_TAGS.has(t)) return true;
  // AR / liability / equity / P&L ranges — not cash at bank
  if (/^12\d{2}/.test(c) || /^2\d{3}/.test(c) || /^3\d{3}/.test(c) || /^[4567]\d{3}/.test(c)) {
    return true;
  }
  return false;
}

export function isEligibleBankBookLiquidity(code: string, tag: string | null | undefined): boolean {
  if (isBlockedBankBookGl(code, tag)) return false;
  if (isLiquidityAccountTag(tag)) return true;
  if (isLiquidityAccountCode(code)) return true;
  // Extra bank GLs (1031, 1032, …) after BANK stamp
  if (String(tag || '').toUpperCase() === 'BANK') return true;
  return false;
}

type GlRow = {
  AccountCode: string;
  AccountName: string;
  AccountType: string;
  IsPostingAccount: boolean | null;
  SystemAccountTag: string | null;
};

async function loadGl(client: PoolClient, glAccountId: string): Promise<GlRow | null> {
  const result = await client.query<GlRow>(
    `
      SELECT "AccountCode", "AccountName", "AccountType", "IsPostingAccount", "SystemAccountTag"
      FROM accounts
      WHERE "Id" = $1 AND "IsActive" = TRUE
    `,
    [glAccountId],
  );
  return result.rows[0] ?? null;
}

/**
 * Stamp SystemAccountTag=BANK on an untagged posting Asset GL.
 * Idempotent. Safe to call on every bank create/update and before every deposit.
 * Multiple GLs may share BANK (migration 558 relaxed uidx for liquidity tags).
 */
export async function ensureBankGlLiquidityTag(
  client: PoolClient,
  glAccountId: string,
): Promise<{ stamped: boolean; accountCode: string | null }> {
  const row = await loadGl(client, glAccountId);
  if (!row) {
    return { stamped: false, accountCode: null };
  }
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

  // Never overwrite AR / inventory / etc.
  if (tag) {
    return { stamped: false, accountCode: row.AccountCode };
  }

  if (isBlockedBankBookGl(row.AccountCode, null)) {
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

/**
 * Validate + heal a GL before it may be linked as a Banking bank book.
 * Throws a user-facing Error if the GL cannot receive deposits/transfers (TD-INV-6).
 */
export async function assertBankBookGlEligible(
  client: PoolClient,
  glAccountId: string,
): Promise<{ accountCode: string; accountName: string; systemAccountTag: string }> {
  const row = await loadGl(client, glAccountId);
  if (!row) {
    throw new Error('GL account not found or inactive');
  }
  if (String(row.AccountType).toUpperCase() !== 'ASSET') {
    throw new Error(
      `GL Account "${row.AccountCode} - ${row.AccountName}" is ${row.AccountType}, not ASSET. ` +
        `Bank accounts must link to a Cash/Bank Asset (e.g. 1030, 1031).`,
    );
  }
  if (row.IsPostingAccount === false) {
    throw new Error(
      `GL Account "${row.AccountCode} - ${row.AccountName}" is a header account. Select a posting Asset account.`,
    );
  }

  const tagBefore = row.SystemAccountTag ? String(row.SystemAccountTag).trim().toUpperCase() : '';
  if (isBlockedBankBookGl(row.AccountCode, tagBefore || null)) {
    throw new Error(
      `GL Account "${row.AccountCode} - ${row.AccountName}" cannot be used as a bank book ` +
        `(not a liquidity account). Use Create & use this GL for a new bank Asset (1031+), ` +
        `or select Checking / Mobile Money / an existing BANK-tagged account — not AR (1200), inventory, or equity.`,
    );
  }

  await ensureBankGlLiquidityTag(client, glAccountId);

  const after = await loadGl(client, glAccountId);
  const tagAfter = after?.SystemAccountTag
    ? String(after.SystemAccountTag).trim().toUpperCase()
    : '';
  const code = after?.AccountCode || row.AccountCode;
  if (!isEligibleBankBookLiquidity(code, tagAfter || null)) {
    throw new Error(
      `GL Account "${code} - ${after?.AccountName || row.AccountName}" is not a liquidity account (TD-INV-6). ` +
        `Create a dedicated bank GL with Create & use this GL, then link it.`,
    );
  }

  return {
    accountCode: code,
    accountName: after?.AccountName || row.AccountName,
    systemAccountTag: tagAfter || 'BANK',
  };
}
