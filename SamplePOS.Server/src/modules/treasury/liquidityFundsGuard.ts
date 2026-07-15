/**
 * Liquidity funds guard — SSOT = posted ledger (same formula as AccountingCore.getAccountBalance).
 * Blocks treasury / banking cash outs when available funds < required amount.
 */

import type { Pool, PoolClient } from 'pg';
import { ValidationError } from '../../middleware/errorHandler.js';
import { roundMoney } from '@shared/treasury/index.js';

type DbConn = Pool | PoolClient;

const EPS = 0.0001;

export async function getLiquidityAvailable(
  conn: DbConn,
  accountCode: string,
  asOfDate?: string,
): Promise<{ available: number; accountName: string; normalBalance: string }> {
  const dateFilter = asOfDate ? `AND DATE(lt."TransactionDate") <= $2` : '';
  const params: string[] = [accountCode];
  if (asOfDate) params.push(asOfDate);

  const result = await conn.query<{
    AccountName: string;
    NormalBalance: string;
    debitTotal: string;
    creditTotal: string;
  }>(
    `
    SELECT
      a."AccountName",
      a."NormalBalance",
      COALESCE(SUM(le."DebitAmount"), 0)::text AS "debitTotal",
      COALESCE(SUM(le."CreditAmount"), 0)::text AS "creditTotal"
    FROM accounts a
    LEFT JOIN ledger_entries le ON a."Id" = le."AccountId"
    LEFT JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      AND lt."Status" = 'POSTED' ${dateFilter}
    WHERE a."AccountCode" = $1 AND a."IsActive" = true
    GROUP BY a."Id", a."AccountName", a."NormalBalance"
    `,
    params,
  );

  if (result.rows.length === 0) {
    throw new ValidationError(`Account ${accountCode} not found or inactive`);
  }

  const row = result.rows[0];
  const debit = Number(row.debitTotal);
  const credit = Number(row.creditTotal);
  const available =
    row.NormalBalance === 'DEBIT' ? roundMoney(debit - credit) : roundMoney(credit - debit);

  return {
    available,
    accountName: row.AccountName,
    normalBalance: row.NormalBalance,
  };
}

/**
 * Require that credit-side liquidity account has enough available funds.
 */
export async function assertSufficientLiquidityFunds(
  conn: DbConn,
  accountCode: string,
  amount: number,
  opts?: { asOfDate?: string; actionLabel?: string },
): Promise<void> {
  const need = roundMoney(amount);
  if (need <= 0) return;

  const { available, accountName } = await getLiquidityAvailable(
    conn,
    accountCode,
    opts?.asOfDate,
  );

  if (available + EPS < need) {
    const action = opts?.actionLabel || 'this movement';
    throw new ValidationError(
      `Insufficient funds in ${accountCode} (${accountName}) for ${action}. ` +
        `Available ${available.toFixed(2)}, required ${need.toFixed(2)}. ` +
        `Reduce the amount or fund the account first.`,
    );
  }
}
