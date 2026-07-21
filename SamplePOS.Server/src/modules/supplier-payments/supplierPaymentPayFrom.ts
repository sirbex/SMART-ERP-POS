/**
 * Resolve which liquidity GL to credit for a supplier payment.
 * Odoo journal / SAP house bank / Tally cash-bank ledger equivalent:
 * pick a bank_accounts row (cash, bank, MoMo) → credit its GL.
 */
import type { PoolClient } from 'pg';
import { ValidationError, NotFoundError } from '../../middleware/errorHandler.js';
import { isEligibleBankBookLiquidity } from '../banking/ensureBankGlLiquidityTag.js';
import { AccountCodes } from '../../services/glEntryService.js';

const METHODS_REQUIRING_BANK_BOOK = new Set([
  'BANK_TRANSFER',
  'CHECK',
]);

export function paymentMethodRequiresBankBook(method: string): boolean {
  return METHODS_REQUIRING_BANK_BOOK.has(String(method || '').toUpperCase());
}

/** Infer payment method from bank book GL tag when UI only picks the book. */
export function paymentMethodFromLiquidityTag(
  tag: string | null | undefined,
  fallback = 'BANK_TRANSFER',
): string {
  const t = String(tag || '').toUpperCase();
  if (t === 'CASH' || t === 'PETTY_CASH') return 'CASH';
  if (t === 'MOBILE_MONEY') return 'MOBILE_MONEY';
  if (t === 'CARD_CLEARING') return 'CARD';
  if (t === 'BANK') return 'BANK_TRANSFER';
  return fallback;
}

export function defaultCreditAccountForMethod(method: string): string {
  switch (String(method || '').toUpperCase()) {
    case 'CASH':
      return AccountCodes.CASH;
    case 'BANK_TRANSFER':
    case 'CHECK':
    case 'CARD':
      return AccountCodes.CHECKING_ACCOUNT;
    case 'MOBILE_MONEY':
      return AccountCodes.MOBILE_MONEY;
    default:
      return AccountCodes.CASH;
  }
}

export type ResolvedPayFrom = {
  creditAccountCode: string;
  bankAccountId: string | null;
  bankAccountName: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  glAccountTag: string | null;
};

/**
 * When bankAccountId is set, credit that book's GL (must be liquidity).
 * When omitted: CASH may use 1010; bank/MoMo/card/check require a book if any exist.
 */
export async function resolveSupplierPaymentCreditAccount(
  client: PoolClient,
  opts: { paymentMethod: string; bankAccountId?: string | null },
): Promise<ResolvedPayFrom> {
  const method = String(opts.paymentMethod || '').toUpperCase();
  const bankAccountId = opts.bankAccountId?.trim() || null;

  if (bankAccountId) {
    const result = await client.query<{
      id: string;
      name: string;
      bank_name: string | null;
      account_number: string | null;
      gl_account_code: string;
      system_account_tag: string | null;
    }>(
      `SELECT ba.id, ba.name, ba.bank_name, ba.account_number,
              a."AccountCode" AS gl_account_code,
              a."SystemAccountTag" AS system_account_tag
       FROM bank_accounts ba
       JOIN accounts a ON a."Id" = ba.gl_account_id
       WHERE ba.id = $1 AND ba.is_active = TRUE`,
      [bankAccountId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundError('Bank account not found or inactive');
    }
    const row = result.rows[0];
    if (!isEligibleBankBookLiquidity(row.gl_account_code, row.system_account_tag)) {
      throw new ValidationError(
        `Cannot pay from "${row.name}" — GL ${row.gl_account_code} is not a Cash/Bank/Mobile Money account. ` +
          `Edit Banking → Accounts and link a liquidity GL (Create & use this GL).`,
      );
    }
    return {
      creditAccountCode: row.gl_account_code,
      bankAccountId: row.id,
      bankAccountName: row.name,
      bankName: row.bank_name,
      bankAccountNumber: row.account_number,
      glAccountTag: row.system_account_tag,
    };
  }

  if (paymentMethodRequiresBankBook(method)) {
    const count = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM bank_accounts WHERE is_active = TRUE`,
    );
    if (Number(count.rows[0]?.n || 0) > 0) {
      throw new ValidationError(
        `Select which bank account to pay from for ${method}.`,
      );
    }
  }

  return {
    creditAccountCode: defaultCreditAccountForMethod(method),
    bankAccountId: null,
    bankAccountName: null,
    bankName: null,
    bankAccountNumber: null,
    glAccountTag: null,
  };
}

/** Ensure column exists (idempotent) for tenants that have not run 556 yet. */
export async function ensureSupplierPaymentBankAccountColumn(client: PoolClient): Promise<void> {
  await client.query(`
    ALTER TABLE supplier_payments
      ADD COLUMN IF NOT EXISTS bank_account_id UUID NULL
  `);
}
