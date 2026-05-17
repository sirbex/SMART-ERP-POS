-- Migration: 20260616_cutover_accounting.sql
-- Purpose : 1. Allow CUTOVER_OB and CUTOVER_CORRECTION as valid posting sources
--              for the Opening Balance Equity account (3050).
--           2. Allow OPENING_BALANCE as a valid document_type in supplier_invoices.
--
-- Background:
--   PostingGovernanceService Rule B checks the "AllowedSources" array in the
--   accounts table.  If an account has AllowedSources set, only those sources
--   may post to it.  Account 3050 (OPENING_BALANCE_EQUITY) must accept the two
--   new cutover sources introduced in this sprint.
--
--   supplier_invoices.document_type has a CHECK constraint that must be extended
--   to accept 'OPENING_BALANCE' records created by importSupplierOpeningBalance().
--
-- Rule G in governance (code-side) already allows these sources — this migration
-- aligns the DB-side guards.
--
-- Safe to re-run: UPDATE uses DISTINCT unnest; ALTER CONSTRAINT is idempotent.

-- ─── Part 1: Add CUTOVER_OB and CUTOVER_CORRECTION to AllowedSources for account 3050 ───
-- Uses DISTINCT unnest to prevent duplicates if re-run.
UPDATE accounts
SET "AllowedSources" = ARRAY(
    SELECT DISTINCT unnest(
        COALESCE("AllowedSources", '{}'::text[])
        || ARRAY['CUTOVER_OB', 'CUTOVER_CORRECTION']
    )
)
WHERE "AccountCode" = '3050';

-- ─── Part 1b: Add CUTOVER_OB and CUTOVER_CORRECTION to AllowedSources for account 2100 ───
-- CUTOVER_OB journal: DR 3050 / CR 2100 — both legs must be permitted.
-- CUTOVER_CORRECTION journal: DR [original credit acct] / CR 3050 — 2100 can be
-- the DR side when the original asset acquisition was posted to Accounts Payable.
UPDATE accounts
SET "AllowedSources" = ARRAY(
    SELECT DISTINCT unnest(
        COALESCE("AllowedSources", '{}'::text[])
        || ARRAY['CUTOVER_OB', 'CUTOVER_CORRECTION']
    )
)
WHERE "AccountCode" = '2100';

-- ─── Part 1c: Add CUTOVER_CORRECTION to every account that already allows SYSTEM_CORRECTION ───
-- Asset correction journals debit the original credit account (Cash, Bank, Petty Cash,
-- AR, Inventory, GR/IR, COGS, etc.).  CUTOVER_CORRECTION carries the same trust level
-- as SYSTEM_CORRECTION, so it must be admitted wherever SYSTEM_CORRECTION is allowed.
-- Safe to re-run: DISTINCT unnest prevents duplicates.
UPDATE accounts
SET "AllowedSources" = ARRAY(
    SELECT DISTINCT unnest(
        COALESCE("AllowedSources", '{}'::text[])
        || ARRAY['CUTOVER_CORRECTION']
    )
)
WHERE 'SYSTEM_CORRECTION' = ANY("AllowedSources")
  AND NOT ('CUTOVER_CORRECTION' = ANY("AllowedSources"));

-- ─── Part 2: Extend supplier_invoices document_type CHECK to include OPENING_BALANCE ───
-- Drop old constraint and recreate with OPENING_BALANCE added.
-- Safe to re-run: DROP IF EXISTS + exact CREATE.
ALTER TABLE supplier_invoices
    DROP CONSTRAINT IF EXISTS chk_supplier_invoices_document_type;

ALTER TABLE supplier_invoices
    ADD CONSTRAINT chk_supplier_invoices_document_type
    CHECK (document_type IN (
        'SUPPLIER_INVOICE',
        'SUPPLIER_CREDIT_NOTE',
        'SUPPLIER_DEBIT_NOTE',
        'OPENING_BALANCE'
    ));

-- Also extend the reference_consistency constraint so OPENING_BALANCE (like
-- SUPPLIER_INVOICE) is allowed with a NULL reference_invoice_id.
ALTER TABLE supplier_invoices
    DROP CONSTRAINT IF EXISTS chk_supplier_invoices_reference_consistency;

ALTER TABLE supplier_invoices
    ADD CONSTRAINT chk_supplier_invoices_reference_consistency
    CHECK (
        -- Normal invoices and opening balances: no reference required
        (document_type IN ('SUPPLIER_INVOICE', 'OPENING_BALANCE') AND reference_invoice_id IS NULL)
        OR
        -- Credit/debit notes: must reference an invoice
        (document_type IN ('SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE') AND reference_invoice_id IS NOT NULL)
    );

-- ─── Verify (informational only — does not fail migration) ───
DO $$
DECLARE
    sources3050 text[];
    sources2100 text[];
BEGIN
    SELECT "AllowedSources" INTO sources3050 FROM accounts WHERE "AccountCode" = '3050' LIMIT 1;
    SELECT "AllowedSources" INTO sources2100 FROM accounts WHERE "AccountCode" = '2100' LIMIT 1;

    IF sources3050 IS NULL THEN
        RAISE NOTICE 'Account 3050 not found or AllowedSources is NULL';
    ELSIF 'CUTOVER_OB' = ANY(sources3050) AND 'CUTOVER_CORRECTION' = ANY(sources3050) THEN
        RAISE NOTICE 'Account 3050 AllowedSources updated successfully: %', sources3050;
    ELSE
        RAISE WARNING 'Account 3050 AllowedSources update may have failed: %', sources3050;
    END IF;

    IF sources2100 IS NULL THEN
        RAISE NOTICE 'Account 2100 not found or AllowedSources is NULL';
    ELSIF 'CUTOVER_OB' = ANY(sources2100) AND 'CUTOVER_CORRECTION' = ANY(sources2100) THEN
        RAISE NOTICE 'Account 2100 AllowedSources updated successfully: %', sources2100;
    ELSE
        RAISE WARNING 'Account 2100 AllowedSources update may have failed: %', sources2100;
    END IF;
END;
$$;
