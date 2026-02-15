-- ============================================================================
-- BANKING MODULE - GL-DRIVEN BALANCE FIX
-- ============================================================================
-- This migration removes the denormalized balance trigger.
-- Bank account balances are now ALWAYS derived from the General Ledger.
--
-- PRINCIPLE: Single Source of Truth
-- - Balance is calculated from ledger_entries, not stored in bank_accounts
-- - This prevents balance drift and ensures GL accuracy
-- ============================================================================

-- Drop the balance update trigger (balance now comes from GL)
DROP TRIGGER IF EXISTS trg_bank_txn_balance ON bank_transactions;

-- The column current_balance remains for backwards compatibility
-- but is no longer maintained - balance is derived from GL at query time
COMMENT ON COLUMN bank_accounts.current_balance IS 
  'DEPRECATED: Balance is now derived from GL via ledger_entries. This column is kept for backwards compatibility but is not maintained.';

-- Update the main table comment
COMMENT ON TABLE bank_accounts IS 
  'Physical bank accounts linked to GL accounts. Balance is derived from General Ledger (not stored here).';

-- Create a view for bank account balances from GL (for reporting)
-- Uses columns that exist in current schema: account_code, account_name, bank_name
DROP VIEW IF EXISTS v_bank_account_balances;
CREATE VIEW v_bank_account_balances AS
SELECT 
    ba.id,
    ba.account_code,
    COALESCE(ba.name, ba.account_name) as name,
    ba.account_number,
    ba.bank_name,
    ba.gl_account_id,
    a."AccountCode" as gl_code,
    a."AccountName" as gl_name,
    -- Balance from GL: For ASSET accounts, DEBIT increases, CREDIT decreases
    COALESCE((
        SELECT SUM(le."DebitAmount") - SUM(le."CreditAmount")
        FROM ledger_entries le
        JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
        WHERE le."AccountId" = ba.gl_account_id
          AND lt."Status" = 'POSTED'
    ), 0) as gl_balance,
    ba.current_balance as legacy_balance,
    ba.is_default,
    ba.is_active
FROM bank_accounts ba
JOIN accounts a ON a."Id" = ba.gl_account_id;

COMMENT ON VIEW v_bank_account_balances IS 
  'Bank accounts with balances derived from General Ledger. Single source of truth for bank balances.';
