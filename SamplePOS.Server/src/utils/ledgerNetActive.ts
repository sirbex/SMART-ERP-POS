/**
 * Net-active ledger filter — excludes both sides of every reversal pair so GL
 * balances match operational subledgers (customers, suppliers, integrity checks).
 *
 * Use on ledger_transactions alias `lt` inside JOIN / WHERE clauses.
 */
export const LEDGER_NET_ACTIVE_SQL = `
  lt."Status" = 'POSTED'
  AND lt."IsReversed" = FALSE
  AND lt."Id" NOT IN (
    SELECT "ReversedByTransactionId"
    FROM ledger_transactions
    WHERE "ReversedByTransactionId" IS NOT NULL
  )
`;
