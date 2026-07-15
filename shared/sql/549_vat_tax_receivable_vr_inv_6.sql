-- Migration 549: VAT Remittance Phase 3B — VR-INV-6 (no WHT collision on product VAT)
--
-- Product VAT tax_receivable_account must not default to / use WHT receivable 1250.
-- Net VAT control remains 2300 for both payable and receivable sides (ADR-005 Decision B).
-- Related: docs/architecture/VAT_REMITTANCE_ADR.md

UPDATE tax_definitions
SET tax_receivable_account = '2300',
    updated_at = NOW()
WHERE tax_receivable_account = '1250'
  AND UPPER(code) NOT LIKE 'WHT%';

ALTER TABLE tax_definitions
  ALTER COLUMN tax_receivable_account SET DEFAULT '2300';

COMMENT ON COLUMN tax_definitions.tax_receivable_account IS
  'ADR-005: product VAT input side — use 2300 (net Tax Payable). Never 1250 (WHT receivable).';

INSERT INTO schema_version (version) VALUES (549) ON CONFLICT DO NOTHING;
