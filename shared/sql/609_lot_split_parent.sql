-- Migration 609: Lot split genealogy (parent_lot_id) for partial soft quarantine
-- Child lots created by LotService.splitLot reference the parent batch.

ALTER TABLE inventory_batches
    ADD COLUMN IF NOT EXISTS parent_lot_id UUID NULL REFERENCES inventory_batches(id);

CREATE INDEX IF NOT EXISTS idx_inventory_batches_parent_lot_id
    ON inventory_batches (parent_lot_id)
    WHERE parent_lot_id IS NOT NULL;

COMMENT ON COLUMN inventory_batches.parent_lot_id IS
    'Genealogy: parent inventory_batches.id when this lot was created by SPLIT (partial quarantine / repack).';

INSERT INTO schema_version (version) VALUES (609) ON CONFLICT DO NOTHING;
