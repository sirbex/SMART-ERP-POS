/**
 * Shared predicate: ledger_transactions row is an active (non-reversed) posting.
 * Alias must be `lt`. Use in repost/repair queries to avoid creating duplicates.
 */
export const ACTIVE_GL_REFERENCE_PREDICATE = `
  lt."IsReversed" = FALSE
  AND lt."Status" = 'POSTED'
  AND lt."Id" NOT IN (
    SELECT "ReversedByTransactionId" FROM ledger_transactions
    WHERE "ReversedByTransactionId" IS NOT NULL
  )
`;

/** Same predicate without table alias — for top-level ledger_transactions filters. */
export const ACTIVE_GL_REFERENCE_PREDICATE_BARE = `
  "IsReversed" = FALSE
  AND "Status" = 'POSTED'
  AND "Id" NOT IN (
    SELECT "ReversedByTransactionId" FROM ledger_transactions
    WHERE "ReversedByTransactionId" IS NOT NULL
  )
`;
