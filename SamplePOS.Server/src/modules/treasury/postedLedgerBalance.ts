/**
 * Posted ledger balance — SSOT for spendable cash/bank (matches Banking UI).
 *
 * Use INNER JOIN on POSTED transactions only. Never use:
 *   LEFT JOIN ledger_transactions lt ON ... AND lt."Status" = 'POSTED'
 * because REVERSED originals still contribute their ledger_entries to SUM().
 *
 * Do NOT use LEDGER_NET_ACTIVE_SQL for liquidity/funds checks: it excludes POSTED
 * reversal debits that restore bank balance after a supplier payment reverse, which
 * understates spendable funds (e.g. 118,000 vs 1,071,000 on GL 1030).
 */
import { roundMoney } from '@shared/treasury/index.js';

/** Compute signed available balance from debit/credit totals. */
export function availableFromPostedTotals(
  debitTotal: number,
  creditTotal: number,
  normalBalance: string,
): number {
  return normalBalance === 'DEBIT'
    ? roundMoney(debitTotal - creditTotal)
    : roundMoney(creditTotal - debitTotal);
}

/**
 * SQL fragment: LATERAL subquery summing POSTED ledger entries for account alias `a`.
 * Optional asOfDate adds param $N — pass placeholder like `$2` when embedding.
 */
export function postedLedgerBalanceLateral(dateParamRef?: string): string {
  const dateFilter = dateParamRef
    ? `AND DATE(lt."TransactionDate") <= ${dateParamRef}`
    : '';
  return `
    LEFT JOIN LATERAL (
      SELECT
        SUM(le."DebitAmount") AS debit_total,
        SUM(le."CreditAmount") AS credit_total
      FROM ledger_entries le
      INNER JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      WHERE le."AccountId" = a."Id"
        AND lt."Status" = 'POSTED'
        ${dateFilter}
    ) bal ON TRUE`;
}

/** Multi-account variant for liquidity account lists (no date filter). */
export function postedLedgerBalanceSelect(): string {
  return `
    COALESCE(bal.debit_total, 0)::text AS "debitTotal",
    COALESCE(bal.credit_total, 0)::text AS "creditTotal"`;
}

export function postedLedgerBalanceLateralForList(): string {
  return `
    LEFT JOIN LATERAL (
      SELECT
        SUM(le."DebitAmount") AS debit_total,
        SUM(le."CreditAmount") AS credit_total
      FROM ledger_entries le
      INNER JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      WHERE le."AccountId" = a."Id"
        AND lt."Status" = 'POSTED'
    ) bal ON TRUE`;
}
