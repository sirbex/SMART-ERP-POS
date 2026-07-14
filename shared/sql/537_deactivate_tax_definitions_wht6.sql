-- Migration 537: Soft-deprecate tax_definitions.WHT6
-- Payment withholding is configured via withholding_tax_types / payment flows.
-- Leaving WHT6 active in the product tax engine can inflate PURCHASE-scope tax
-- when products have no tax mappings (TaxEngine falls back to all PURCHASE defs).
UPDATE tax_definitions
SET is_active = false,
    name = CASE
      WHEN name NOT LIKE '%(use Withholding Tax module)%'
        THEN name || ' (use Withholding Tax module)'
      ELSE name
    END
WHERE code = 'WHT6'
  AND is_active = true;

INSERT INTO schema_version (version) VALUES (537) ON CONFLICT DO NOTHING;
