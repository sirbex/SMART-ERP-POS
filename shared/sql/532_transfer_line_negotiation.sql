-- Migration 532: Negotiable transfer lines (requested / approved / dispatched / received)

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'store_transfer_status' AND e.enumlabel = 'PARTIALLY_APPROVED'
    ) THEN
        ALTER TYPE store_transfer_status ADD VALUE 'PARTIALLY_APPROVED';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'store_transfer_status' AND e.enumlabel = 'PARTIALLY_DISPATCHED'
    ) THEN
        ALTER TYPE store_transfer_status ADD VALUE 'PARTIALLY_DISPATCHED';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'store_transfer_status' AND e.enumlabel = 'PARTIALLY_RECEIVED'
    ) THEN
        ALTER TYPE store_transfer_status ADD VALUE 'PARTIALLY_RECEIVED';
    END IF;
END $$;

ALTER TABLE store_transfer_lines
    ADD COLUMN IF NOT EXISTS quantity_approved NUMERIC(15, 4),
    ADD COLUMN IF NOT EXISTS approval_comment TEXT,
    ADD COLUMN IF NOT EXISTS dispatch_comment TEXT,
    ADD COLUMN IF NOT EXISTS receive_comment TEXT,
    ADD COLUMN IF NOT EXISTS quantity_shortage NUMERIC(15, 4) NOT NULL DEFAULT 0;

-- Backfill approved qty for transfers already past draft
UPDATE store_transfer_lines stl
SET quantity_approved = stl.quantity
FROM store_transfers st
WHERE st.id = stl.store_transfer_id
  AND st.status NOT IN ('DRAFT', 'CANCELLED')
  AND stl.quantity_approved IS NULL;

ALTER TABLE store_transfer_lines DROP CONSTRAINT IF EXISTS chk_transfer_line_qty;

ALTER TABLE store_transfer_lines ADD CONSTRAINT chk_transfer_line_qty CHECK (
    quantity_dispatched >= 0
    AND quantity_received >= 0
    AND quantity_shortage >= 0
    AND (quantity_approved IS NULL OR quantity_approved >= 0)
    AND (quantity_approved IS NULL OR quantity_approved <= quantity)
    AND quantity_dispatched <= COALESCE(quantity_approved, quantity)
    AND quantity_received <= quantity_dispatched
);

COMMENT ON COLUMN store_transfer_lines.quantity IS 'Qty requested by destination store';
COMMENT ON COLUMN store_transfer_lines.quantity_approved IS 'Qty approved by supplying warehouse (negotiable)';
COMMENT ON COLUMN store_transfer_lines.quantity_shortage IS 'Cumulative shortage: dispatched minus received';

INSERT INTO schema_version (version) VALUES (532) ON CONFLICT DO NOTHING;
