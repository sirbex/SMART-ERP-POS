-- ============================================================================
-- BANKING MODULE: Add missing columns to bank_accounts
-- Migration: 304_bank_accounts_gl_link.sql
-- ============================================================================

-- Add GL account link if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bank_accounts' AND column_name = 'gl_account_id'
  ) THEN
    ALTER TABLE bank_accounts ADD COLUMN gl_account_id UUID REFERENCES accounts("Id");
    COMMENT ON COLUMN bank_accounts.gl_account_id IS 'FK to GL account for double-entry integration';
  END IF;
END $$;

-- Add is_default column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bank_accounts' AND column_name = 'is_default'
  ) THEN
    ALTER TABLE bank_accounts ADD COLUMN is_default BOOLEAN DEFAULT false;
    COMMENT ON COLUMN bank_accounts.is_default IS 'Default account for deposits/payments';
  END IF;
END $$;

-- Add low_balance_threshold column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bank_accounts' AND column_name = 'low_balance_threshold'
  ) THEN
    ALTER TABLE bank_accounts ADD COLUMN low_balance_threshold NUMERIC(18,2) DEFAULT 0;
    COMMENT ON COLUMN bank_accounts.low_balance_threshold IS 'Threshold for low balance alerts';
  END IF;
END $$;

-- Add low_balance_alert_enabled column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bank_accounts' AND column_name = 'low_balance_alert_enabled'
  ) THEN
    ALTER TABLE bank_accounts ADD COLUMN low_balance_alert_enabled BOOLEAN DEFAULT false;
    COMMENT ON COLUMN bank_accounts.low_balance_alert_enabled IS 'Whether low balance alerts are enabled';
  END IF;
END $$;

-- Add branch column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bank_accounts' AND column_name = 'branch'
  ) THEN
    ALTER TABLE bank_accounts ADD COLUMN branch VARCHAR(100);
    COMMENT ON COLUMN bank_accounts.branch IS 'Bank branch name/code';
  END IF;
END $$;

-- Add notes column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bank_accounts' AND column_name = 'notes'
  ) THEN
    ALTER TABLE bank_accounts ADD COLUMN notes TEXT;
    COMMENT ON COLUMN bank_accounts.notes IS 'Additional notes about the account';
  END IF;
END $$;

-- Add created/updated timestamps if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bank_accounts' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE bank_accounts ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE bank_accounts ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Create index on gl_account_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_bank_accounts_gl_account 
ON bank_accounts(gl_account_id) WHERE gl_account_id IS NOT NULL;

-- Create index on is_default for finding the default account quickly
CREATE INDEX IF NOT EXISTS idx_bank_accounts_default
ON bank_accounts(is_default) WHERE is_default = true;

-- ============================================================================
-- Also ensure bank_patterns table exists with correct structure
-- ============================================================================
CREATE TABLE IF NOT EXISTS bank_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description_pattern VARCHAR(500) NOT NULL,
  pattern_type VARCHAR(20) DEFAULT 'CONTAINS' CHECK (pattern_type IN ('CONTAINS', 'REGEX', 'EXACT')),
  category_id UUID REFERENCES bank_categories(id),
  category_name VARCHAR(100),
  account_id UUID REFERENCES bank_accounts(id),
  priority INTEGER DEFAULT 0,
  transaction_type VARCHAR(10) CHECK (transaction_type IN ('CREDIT', 'DEBIT')),
  confidence NUMERIC(3,2) DEFAULT 0.50,
  match_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_patterns_category ON bank_patterns(category_id);
CREATE INDEX IF NOT EXISTS idx_bank_patterns_active ON bank_patterns(is_active) WHERE is_active = true;

-- ============================================================================
-- Create view for bank account balances from GL
-- ============================================================================
CREATE OR REPLACE VIEW v_bank_account_balances AS
SELECT 
  ba.id,
  ba.account_code,
  ba.account_name as name,
  ba.bank_name,
  ba.account_number,
  ba.gl_account_id,
  a."Code" as gl_code,
  a."Name" as gl_name,
  COALESCE((
    SELECT SUM(le."Debit" - le."Credit")
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
