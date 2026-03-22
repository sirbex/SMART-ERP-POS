-- ============================================================================
-- Migration: Opening Balance Equity Account + SYSTEM Supplier + OPENING_BALANCE movement type
-- Date: 2026-03
-- Purpose: Align bulk stock import accounting with ERP best practices
--          (SAP/Odoo/Tally/QuickBooks all credit equity, not revenue, for opening stock)
-- ============================================================================

-- 1. Add Opening Balance Equity account (3050)
--    Used when importing products with opening stock quantities.
--    DR Inventory (1300) / CR Opening Balance Equity (3050)
--    This prevents imported stock from inflating revenue (which 4110 Overage would).
INSERT INTO accounts (
  "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
  "ParentAccountId", "Level", "IsPostingAccount", "IsActive",
  "CurrentBalance", "CreatedAt", "UpdatedAt"
)
SELECT gen_random_uuid(), '3050', 'Opening Balance Equity', 'EQUITY', 'CREDIT',
       NULL, 1, TRUE, TRUE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '3050');

-- 2. Add OPENING_BALANCE to movement_type enum (if not already present)
--    This distinguishes imported opening stock from manual adjustments in audit trail.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'OPENING_BALANCE'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'movement_type')
  ) THEN
    ALTER TYPE movement_type ADD VALUE 'OPENING_BALANCE';
  END IF;
END $$;

-- 3. Create SYSTEM supplier for import traceability
--    This supplier represents internal/opening-balance stock entries.
--    It will NEVER have purchase orders, invoices, or outstanding balance.
INSERT INTO suppliers (
  "Id", "SupplierCode", "CompanyName", "ContactName", "Email", "Phone", "Address",
  "DefaultPaymentTerms", "CreditLimit", "OutstandingBalance", "TaxId", "Notes",
  "IsActive", "CreatedAt", "UpdatedAt"
)
SELECT
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'SYS-OPENING-BAL',
  'SYSTEM - Opening Balance',
  'System',
  NULL, NULL, NULL,
  0, 0, 0, NULL,
  'System supplier for opening balance stock imports. Do not create POs or invoices against this supplier.',
  TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM suppliers WHERE "SupplierCode" = 'SYS-OPENING-BAL'
);

-- 4. Protect SYSTEM supplier from modification/deletion (DB-level safety net)
CREATE OR REPLACE FUNCTION fn_protect_system_supplier()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."SupplierCode" LIKE 'SYS-%' THEN
      RAISE EXCEPTION 'System suppliers cannot be deleted (code: %)', OLD."SupplierCode";
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE: prevent changing critical fields
  IF OLD."SupplierCode" LIKE 'SYS-%' THEN
    IF NEW."SupplierCode" != OLD."SupplierCode"
       OR NEW."IsActive" != OLD."IsActive"
       OR NEW."CompanyName" != OLD."CompanyName" THEN
      RAISE EXCEPTION 'System supplier fields (code, name, active) cannot be modified';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_system_supplier ON suppliers;
CREATE TRIGGER trg_protect_system_supplier
  BEFORE UPDATE OR DELETE ON suppliers
  FOR EACH ROW
  EXECUTE FUNCTION fn_protect_system_supplier();

-- Verify
SELECT "AccountCode", "AccountName", "AccountType" FROM accounts WHERE "AccountCode" = '3050';
SELECT "SupplierCode", "CompanyName" FROM suppliers WHERE "SupplierCode" = 'SYS-OPENING-BAL';
