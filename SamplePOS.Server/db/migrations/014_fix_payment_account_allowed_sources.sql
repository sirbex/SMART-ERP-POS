-- ============================================================
-- Migration 014: Fix AllowedSources for Payment Accounts
--
-- Problem: Account 1040 (Mobile Money) and 1030 (Bank Account) had
-- AllowedSources that excluded SALES_INVOICE. When a POS mobile money
-- or bank transfer sale posts to these accounts with source=SALES_INVOICE,
-- governance rule GOV_RULE_B_SOURCE_NOT_ALLOWED blocked it.
--
-- Root cause: Migrations 007 (SUPPLIER_PAYMENT) and 008 (SALES_REFUND)
-- used array_append on an initially-empty AllowedSources, building only
-- [SUPPLIER_PAYMENT, SALES_REFUND] for 1040. SALES_INVOICE was never added.
--
-- Fix: For any payment account (1030, 1040) that already has a non-empty
-- AllowedSources, append the missing sources. Uses conditional append so
-- it is idempotent (safe to run multiple times).
--
-- Must be applied to ALL tenant databases.
-- ============================================================

BEGIN;

-- Add SALES_INVOICE (required for POS cash/mobile/card sales to debit these accounts)
UPDATE accounts
SET
    "AllowedSources" = array_append("AllowedSources", 'SALES_INVOICE'),
    "UpdatedAt"      = NOW()
WHERE "AccountCode" IN ('1030', '1040')
  AND "AllowedSources" != '{}'
  AND NOT ('SALES_INVOICE' = ANY("AllowedSources"))
  AND "IsActive" = TRUE;

-- Add PAYMENT_RECEIPT (payment deposits to these accounts)
UPDATE accounts
SET
    "AllowedSources" = array_append("AllowedSources", 'PAYMENT_RECEIPT'),
    "UpdatedAt"      = NOW()
WHERE "AccountCode" IN ('1030', '1040')
  AND "AllowedSources" != '{}'
  AND NOT ('PAYMENT_RECEIPT' = ANY("AllowedSources"))
  AND "IsActive" = TRUE;

-- Add PAYMENT_DEPOSIT (bank deposit clearing)
UPDATE accounts
SET
    "AllowedSources" = array_append("AllowedSources", 'PAYMENT_DEPOSIT'),
    "UpdatedAt"      = NOW()
WHERE "AccountCode" IN ('1030', '1040')
  AND "AllowedSources" != '{}'
  AND NOT ('PAYMENT_DEPOSIT' = ANY("AllowedSources"))
  AND "IsActive" = TRUE;

-- Add EXPENSE_PAYMENT (expenses paid via mobile money / bank transfer)
UPDATE accounts
SET
    "AllowedSources" = array_append("AllowedSources", 'EXPENSE_PAYMENT'),
    "UpdatedAt"      = NOW()
WHERE "AccountCode" IN ('1030', '1040')
  AND "AllowedSources" != '{}'
  AND NOT ('EXPENSE_PAYMENT' = ANY("AllowedSources"))
  AND "IsActive" = TRUE;

-- Add SYSTEM_CORRECTION (admin remediation scripts)
UPDATE accounts
SET
    "AllowedSources" = array_append("AllowedSources", 'SYSTEM_CORRECTION'),
    "UpdatedAt"      = NOW()
WHERE "AccountCode" IN ('1030', '1040')
  AND "AllowedSources" != '{}'
  AND NOT ('SYSTEM_CORRECTION' = ANY("AllowedSources"))
  AND "IsActive" = TRUE;

-- Also fix any other payment accounts (1011, 1020) if they have restrictive AllowedSources
UPDATE accounts
SET
    "AllowedSources" = array_append("AllowedSources", 'SALES_INVOICE'),
    "UpdatedAt"      = NOW()
WHERE "AccountCode" IN ('1011', '1020')
  AND "AllowedSources" != '{}'
  AND NOT ('SALES_INVOICE' = ANY("AllowedSources"))
  AND "IsActive" = TRUE;

-- Verify
SELECT "AccountCode", "AccountName", array_to_string("AllowedSources", ', ') AS allowed_sources
FROM accounts
WHERE "AccountCode" IN ('1010', '1011', '1020', '1030', '1040')
ORDER BY "AccountCode";

COMMIT;
