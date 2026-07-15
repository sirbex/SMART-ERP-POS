-- Migration 547: Disable legacy stock_movements GL trigger (ADR-004 Phase 2D)
--
-- App posting via StockMovementHandler / LossDisposalService is the SSOT.
-- The AFTER INSERT trigger double-posts GL when both paths run.
-- Related: shared/sql/inventory_adjustment_gl_triggers.sql (historical)

DROP TRIGGER IF EXISTS trg_post_stock_movement_to_ledger ON stock_movements;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'fn_post_stock_movement_to_ledger'
      AND n.nspname = 'public'
  ) THEN
    EXECUTE $c$
      COMMENT ON FUNCTION fn_post_stock_movement_to_ledger() IS
        'RETIRED ADR-004 Phase 2D — do not recreate trigger; GL posts via StockMovementHandler'
    $c$;
  END IF;
END $$;

INSERT INTO schema_version (version) VALUES (547) ON CONFLICT DO NOTHING;
