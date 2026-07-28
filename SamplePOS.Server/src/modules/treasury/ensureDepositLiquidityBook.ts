/**
 * Ensure Banking books for Cash (1010) and Mobile Money (1040) so Deposit Worksheet
 * can clear Undeposited Funds into those GLs without manual Banking → Accounts setup.
 */

import { randomUUID } from 'crypto';
import type { Pool, PoolClient } from 'pg';
import { NotFoundError } from '../../middleware/errorHandler.js';

export type DepositLiquidityKind = 'CASH' | 'MOBILE_MONEY';

export type DbConn = Pool | PoolClient;

const SPECS: Record<
  DepositLiquidityKind,
  {
    glCode: string;
    glName: string;
    systemTag: 'CASH' | 'MOBILE_MONEY';
    bookName: string;
    legacyPrefix: string;
    isMainCash: boolean;
  }
> = {
  CASH: {
    glCode: '1010',
    glName: 'Cash Drawer',
    systemTag: 'CASH',
    bookName: 'Cash Drawer',
    legacyPrefix: 'CASH',
    isMainCash: true,
  },
  MOBILE_MONEY: {
    glCode: '1040',
    glName: 'Mobile Money',
    systemTag: 'MOBILE_MONEY',
    bookName: 'Mobile Money',
    legacyPrefix: 'MOMO',
    isMainCash: false,
  },
};

async function ensureGlAccount(conn: DbConn, kind: DepositLiquidityKind): Promise<string> {
  const spec = SPECS[kind];
  const existing = await conn.query<{ Id: string }>(
    `SELECT "Id" FROM accounts WHERE "AccountCode" = $1 LIMIT 1`,
    [spec.glCode],
  );
  if (existing.rows[0]?.Id) {
    await conn.query(
      `UPDATE accounts
       SET "AccountName" = COALESCE(NULLIF(TRIM("AccountName"), ''), $2),
           "SystemAccountTag" = $3,
           "IsPostingAccount" = TRUE,
           "IsActive" = TRUE,
           "UpdatedAt" = NOW()
       WHERE "AccountCode" = $1`,
      [spec.glCode, spec.glName, spec.systemTag],
    );
    return existing.rows[0].Id;
  }

  const inserted = await conn.query<{ Id: string }>(
    `INSERT INTO accounts (
       "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
       "IsPostingAccount", "IsActive", "Level", "CurrentBalance",
       "AllowManualPosting", "SystemAccountTag", "CreatedAt", "UpdatedAt"
     ) VALUES (
       gen_random_uuid(), $1, $2, 'ASSET', 'DEBIT',
       true, true, 2, 0, true, $3, NOW(), NOW()
     )
     RETURNING "Id"`,
    [spec.glCode, spec.glName, spec.systemTag],
  );
  if (!inserted.rows[0]?.Id) {
    throw new NotFoundError(`Failed to create ${spec.glName} GL (${spec.glCode})`);
  }
  return inserted.rows[0].Id;
}

/**
 * Find or create the bank_accounts book linked to Cash (1010) or Mobile Money (1040).
 * Idempotent. Reactivates an inactive book on the same GL when present.
 */
export async function ensureDepositLiquidityBook(
  conn: DbConn,
  kind: DepositLiquidityKind,
): Promise<{
  bankAccountId: string;
  glAccountId: string;
  glAccountCode: string;
  glAccountName: string;
  name: string;
  kind: DepositLiquidityKind;
}> {
  const spec = SPECS[kind];
  const glAccountId = await ensureGlAccount(conn, kind);

  const existing = await conn.query<{
    id: string;
    name: string;
    is_active: boolean;
  }>(
    `SELECT id, name, is_active
     FROM bank_accounts
     WHERE gl_account_id = $1
     ORDER BY is_active DESC, is_default DESC, created_at ASC NULLS LAST
     LIMIT 1`,
    [glAccountId],
  );

  if (existing.rows[0]) {
    const row = existing.rows[0];
    if (!row.is_active) {
      await conn.query(
        `UPDATE bank_accounts
         SET is_active = TRUE,
             name = CASE WHEN NULLIF(TRIM(name), '') IS NULL THEN $2 ELSE name END,
             is_main_cash = CASE WHEN $3 THEN TRUE ELSE is_main_cash END,
             updated_at = NOW()
         WHERE id = $1`,
        [row.id, spec.bookName, spec.isMainCash],
      );
    }
    return {
      bankAccountId: row.id,
      glAccountId,
      glAccountCode: spec.glCode,
      glAccountName: spec.glName,
      name: row.name || spec.bookName,
      kind,
    };
  }

  const id = randomUUID();
  const legacyCode = `${spec.legacyPrefix}-${spec.glCode}`;
  await conn.query(
    `INSERT INTO bank_accounts (
       id, name, account_number, bank_name, branch,
       gl_account_id, current_balance, is_default, is_active,
       created_at, updated_at,
       account_code, account_name, account_type, currency_code,
       opening_balance, is_main_cash, is_main_bank
     ) VALUES (
       $1, $2, NULL, $3, NULL,
       $4, 0, FALSE, TRUE,
       NOW(), NOW(),
       $5, $2, 'BANK', 'UGX',
       0, $6, FALSE
     )`,
    [id, spec.bookName, spec.glName, glAccountId, legacyCode, spec.isMainCash],
  );

  return {
    bankAccountId: id,
    glAccountId,
    glAccountCode: spec.glCode,
    glAccountName: spec.glName,
    name: spec.bookName,
    kind,
  };
}

export function depositLiquidityGlCode(kind: DepositLiquidityKind): string {
  return SPECS[kind].glCode;
}
