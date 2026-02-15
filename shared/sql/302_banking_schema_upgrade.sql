-- ============================================================================
-- BANKING MODULE - SCHEMA UPGRADE
-- ============================================================================
-- Upgrades bank_accounts table to support GL-driven architecture
-- Links existing bank accounts to proper GL accounts
-- ============================================================================

-- Add the gl_account_id column if it doesn't exist
ALTER TABLE bank_accounts 
ADD COLUMN IF NOT EXISTS gl_account_id UUID REFERENCES accounts("Id");

ALTER TABLE bank_accounts
ADD COLUMN IF NOT EXISTS name VARCHAR(100);

-- Link existing bank accounts to their GL accounts
-- CASH-001 -> 1010 (Cash)
-- BNK-001  -> 1030 (Checking Account)  
-- PETTY-001 -> 1015 (Petty Cash) - new GL account

UPDATE bank_accounts 
SET gl_account_id = (SELECT "Id" FROM accounts WHERE "AccountCode" = '1010'),
    name = account_name
WHERE account_code = 'CASH-001' AND gl_account_id IS NULL;

UPDATE bank_accounts 
SET gl_account_id = (SELECT "Id" FROM accounts WHERE "AccountCode" = '1030'),
    name = account_name
WHERE account_code = 'BNK-001' AND gl_account_id IS NULL;

-- For Petty Cash, create a dedicated GL account (1015)
DO $$
DECLARE
    v_petty_cash_gl_id UUID;
    v_parent_id UUID;
BEGIN
    -- Check if 1015 already exists
    SELECT "Id" INTO v_petty_cash_gl_id FROM accounts WHERE "AccountCode" = '1015';
    
    IF v_petty_cash_gl_id IS NULL THEN
        -- Get parent (1000 - Current Assets)
        SELECT "Id" INTO v_parent_id FROM accounts WHERE "AccountCode" = '1000';
        
        -- Create Petty Cash GL account with all required fields
        v_petty_cash_gl_id := gen_random_uuid();
        INSERT INTO accounts (
            "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", 
            "ParentAccountId", "Level", "IsPostingAccount", "IsActive", "CurrentBalance"
        )
        VALUES (
            v_petty_cash_gl_id,
            '1015',
            'Petty Cash',
            'ASSET',
            'DEBIT',
            v_parent_id,
            2,
            TRUE,
            TRUE,
            0  -- CurrentBalance starts at 0, will be derived from ledger
        );
        RAISE NOTICE 'Created GL account 1015 - Petty Cash';
    END IF;
    
    -- Link PETTY-001 to 1015
    UPDATE bank_accounts 
    SET gl_account_id = v_petty_cash_gl_id,
        name = account_name
    WHERE account_code = 'PETTY-001' AND gl_account_id IS NULL;
END $$;

-- Make gl_account_id required for future rows
ALTER TABLE bank_accounts
ALTER COLUMN gl_account_id SET NOT NULL;

-- Create index for GL account lookup
CREATE INDEX IF NOT EXISTS idx_bank_accounts_gl 
    ON bank_accounts(gl_account_id);

-- Comment explaining the GL-driven architecture
COMMENT ON COLUMN bank_accounts.gl_account_id IS 
  'Links this bank account to its GL account. Balance is derived from ledger_entries.';

COMMENT ON COLUMN bank_accounts.current_balance IS 
  'DEPRECATED: Use v_bank_account_balances view for GL-derived balance.';

-- Create view for GL-derived balances
-- Note: ledger_entries has no Status column, so we use all entries
DROP VIEW IF EXISTS v_bank_account_balances;
CREATE VIEW v_bank_account_balances AS
SELECT 
    ba.id,
    ba.account_code,
    ba.name,
    ba.gl_account_id,
    a."AccountCode" as gl_code,
    a."AccountName" as gl_name,
    COALESCE(
        (SELECT SUM(le."DebitAmount" - le."CreditAmount")
         FROM ledger_entries le
         WHERE le."AccountId" = ba.gl_account_id),
        0
    ) as gl_balance,
    ba.current_balance as legacy_balance
FROM bank_accounts ba
JOIN accounts a ON a."Id" = ba.gl_account_id;

-- Verify migration
SELECT 
    ba.id,
    ba.account_code,
    ba.name,
    ba.gl_account_id,
    a."AccountCode" as gl_code,
    a."AccountName" as gl_name
FROM bank_accounts ba
LEFT JOIN accounts a ON a."Id" = ba.gl_account_id;
