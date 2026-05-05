-- =============================================================================
-- Migration 016: Allow OPENING_BALANCE_WIZARD to post to AP (2100) and AR (1200)
-- =============================================================================
-- Purpose:
--   Supplier and customer opening-balance import features post a journal of
--     DR Opening Balance Equity (3050)
--     CR Accounts Payable (2100)        -- supplier opening balance
--   or
--     DR Accounts Receivable (1200)
--     CR Opening Balance Equity (3050)  -- customer opening balance (future)
--
--   Posting governance Rule B (source-allow-listing) blocks these because
--   2100/1200 were not migrated to accept OPENING_BALANCE_WIZARD as a source.
--   Account 3050 (OBE) already accepts only OPENING_BALANCE_WIZARD and
--   SYSTEM_CORRECTION, so the intersection had to be SYSTEM_CORRECTION — but
--   that's reserved for admin remediation, not for legitimate operator workflows.
--
-- This migration adds OPENING_BALANCE_WIZARD to the AllowedSources of both
-- AP and AR so the Opening Balance Wizard can post supplier/customer opening
-- balances through the normal governance-aware AccountingCore path.
--
-- Idempotent: array_append guarded with NOT EXISTS check.
-- =============================================================================

UPDATE accounts
SET
    "AllowedSources" = array_append("AllowedSources", 'OPENING_BALANCE_WIZARD'),
    "UpdatedAt"      = NOW()
WHERE "AccountCode" = '2100'
  AND NOT ('OPENING_BALANCE_WIZARD' = ANY("AllowedSources"));

UPDATE accounts
SET
    "AllowedSources" = array_append("AllowedSources", 'OPENING_BALANCE_WIZARD'),
    "UpdatedAt"      = NOW()
WHERE "AccountCode" = '1200'
  AND NOT ('OPENING_BALANCE_WIZARD' = ANY("AllowedSources"));

-- Verify
SELECT "AccountCode", "AccountName", "AllowedSources"
FROM accounts
WHERE "AccountCode" IN ('1200', '2100', '3050')
ORDER BY "AccountCode";
