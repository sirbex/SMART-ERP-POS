-- =============================================================================
-- Migration 016: Session Table + GL Governance Fixes
-- =============================================================================
-- Fixes two production errors:
--
-- 1. user_sessions missing session_token and expires_at columns
--    sessionService.ts inserts/queries both columns but the production table
--    only has the POS-session-log columns (user_name, user_role, login_at, etc.)
--
-- 2. GOV_RULE_B_SOURCE_NOT_ALLOWED: Cash (1010), Credit Card (1020), and
--    Mobile Money (1040) accounts have AllowedSources that exclude
--    SALES_INVOICE. When a POS cash/card/mobile sale posts to the payment
--    account with source=SALES_INVOICE, governance blocks it.
--    Fix: add SALES_INVOICE (and PAYMENT_RECEIPT for consistency) to all
--    payment account AllowedSources.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Add missing columns to user_sessions (used by sessionService.ts)
-- ---------------------------------------------------------------------------
ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS session_token VARCHAR(255) UNIQUE,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Index for session lookup by token
CREATE INDEX IF NOT EXISTS idx_user_sessions_token
  ON user_sessions (session_token)
  WHERE session_token IS NOT NULL;

-- Index for cleanup queries (DELETE WHERE expires_at < NOW())
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires
  ON user_sessions (expires_at)
  WHERE expires_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Relax AllowedSources on payment accounts to allow SALES_INVOICE
--    POS cash/card/mobile sales use source=SALES_INVOICE when debiting the
--    payment account. Migration 004 set these accounts too restrictively.
-- ---------------------------------------------------------------------------

-- 1010 Cash — add SALES_INVOICE and PAYMENT_RECEIPT
UPDATE accounts SET
  "AllowedSources" = ARRAY['SALES_INVOICE', 'PAYMENT_RECEIPT', 'PAYMENT_DEPOSIT', 'SYSTEM_CORRECTION']
WHERE "AccountCode" = '1010' AND "IsActive" = TRUE;

-- 1020 Credit Card Receipts — add SALES_INVOICE
UPDATE accounts SET
  "AllowedSources" = ARRAY['SALES_INVOICE', 'PAYMENT_RECEIPT', 'PAYMENT_DEPOSIT', 'SYSTEM_CORRECTION']
WHERE "AccountCode" = '1020' AND "IsActive" = TRUE;

-- 1030 Checking Account (bank) — add SALES_INVOICE for direct deposit scenarios
UPDATE accounts SET
  "AllowedSources" = ARRAY['SALES_INVOICE', 'PAYMENT_RECEIPT', 'PAYMENT_DEPOSIT', 'SYSTEM_CORRECTION']
WHERE "AccountCode" = '1030' AND "IsActive" = TRUE;

-- 1040 Mobile Money — add SALES_INVOICE
UPDATE accounts SET
  "AllowedSources" = ARRAY['SALES_INVOICE', 'PAYMENT_RECEIPT', 'PAYMENT_DEPOSIT', 'SYSTEM_CORRECTION']
WHERE "AccountCode" = '1040' AND "IsActive" = TRUE;

-- ---------------------------------------------------------------------------
-- 3. Record migration
-- ---------------------------------------------------------------------------
INSERT INTO schema_version (version, applied_at)
SELECT 16, NOW()
WHERE NOT EXISTS (SELECT 1 FROM schema_version WHERE version = 16);

COMMIT;
