-- Migration 548: VAT Remittance Foundation (ADR-005 Phase 3A)
--
-- Feature flag only — remittance TD engine lands in 3C.
-- Flag-off default: vat_remittance_document_enabled = FALSE → no behavior change.
-- Related: docs/architecture/VAT_REMITTANCE_ADR.md

ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS vat_remittance_document_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN system_settings.vat_remittance_document_enabled IS
  'ADR-005 Phase 3A: when true, VAT authority settlement must post via VAT_REMITTANCE Treasury Document';

INSERT INTO schema_version (version) VALUES (548) ON CONFLICT DO NOTHING;
