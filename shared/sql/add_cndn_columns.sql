-- Migration: Add CN/DN columns to invoices and supplier_invoices
-- Idempotent: safe to run multiple times
-- Date: 2026-03-31

-- ═══════════════════════════════════════════════════════════
-- 1. invoices table: document_type, reference_invoice_id, reason
-- ═══════════════════════════════════════════════════════════

-- Add document_type column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'document_type'
  ) THEN
    ALTER TABLE invoices ADD COLUMN document_type VARCHAR(20) NOT NULL DEFAULT 'INVOICE';
  END IF;
END $$;

-- Add reference_invoice_id column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'reference_invoice_id'
  ) THEN
    ALTER TABLE invoices ADD COLUMN reference_invoice_id UUID;
  END IF;
END $$;

-- Add reason column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'reason'
  ) THEN
    ALTER TABLE invoices ADD COLUMN reason VARCHAR(500);
  END IF;
END $$;

-- Add index on document_type
CREATE INDEX IF NOT EXISTS idx_invoices_document_type ON invoices(document_type);

-- Add partial index on reference_invoice_id
CREATE INDEX IF NOT EXISTS idx_invoices_reference_invoice ON invoices(reference_invoice_id) WHERE reference_invoice_id IS NOT NULL;

-- Add FK constraint (idempotent via DO block)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_reference_invoice'
  ) THEN
    ALTER TABLE invoices ADD CONSTRAINT fk_invoices_reference_invoice
      FOREIGN KEY (reference_invoice_id) REFERENCES invoices("Id") ON DELETE RESTRICT;
  END IF;
END $$;

-- Add CHECK constraint for document_type values
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoices_document_type'
  ) THEN
    ALTER TABLE invoices ADD CONSTRAINT chk_invoices_document_type
      CHECK (document_type IN ('INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE'));
  END IF;
END $$;

-- Add CHECK constraint for reference consistency
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoices_reference_consistency'
  ) THEN
    ALTER TABLE invoices ADD CONSTRAINT chk_invoices_reference_consistency
      CHECK (
        (document_type = 'INVOICE' AND reference_invoice_id IS NULL)
        OR (document_type IN ('CREDIT_NOTE', 'DEBIT_NOTE') AND reference_invoice_id IS NOT NULL)
      );
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
-- 2. supplier_invoices table: document_type, reference_invoice_id, reason
-- ═══════════════════════════════════════════════════════════

-- Add document_type column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'supplier_invoices' AND column_name = 'document_type'
  ) THEN
    ALTER TABLE supplier_invoices ADD COLUMN document_type VARCHAR(30) NOT NULL DEFAULT 'SUPPLIER_INVOICE';
  END IF;
END $$;

-- Add reference_invoice_id column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'supplier_invoices' AND column_name = 'reference_invoice_id'
  ) THEN
    ALTER TABLE supplier_invoices ADD COLUMN reference_invoice_id UUID;
  END IF;
END $$;

-- Add reason column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'supplier_invoices' AND column_name = 'reason'
  ) THEN
    ALTER TABLE supplier_invoices ADD COLUMN reason VARCHAR(500);
  END IF;
END $$;

-- Add index on document_type
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_document_type ON supplier_invoices(document_type);

-- Add partial index on reference_invoice_id
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_reference_invoice ON supplier_invoices(reference_invoice_id) WHERE reference_invoice_id IS NOT NULL;

-- Add FK constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_supplier_invoices_reference_invoice'
  ) THEN
    ALTER TABLE supplier_invoices ADD CONSTRAINT fk_supplier_invoices_reference_invoice
      FOREIGN KEY (reference_invoice_id) REFERENCES supplier_invoices("Id") ON DELETE RESTRICT;
  END IF;
END $$;

-- Add CHECK constraint for document_type values
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_supplier_invoices_document_type'
  ) THEN
    ALTER TABLE supplier_invoices ADD CONSTRAINT chk_supplier_invoices_document_type
      CHECK (document_type IN ('SUPPLIER_INVOICE', 'SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE'));
  END IF;
END $$;

-- Add CHECK constraint for reference consistency
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_supplier_invoices_reference_consistency'
  ) THEN
    ALTER TABLE supplier_invoices ADD CONSTRAINT chk_supplier_invoices_reference_consistency
      CHECK (
        (document_type = 'SUPPLIER_INVOICE' AND reference_invoice_id IS NULL)
        OR (document_type IN ('SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE') AND reference_invoice_id IS NOT NULL)
      );
  END IF;
END $$;

-- Done
SELECT 'Migration complete: CN/DN columns added to invoices and supplier_invoices' AS status;
