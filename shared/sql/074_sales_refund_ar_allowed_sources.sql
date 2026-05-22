-- Migration 074: Allow SALES_REFUND on AR (1200) for customer credit notes
--
-- Customer credit notes post: DR 4010 / CR 1200 with source SALES_REFUND.
-- Migration 008_sale_refund_gl.sql lived under SamplePOS.Server/db/migrations only
-- and was never applied via shared/sql tenant migrate — henber AR still blocks refunds.
--
-- Idempotent: safe on all tenant DBs.

-- Accounts Receivable — credit back customer on refund / credit note
UPDATE accounts
SET "AllowedSources" = array_append("AllowedSources", 'SALES_REFUND'),
    "UpdatedAt" = NOW()
WHERE "AccountCode" = '1200'
  AND "IsActive" = TRUE
  AND NOT ('SALES_REFUND' = ANY("AllowedSources"));

-- Sales Returns (4010) — debit on customer credit note (if governance list is non-empty)
UPDATE accounts
SET "AllowedSources" = array_append("AllowedSources", 'SALES_REFUND'),
    "UpdatedAt" = NOW()
WHERE "AccountCode" = '4010'
  AND "IsActive" = TRUE
  AND COALESCE(array_length("AllowedSources", 1), 0) > 0
  AND NOT ('SALES_REFUND' = ANY("AllowedSources"));

-- Tax Payable (2300) — output VAT reversal on credit notes (when restricted)
UPDATE accounts
SET "AllowedSources" = array_append("AllowedSources", 'SALES_REFUND'),
    "UpdatedAt" = NOW()
WHERE "AccountCode" = '2300'
  AND "IsActive" = TRUE
  AND COALESCE(array_length("AllowedSources", 1), 0) > 0
  AND NOT ('SALES_REFUND' = ANY("AllowedSources"));
