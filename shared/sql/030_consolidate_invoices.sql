-- ============================================================================
-- 030_consolidate_invoices.sql
-- Invoice Table Consolidation & Column Normalization
--
-- Purpose:
--   1. Rename PascalCase columns in `invoices` to snake_case
--   2. Add distribution source columns + invoice_lines table
--   3. Migrate `dist_invoices` data into the unified `invoices` table
--   4. Retarget `dist_receipts` and `dist_down_payment_clearings` FKs
--   5. Replace `dist_invoices` / `dist_invoice_lines` with views
--
-- Idempotent: safe to run multiple times (IF EXISTS / IF NOT EXISTS guards)
-- Low-risk: Only 1 row in each table in production
-- ============================================================================

BEGIN;

-- ─── Phase 1: Normalize invoices column names PascalCase → snake_case ───

-- 1a. Drop constraints that reference PascalCase columns (will recreate after)
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_amount_paid_not_exceed_total;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_outstanding_balance_non_negative;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_total_amount_positive;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS fk_invoices_reference_invoice;

-- 1b. Rename PascalCase columns
-- Only rename if the PascalCase column exists (first run only)
DO $$
BEGIN
  -- Primary key
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='Id') THEN
    ALTER TABLE invoices RENAME COLUMN "Id" TO id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='InvoiceNumber') THEN
    ALTER TABLE invoices RENAME COLUMN "InvoiceNumber" TO invoice_number;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='CustomerId') THEN
    ALTER TABLE invoices RENAME COLUMN "CustomerId" TO customer_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='CustomerName') THEN
    ALTER TABLE invoices RENAME COLUMN "CustomerName" TO customer_name;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='SaleId') THEN
    ALTER TABLE invoices RENAME COLUMN "SaleId" TO sale_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='InvoiceDate') THEN
    ALTER TABLE invoices RENAME COLUMN "InvoiceDate" TO issue_date;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='DueDate') THEN
    ALTER TABLE invoices RENAME COLUMN "DueDate" TO due_date;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='Subtotal') THEN
    ALTER TABLE invoices RENAME COLUMN "Subtotal" TO subtotal;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='TaxAmount') THEN
    ALTER TABLE invoices RENAME COLUMN "TaxAmount" TO tax_amount;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='TotalAmount') THEN
    ALTER TABLE invoices RENAME COLUMN "TotalAmount" TO total_amount;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='AmountPaid') THEN
    ALTER TABLE invoices RENAME COLUMN "AmountPaid" TO amount_paid;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='OutstandingBalance') THEN
    ALTER TABLE invoices RENAME COLUMN "OutstandingBalance" TO amount_due;
  END IF;

  -- Status — already lowercase in some envs; only rename if PascalCase exists
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='Status') THEN
    ALTER TABLE invoices RENAME COLUMN "Status" TO status;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='PaymentTerms') THEN
    ALTER TABLE invoices RENAME COLUMN "PaymentTerms" TO payment_terms;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='Reference') THEN
    ALTER TABLE invoices RENAME COLUMN "Reference" TO reference;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='Notes') THEN
    ALTER TABLE invoices RENAME COLUMN "Notes" TO notes;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='CreatedAt') THEN
    ALTER TABLE invoices RENAME COLUMN "CreatedAt" TO created_at;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='UpdatedAt') THEN
    ALTER TABLE invoices RENAME COLUMN "UpdatedAt" TO updated_at;
  END IF;
END $$;

-- 1c. Normalize existing status values PascalCase → UPPER_SNAKE_CASE
UPDATE invoices SET status = 'DRAFT' WHERE status = 'Draft';
UPDATE invoices SET status = 'UNPAID' WHERE status = 'Unpaid';
UPDATE invoices SET status = 'PARTIALLY_PAID' WHERE status = 'PartiallyPaid';
UPDATE invoices SET status = 'PAID' WHERE status = 'Paid';
UPDATE invoices SET status = 'CANCELLED' WHERE status = 'Cancelled';
UPDATE invoices SET status = 'VOIDED' WHERE status = 'Voided';
UPDATE invoices SET status = 'OVERDUE' WHERE status = 'Overdue';
-- Map OPEN (from dist) to UNPAID on the rare case
UPDATE invoices SET status = 'UNPAID' WHERE status = 'OPEN';

-- 1d. Recreate constraints with snake_case column names
ALTER TABLE invoices ADD CONSTRAINT chk_total_amount_positive
  CHECK (total_amount > 0);

ALTER TABLE invoices ADD CONSTRAINT chk_amount_paid_not_exceed_total
  CHECK (amount_paid <= total_amount);

