-- ============================================================
-- CREDIT NOTES & DEBIT NOTES - Schema Extension
-- Extends invoices and supplier_invoices tables
-- NO new tables - follows ERP pattern (SAP/Odoo)
-- ============================================================

-- 1) Add document_type and reference_invoice_id to invoices (customer side)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'invoices' AND column_name = 'document_type'
    ) THEN
        ALTER TABLE invoices
            ADD COLUMN document_type VARCHAR(20) NOT NULL DEFAULT 'INVOICE';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'invoices' AND column_name = 'reference_invoice_id'
    ) THEN
        ALTER TABLE invoices
            ADD COLUMN reference_invoice_id UUID NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'invoices' AND column_name = 'reason'
    ) THEN
        ALTER TABLE invoices
            ADD COLUMN reason VARCHAR(500) NULL;
    END IF;
END $$;

-- Add CHECK constraint for document_type values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoices_document_type'
    ) THEN
        ALTER TABLE invoices
            ADD CONSTRAINT chk_invoices_document_type
            CHECK (document_type IN ('INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE'));
    END IF;
END $$;

-- Add CHECK constraint: notes must reference an invoice, invoices must not
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_invoices_reference_consistency'
    ) THEN
        ALTER TABLE invoices
            ADD CONSTRAINT chk_invoices_reference_consistency
            CHECK (
                (document_type = 'INVOICE' AND reference_invoice_id IS NULL)
                OR (document_type IN ('CREDIT_NOTE', 'DEBIT_NOTE') AND reference_invoice_id IS NOT NULL)
            );
    END IF;
END $$;

-- Add FK for reference_invoice_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_reference_invoice'
    ) THEN
        ALTER TABLE invoices
            ADD CONSTRAINT fk_invoices_reference_invoice
            FOREIGN KEY (reference_invoice_id) REFERENCES invoices("Id") ON DELETE RESTRICT;
    END IF;
END $$;

-- Index on reference_invoice_id for lookups
CREATE INDEX IF NOT EXISTS idx_invoices_reference_invoice ON invoices(reference_invoice_id) WHERE reference_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_document_type ON invoices(document_type);

-- 2) Add document_type and reference_invoice_id to supplier_invoices
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'supplier_invoices' AND column_name = 'document_type'
    ) THEN
        ALTER TABLE supplier_invoices
            ADD COLUMN document_type VARCHAR(30) NOT NULL DEFAULT 'SUPPLIER_INVOICE';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'supplier_invoices' AND column_name = 'reference_invoice_id'
    ) THEN
        ALTER TABLE supplier_invoices
            ADD COLUMN reference_invoice_id UUID NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'supplier_invoices' AND column_name = 'reason'
    ) THEN
        ALTER TABLE supplier_invoices
            ADD COLUMN reason VARCHAR(500) NULL;
    END IF;
END $$;

-- Add CHECK constraint for supplier document_type values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_supplier_invoices_document_type'
    ) THEN
        ALTER TABLE supplier_invoices
            ADD CONSTRAINT chk_supplier_invoices_document_type
            CHECK (document_type IN ('SUPPLIER_INVOICE', 'SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE'));
    END IF;
END $$;

-- Add CHECK constraint: notes must reference an invoice, invoices must not
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_supplier_invoices_reference_consistency'
    ) THEN
        ALTER TABLE supplier_invoices
            ADD CONSTRAINT chk_supplier_invoices_reference_consistency
            CHECK (
                (document_type = 'SUPPLIER_INVOICE' AND reference_invoice_id IS NULL)
                OR (document_type IN ('SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE') AND reference_invoice_id IS NOT NULL)
            );
    END IF;
END $$;

-- Add FK for reference_invoice_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_supplier_invoices_reference_invoice'
    ) THEN
        ALTER TABLE supplier_invoices
            ADD CONSTRAINT fk_supplier_invoices_reference_invoice
            FOREIGN KEY (reference_invoice_id) REFERENCES supplier_invoices("Id") ON DELETE RESTRICT;
    END IF;
END $$;

-- Index on reference_invoice_id for lookups
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_reference_invoice ON supplier_invoices(reference_invoice_id) WHERE reference_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_document_type ON supplier_invoices(document_type);

-- 3) Add new GL accounts for Sales Returns and Purchase Returns
INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "Level", "IsPostingAccount", "IsActive", "Description", "CurrentBalance", "CreatedAt", "UpdatedAt", "AccountClassification")
SELECT gen_random_uuid(), '4010', 'Sales Returns & Allowances', 'REVENUE', 'DEBIT', 1, true, true, 'Contra-revenue account for customer credit notes (returns, price adjustments)', 0, NOW(), NOW(), 'REVENUE'
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '4010');

INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "Level", "IsPostingAccount", "IsActive", "Description", "CurrentBalance", "CreatedAt", "UpdatedAt", "AccountClassification")
SELECT gen_random_uuid(), '5010', 'Purchase Returns & Allowances', 'EXPENSE', 'CREDIT', 1, true, true, 'Contra-expense account for supplier credit notes (returns, price adjustments)', 0, NOW(), NOW(), 'EXPENSE'
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '5010');

-- Temporarily drop the total > 0 check on invoices since credit/debit notes store positive amounts
-- but we need flexibility for the system
-- Actually, credit/debit notes will store POSITIVE amounts (absolute value), so the check is fine.
-- The accounting entry direction (DR/CR) handles sign, not the document amount.
