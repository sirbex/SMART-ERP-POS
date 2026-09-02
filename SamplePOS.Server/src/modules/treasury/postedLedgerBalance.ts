/**
 * Posted ledger balance — SSOT for spendable cash/bank/undeposited (Banking + funds guard).
 *
 * After AccountingCore.reverseTransaction:
 *   - original → Status=REVERSED
 *   - mirror reverse journal → Status=POSTED, Id stored as original.ReversedByTransactionId
 *
 * Liquidity must exclude **both** legs of every reverse pair (LEDGER_NET_ACTIVE_SQL).
 * That yields “as if the document never posted” — correct for bank AND Undeposited Funds.
 *
 * Do NOT use Status='POSTED' alone: it drops the original but keeps the reverse journal.
 * That orphans reverse credits on 1015 after AR receipt reverse → false overdraft
 * (Henber −5,030,642 = sum of REV-CRP test reversals).
 *
 * Do NOT use LEFT JOIN … AND Status='POSTED' in the ON clause: REVERSED originals can
 * still leak into SUM() (STELLA understatement incident).
 */
import { roundMoney } from '@shared/treasury/index.js';
import { LEDGER_NET_ACTIVE_SQL } from '../../utils/ledgerNetActive.js';

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
 * SQL fragment: LATERAL subquery summing net-active ledger entries for account alias `a`.
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
        AND ${LEDGER_NET_ACTIVE_SQL}
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
        AND ${LEDGER_NET_ACTIVE_SQL}
    ) bal ON TRUE`;
}
