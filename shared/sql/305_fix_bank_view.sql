-- Fix the view with correct GL column names
CREATE OR REPLACE VIEW v_bank_account_balances AS
SELECT 
  ba.id,
  ba.account_code,
  ba.account_name as name,
  ba.bank_name,
  ba.account_number,
  ba.gl_account_id,
  a."AccountCode" as gl_code,
  a."AccountName" as gl_name,
  COALESCE((
    SELECT SUM(le."DebitAmount" - le."CreditAmount")
    FROM ledger_entries le
    WHERE le."AccountId" = ba.gl_account_id
  ), 0) as gl_balance,
  ba.current_balance,
  ba.opening_balance,
  ba.low_balance_threshold,
  ba.low_balance_alert_enabled,
  ba.is_default,
  ba.is_active
FROM bank_accounts ba
LEFT JOIN accounts a ON a."Id" = ba.gl_account_id
WHERE ba.is_active = true;

COMMENT ON VIEW v_bank_account_balances IS 'Bank accounts with calculated GL balances';
