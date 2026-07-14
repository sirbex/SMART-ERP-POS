import type { PoolClient } from 'pg';
import { AccountCodes } from '../../services/glEntryService.js';
import logger from '../../utils/logger.js';

type WhtAccountSpec = {
  code: string;
  name: string;
  accountType: 'ASSET' | 'LIABILITY';
  normalBalance: 'DEBIT' | 'CREDIT';
  description: string;
  /** Prefer parenting under this existing account when present. */
  parentHintCode: string;
};

const WHT_ACCOUNTS: WhtAccountSpec[] = [
  {
    code: AccountCodes.WHT_RECEIVABLE,
    name: 'Tax Receivable',
    accountType: 'ASSET',
    normalBalance: 'DEBIT',
    description:
      'Withholding tax withheld by customers; recoverable from the tax authority (URA)',
    parentHintCode: AccountCodes.ACCOUNTS_RECEIVABLE,
  },
  {
    code: AccountCodes.WHT_PAYABLE,
    name: 'Withholding Tax Payable',
    accountType: 'LIABILITY',
    normalBalance: 'CREDIT',
    description: 'Withholding tax deducted from supplier payments; remittable to URA',
    parentHintCode: AccountCodes.ACCOUNTS_PAYABLE,
  },
];

/**
 * Ensures WHT GL accounts exist before payment posting.
 * Idempotent — mirrors shared/sql seeds for 1250 / 2350.
 */
export async function ensureWhtAccounts(client: PoolClient): Promise<void> {
  for (const spec of WHT_ACCOUNTS) {
    await ensureOne(client, spec);
  }
}

/** Ensure only Tax Receivable (1250) — used on customer WHT payment path. */
export async function ensureWhtReceivableAccount(client: PoolClient): Promise<void> {
  await ensureOne(client, WHT_ACCOUNTS[0]!);
}

/** Ensure only WHT Payable (2350) — used on supplier WHT payment path. */
export async function ensureWhtPayableAccount(client: PoolClient): Promise<void> {
  await ensureOne(client, WHT_ACCOUNTS[1]!);
}

/**
 * Ensure default WHT accounts when using 1250/2350, otherwise require the
 * configured account_code to already exist as an active posting account.
 */
export async function ensureWhtGlAccountForCode(
  client: PoolClient,
  accountCode: string,
  side: 'SUPPLIER' | 'CUSTOMER',
): Promise<string> {
  const code = accountCode.trim();
  if (code === AccountCodes.WHT_RECEIVABLE) {
    await ensureWhtReceivableAccount(client);
    return code;
  }
  if (code === AccountCodes.WHT_PAYABLE) {
    await ensureWhtPayableAccount(client);
    return code;
  }

  const existing = await client.query<{ id: string }>(
    `SELECT "Id" AS id FROM accounts
     WHERE "AccountCode" = $1 AND "IsActive" = true AND "IsPostingAccount" = true
     LIMIT 1`,
    [code],
  );
  if (existing.rows.length === 0) {
    throw new Error(
      `WHT ${side} account "${code}" is not an active posting account — create it or update the WHT type`,
    );
  }
  return code;
}

async function ensureOne(client: PoolClient, spec: WhtAccountSpec): Promise<void> {
  const existing = await client.query<{ id: string }>(
    `SELECT "Id" AS id FROM accounts
     WHERE "AccountCode" = $1 AND "IsActive" = true
     LIMIT 1`,
    [spec.code],
  );
  if (existing.rows.length > 0) return;

  const parent = await client.query<{ parent_account_id: string | null }>(
    `SELECT "ParentAccountId" AS parent_account_id
     FROM accounts WHERE "AccountCode" = $1 LIMIT 1`,
    [spec.parentHintCode],
  );

  await client.query(
    `INSERT INTO accounts (
        "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
        "IsActive", "ParentAccountId", "Description", "Level", "IsPostingAccount",
        "AllowAutomatedPosting", "CurrentBalance", "CreatedAt", "UpdatedAt"
     ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4,
        true, $5, $6, 1, true,
        true, 0, NOW(), NOW()
     )
     ON CONFLICT ("AccountCode") DO NOTHING`,
    [
      spec.code,
      spec.name,
      spec.accountType,
      spec.normalBalance,
      parent.rows[0]?.parent_account_id ?? null,
      spec.description,
    ],
  );

  logger.info(`Provisioned ${spec.name} account ${spec.code} for WHT posting`);
}
