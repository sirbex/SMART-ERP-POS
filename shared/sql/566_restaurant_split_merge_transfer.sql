-- Migration 566: Restaurant Phase 4 — Split / Merge / Transfer support
-- Requires 560. No parallel orders table; multi-check per table via pos_orders.table_id.

CREATE INDEX IF NOT EXISTS idx_pos_orders_table_pending
  ON pos_orders (table_id, status)
  WHERE table_id IS NOT NULL AND status = 'PENDING';

COMMENT ON INDEX idx_pos_orders_table_pending IS
  'Phase 4: find sibling open checks on a table after split bills';
