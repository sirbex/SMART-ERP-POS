/**
 * Liquidity funds guard — SSOT = net-active posted ledger (same as Banking / Move Money).
 * See postedLedgerBalance.ts — reverse pairs must not orphan a single leg.
 */
import type { Pool, PoolClient } from 'pg';
import { ValidationError } from '../../middleware/errorHandler.js';
import { roundMoney } from '@shared/treasury/index.js';
import {
  availableFromPostedTotals,
  postedLedgerBalanceLateral,
} from './postedLedgerBalance.js';

type DbConn = Pool | PoolClient;

const EPS = 0.0001;

export async function getLiquidityAvailable(
  conn: DbConn,
  accountCode: string,
  asOfDate?: string,
): Promise<{ available: number; accountName: string; normalBalance: string }> {
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
      COALESCE(bal.debit_total, 0)::text AS "debitTotal",
      COALESCE(bal.credit_total, 0)::text AS "creditTotal"
    FROM accounts a
    ${postedLedgerBalanceLateral(asOfDate ? '$2' : undefined)}
    WHERE a."AccountCode" = $1 AND a."IsActive" = true
    `,
    params,
  );

  if (result.rows.length === 0) {
    throw new ValidationError(`Account ${accountCode} not found or inactive`);
  }

  const row = result.rows[0];
  const available = availableFromPostedTotals(
    Number(row.debitTotal),
    Number(row.creditTotal),
    row.NormalBalance,
  );

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
    const action = opts?.actionLabel || 'this payment';
    const isCashDrawer =
      accountCode === '1010' ||
      /cash drawer|petty cash/i.test(accountName);
    const payFromHint = isCashDrawer
      ? ' This payment uses the till/cash account — to pay from a bank account, choose Bank Transfer and select Pay from account.'
      : '';
    throw new ValidationError(
      `Not enough money in ${accountName} (${accountCode}). ` +
        `Available ${available.toFixed(2)}, but ${action} needs ${need.toFixed(2)}. ` +
        `Reduce the amount or add funds to the account first.${payFromHint}`,
    );
  }
}