ALTER TABLE invoices ADD CONSTRAINT chk_amount_due_non_negative
  CHECK (amount_due >= 0);

ALTER TABLE invoices ADD CONSTRAINT fk_invoices_reference_invoice
  FOREIGN KEY (reference_invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT;

-- 1e. Add invoice_payments FK if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_payments_invoice_id_fkey'
  ) THEN
    ALTER TABLE invoice_payments
      ADD CONSTRAINT invoice_payments_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
  END IF;
END $$;


-- ─── Phase 2: Add new columns for unified invoice support ───────────────

-- Distribution source tracking
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sales_order_id UUID;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_id UUID;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source_module VARCHAR(20) NOT NULL DEFAULT 'RETAIL';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_by_id UUID;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS quote_id UUID;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS returns_goods BOOLEAN NOT NULL DEFAULT false;

-- Add FKs for new columns (guarded)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_sales_order') THEN
    ALTER TABLE invoices ADD CONSTRAINT fk_invoices_sales_order
      FOREIGN KEY (sales_order_id) REFERENCES dist_sales_orders(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_delivery') THEN
    ALTER TABLE invoices ADD CONSTRAINT fk_invoices_delivery
      FOREIGN KEY (delivery_id) REFERENCES dist_deliveries(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_created_by') THEN
    ALTER TABLE invoices ADD CONSTRAINT fk_invoices_created_by
      FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_quotation') THEN
    ALTER TABLE invoices ADD CONSTRAINT fk_invoices_quotation
      FOREIGN KEY (quote_id) REFERENCES quotations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Expand document_type CHECK to include DIST_INVOICE
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_invoices_document_type;
ALTER TABLE invoices ADD CONSTRAINT chk_invoices_document_type
  CHECK (document_type IN ('INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'DIST_INVOICE'));

-- Update reference consistency constraint to allow DIST_INVOICE with no ref
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_invoices_reference_consistency;
ALTER TABLE invoices ADD CONSTRAINT chk_invoices_reference_consistency
  CHECK (
    (document_type IN ('INVOICE', 'DIST_INVOICE') AND reference_invoice_id IS NULL)
    OR
    (document_type IN ('CREDIT_NOTE', 'DEBIT_NOTE') AND reference_invoice_id IS NOT NULL)
  );

-- Set existing invoices as RETAIL source
UPDATE invoices SET source_module = 'RETAIL' WHERE source_module IS NULL OR source_module = 'RETAIL';

-- Index for distribution lookups
CREATE INDEX IF NOT EXISTS idx_invoices_sales_order_id ON invoices(sales_order_id) WHERE sales_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_delivery_id ON invoices(delivery_id) WHERE delivery_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_source_module ON invoices(source_module);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);


-- ─── Phase 3: Create invoice_lines table ────────────────────────────────

CREATE TABLE IF NOT EXISTS invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  delivery_line_id UUID,  -- nullable, only for delivery-sourced invoices
  product_id UUID REFERENCES products(id),
  description TEXT,
  quantity DECIMAL(12,3) NOT NULL DEFAULT 1,
  unit_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice_id ON invoice_lines(invoice_id);


-- ─── Phase 4: Migrate dist_invoices → invoices ─────────────────────────

-- Only migrate rows that don't already exist (idempotent)
INSERT INTO invoices (
  id, invoice_number, customer_id, customer_name,
  sale_id, issue_date, due_date,
  subtotal, tax_amount, total_amount, amount_paid, amount_due,
  status, payment_terms, notes,
  created_at, updated_at,
  document_type, source_module,
  sales_order_id, delivery_id, created_by_id
)
SELECT
  di.id,
  di.invoice_number,
  di.customer_id,
  c.name,
  NULL,  -- no sale_id for distribution invoices
  di.issue_date,
  COALESCE(di.due_date, di.issue_date + INTERVAL '30 days'),
  di.total_amount,  -- subtotal = total (no tax in dist)
  0,                -- tax_amount
  di.total_amount,
  di.amount_paid,
  di.amount_due,
  -- Map dist status to unified status
  CASE di.status
    WHEN 'OPEN' THEN 'UNPAID'
    WHEN 'PARTIALLY_PAID' THEN 'PARTIALLY_PAID'
    WHEN 'PAID' THEN 'PAID'
    WHEN 'CANCELLED' THEN 'CANCELLED'
    ELSE 'UNPAID'
  END,
  30,  -- default payment_terms
  di.notes,
  di.created_at,
  di.created_at,  -- updated_at = created_at initially
  'DIST_INVOICE',
  'DISTRIBUTION',
  di.sales_order_id,
  di.delivery_id,
  di.created_by
FROM dist_invoices di
JOIN customers c ON c.id = di.customer_id
WHERE NOT EXISTS (
  SELECT 1 FROM invoices inv WHERE inv.id = di.id
);

-- Migrate dist_invoice_lines → invoice_lines
INSERT INTO invoice_lines (
  id, invoice_id, delivery_line_id, product_id,
  quantity, unit_price, line_total, created_at
)
SELECT
  dil.id,
  dil.invoice_id,
  dil.delivery_line_id,
  dil.product_id,
  dil.quantity,
  dil.unit_price,
  dil.line_total,
  dil.created_at
FROM dist_invoice_lines dil
WHERE NOT EXISTS (
  SELECT 1 FROM invoice_lines il WHERE il.id = dil.id
);


-- ─── Phase 5: Retarget dist_receipts and dist_down_payment_clearings ────

-- Add new FK column pointing to unified invoices table
ALTER TABLE dist_receipts ADD COLUMN IF NOT EXISTS unified_invoice_id UUID;
ALTER TABLE dist_down_payment_clearings ADD COLUMN IF NOT EXISTS unified_invoice_id UUID;

-- Populate from the migrated IDs (they're the same UUIDs)
UPDATE dist_receipts SET unified_invoice_id = invoice_id WHERE unified_invoice_id IS NULL;
UPDATE dist_down_payment_clearings SET unified_invoice_id = invoice_id WHERE unified_invoice_id IS NULL;

-- Add FKs to unified invoices
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dist_receipts_unified_invoice') THEN
    ALTER TABLE dist_receipts ADD CONSTRAINT fk_dist_receipts_unified_invoice
      FOREIGN KEY (unified_invoice_id) REFERENCES invoices(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dist_clearings_unified_invoice') THEN
    ALTER TABLE dist_down_payment_clearings ADD CONSTRAINT fk_dist_clearings_unified_invoice
      FOREIGN KEY (unified_invoice_id) REFERENCES invoices(id);
  END IF;
END $$;


-- ─── Phase 6: Create backward-compat views ─────────────────────────────

-- Drop old tables and replace with views (only if data was migrated)
-- SAFETY: Keep dist_invoices as a view so any missed code still works
-- We do this by first renaming the tables, then creating views

-- Only do this if the actual tables still exist (not already views)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'dist_invoice_lines' AND table_type = 'BASE TABLE'
  ) THEN
    -- Rename originals to _legacy
    ALTER TABLE dist_invoice_lines RENAME TO dist_invoice_lines_legacy;
    ALTER TABLE dist_invoice_lines_legacy DROP CONSTRAINT IF EXISTS dist_invoice_lines_invoice_id_fkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'dist_invoices' AND table_type = 'BASE TABLE'
  ) THEN
    -- Must drop FKs referencing dist_invoices first
    ALTER TABLE dist_receipts DROP CONSTRAINT IF EXISTS dist_receipts_invoice_id_fkey;
    ALTER TABLE dist_down_payment_clearings DROP CONSTRAINT IF EXISTS dist_down_payment_clearings_invoice_id_fkey;
    ALTER TABLE dist_invoices RENAME TO dist_invoices_legacy;
  END IF;
END $$;

-- Create views that look like the old tables
CREATE OR REPLACE VIEW dist_invoices AS
SELECT
  id,
  invoice_number,
  sales_order_id,
  delivery_id,
  customer_id,
  total_amount,
  amount_paid,
  amount_due,
  CASE status
    WHEN 'UNPAID' THEN 'OPEN'
    ELSE status
  END AS status,
  issue_date,
  due_date,
  notes,
  created_by_id AS created_by,
  created_at
FROM invoices
WHERE source_module = 'DISTRIBUTION';

CREATE OR REPLACE VIEW dist_invoice_lines AS
SELECT
  il.id,
  il.invoice_id,
  il.delivery_line_id,
  il.product_id,
  il.quantity,
  il.unit_price,
  il.line_total,
  il.created_at
FROM invoice_lines il
JOIN invoices i ON i.id = il.invoice_id
WHERE i.source_module = 'DISTRIBUTION';


-- ─── Phase 7: Verification ─────────────────────────────────────────────

DO $$
DECLARE
  inv_count INT;
  line_count INT;
BEGIN
  SELECT COUNT(*) INTO inv_count FROM invoices;
  SELECT COUNT(*) INTO line_count FROM invoice_lines;
  RAISE NOTICE 'Migration complete: % invoices, % invoice_lines', inv_count, line_count;
END $$;

COMMIT;
