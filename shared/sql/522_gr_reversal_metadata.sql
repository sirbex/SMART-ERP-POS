-- SAP/Odoo counter-document linkage: posted GR stays COMPLETED; reversal traced via Return GRN.
-- Allows metadata-only UPDATE on COMPLETED goods receipts when app.allow_gr_reversal_metadata = 'true'.

BEGIN;

ALTER TABLE goods_receipts
  ADD COLUMN IF NOT EXISTS reversed_by_return_grn_id UUID REFERENCES return_grn(id),
  ADD COLUMN IF NOT EXISTS reversal_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT,
  ADD COLUMN IF NOT EXISTS reversed_by_user_id UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_gr_reversed_by_rgrn
  ON goods_receipts(reversed_by_return_grn_id)
  WHERE reversed_by_return_grn_id IS NOT NULL;

COMMENT ON COLUMN goods_receipts.reversed_by_return_grn_id IS
  'Posted Return GRN that fully reversed this receipt (counter-document). GR status remains COMPLETED.';
COMMENT ON COLUMN goods_receipts.reversal_timestamp IS 'When the uninvoiced receipt was reversed via Return GRN orchestration.';
COMMENT ON COLUMN goods_receipts.reversal_reason IS 'Business reason captured at reversal time.';

CREATE OR REPLACE FUNCTION fn_protect_completed_gr()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'COMPLETED' THEN
        -- Reversal metadata only (session flag set by goodsReceiptRepository.setReversalMetadata)
        IF current_setting('app.allow_gr_reversal_metadata', true) = 'true' THEN
            IF NEW.status IS NOT DISTINCT FROM OLD.status
               AND NEW.receipt_number IS NOT DISTINCT FROM OLD.receipt_number
               AND NEW.purchase_order_id IS NOT DISTINCT FROM OLD.purchase_order_id
               AND NEW.received_date IS NOT DISTINCT FROM OLD.received_date
               AND NEW.received_by_id IS NOT DISTINCT FROM OLD.received_by_id
               AND NEW.notes IS NOT DISTINCT FROM OLD.notes
            THEN
                RETURN NEW;
            END IF;
        END IF;

        RAISE EXCEPTION 'Cannot modify COMPLETED goods receipt %. Create a new GR for corrections.',
            OLD.receipt_number;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
