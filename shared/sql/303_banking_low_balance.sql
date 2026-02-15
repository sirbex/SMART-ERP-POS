-- ============================================================================
-- BANKING MODULE - LOW BALANCE THRESHOLD
-- Migration: 303_banking_low_balance.sql
-- Date: 2025-12-29
-- Description: Adds low balance threshold columns to bank_accounts table
-- ============================================================================

-- Add low balance threshold columns to bank_accounts
ALTER TABLE bank_accounts 
ADD COLUMN IF NOT EXISTS low_balance_threshold NUMERIC(18,2) DEFAULT NULL;

ALTER TABLE bank_accounts 
ADD COLUMN IF NOT EXISTS low_balance_alert_enabled BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN bank_accounts.low_balance_threshold IS 'Balance threshold below which alerts are triggered';
COMMENT ON COLUMN bank_accounts.low_balance_alert_enabled IS 'Whether low balance alerts are enabled for this account';

-- Create index for efficient low balance check
CREATE INDEX IF NOT EXISTS idx_bank_accounts_low_balance 
ON bank_accounts(id) 
WHERE low_balance_alert_enabled = TRUE AND low_balance_threshold IS NOT NULL;
