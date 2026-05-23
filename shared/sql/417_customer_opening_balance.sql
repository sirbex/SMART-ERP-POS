-- Customer opening balance (AR cutover) — mirror supplier OPENING_BALANCE on supplier_invoices
-- GL: DR Accounts Receivable (1200) / CR Opening Balance Equity (3050), source CUTOVER_OB

-- Allow CUTOVER_OB on AR (1200) for customer opening balance journals
UPDATE accounts
SET "AllowedSources" = ARRAY(
    SELECT DISTINCT unnest(
        COALESCE("AllowedSources", '{}'::text[])
        || ARRAY['CUTOVER_OB', 'CUTOVER_CORRECTION']
    )
)
WHERE "AccountCode" = '1200'
  AND NOT ('CUTOVER_OB' = ANY(COALESCE("AllowedSources", '{}'::text[])));

-- Extend invoices.document_type CHECK (idempotent constraint swap via EXECUTE — safe, no data loss)
DO $m$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_invoices_document_type'
      AND conrelid = 'invoices'::regclass
  ) THEN
    EXECUTE $q$
      ALTER TABLE invoices
      DROP CONSTRAINT chk_invoices_document_type
    $q$;
  END IF;

  EXECUTE $q$
    ALTER TABLE invoices ADD CONSTRAINT chk_invoices_document_type
    CHECK (document_type IN (
      'INVOICE',
      'CREDIT_NOTE',
      'DEBIT_NOTE',
      'DIST_INVOICE',
      'OPENING_BALANCE'
    ))
  $q$;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $m$;

DO $m$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_invoices_reference_consistency'
      AND conrelid = 'invoices'::regclass
  ) THEN
    EXECUTE $q$
      ALTER TABLE invoices
      DROP CONSTRAINT chk_invoices_reference_consistency
    $q$;
  END IF;

  EXECUTE $q$
    ALTER TABLE invoices ADD CONSTRAINT chk_invoices_reference_consistency
    CHECK (
      (document_type IN ('INVOICE', 'DIST_INVOICE', 'OPENING_BALANCE') AND reference_invoice_id IS NULL)
      OR
      (document_type IN ('CREDIT_NOTE', 'DEBIT_NOTE') AND reference_invoice_id IS NOT NULL)
    )
  $q$;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $m$;
