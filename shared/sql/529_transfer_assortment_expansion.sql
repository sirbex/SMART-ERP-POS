-- Migration 529: Transfer assortment expansion policy (Phase 3)
-- When transferring RESTRICTED or hidden products, control whether destination assortment expands.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transfer_assortment_expansion_policy') THEN
        CREATE TYPE transfer_assortment_expansion_policy AS ENUM ('PROMPT', 'ALWAYS_EXPAND', 'TRANSFER_ONLY');
    END IF;
END $$;

ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS transfer_assortment_expansion_policy transfer_assortment_expansion_policy NOT NULL DEFAULT 'PROMPT';

COMMENT ON COLUMN system_settings.transfer_assortment_expansion_policy IS
    'PROMPT: user chooses per product. ALWAYS_EXPAND: auto-add to destination assortment. TRANSFER_ONLY: stock only, no assortment change.';

ALTER TABLE store_transfers
    ADD COLUMN IF NOT EXISTS assortment_expansion_decisions JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN store_transfers.assortment_expansion_decisions IS
    'Per-product decisions at create: [{productId, expandPermanently}]. Applied when stock arrives at destination.';

INSERT INTO schema_version (version) VALUES (529) ON CONFLICT DO NOTHING;
