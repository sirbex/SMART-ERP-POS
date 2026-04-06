-- ============================================================================
-- Migration 413: Sale Refunds (SAP/Odoo-style partial & full refunds)
-- ============================================================================
-- Purpose: Add refund document tables and tracking columns to support
--          ERP-grade partial/full refund workflows on COMPLETED sales.
--
-- Architecture:
--   - sale_refunds: Refund document header (immutable once created)
--   - sale_refund_items: Line items with original cost for accurate GL reversal
--   - sale_items.refunded_qty: Tracks how much of each line has been refunded
--
-- Business Rules:
--   - Only COMPLETED sales can be refunded
--   - refunded_qty cannot exceed original quantity
--   - When ALL items fully refunded, sale status → REFUNDED
--   - Partial refunds keep sale as COMPLETED
--   - Each refund creates a reversal GL entry (via AccountingCore)
--   - Inventory is restored to the original batch (or newest active)
--   - Cost layers are restored at original unit_cost
-- ============================================================================

BEGIN;

-- 1. Add refunded_qty to sale_items (track partial refunds per line)
ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS refunded_qty DECIMAL(15, 4) NOT NULL DEFAULT 0;

-- Constraint: refunded_qty must be 0..quantity
ALTER TABLE sale_items
  ADD CONSTRAINT chk_sale_items_refunded_qty
  CHECK (refunded_qty >= 0 AND refunded_qty <= quantity);

-- 2. Refund document header
CREATE TABLE IF NOT EXISTS sale_refunds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_number   VARCHAR(50) UNIQUE NOT NULL,
  sale_id         UUID NOT NULL REFERENCES sales(id),
  refund_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  reason          TEXT NOT NULL,
  total_amount    DECIMAL(15, 2) NOT NULL,           -- sum of refund line totals (revenue returned)
  total_cost      DECIMAL(15, 2) NOT NULL DEFAULT 0, -- sum of refund line costs (COGS reversed)
  status          VARCHAR(20) NOT NULL DEFAULT 'COMPLETED'
                    CHECK (status IN ('COMPLETED', 'CANCELLED')),
  gl_transaction_id UUID,                             -- link to reversal GL transaction
  created_by_id   UUID NOT NULL REFERENCES users(id),
  approved_by_id  UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sale_refunds_sale_id ON sale_refunds(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_refunds_refund_number ON sale_refunds(refund_number);
CREATE INDEX IF NOT EXISTS idx_sale_refunds_created_at ON sale_refunds(created_at);

COMMENT ON TABLE sale_refunds IS
  'Immutable refund documents. Each row represents one refund event against a sale.';

-- 3. Refund line items (one per original sale_item being refunded)
CREATE TABLE IF NOT EXISTS sale_refund_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id       UUID NOT NULL REFERENCES sale_refunds(id) ON DELETE CASCADE,
  sale_item_id    UUID NOT NULL REFERENCES sale_items(id),
  product_id      UUID REFERENCES products(id),
  batch_id        UUID REFERENCES inventory_batches(id),
  quantity        DECIMAL(15, 4) NOT NULL CHECK (quantity > 0),
  unit_price      DECIMAL(15, 2) NOT NULL,  -- original selling price
  unit_cost       DECIMAL(15, 2) NOT NULL,  -- original cost (for accurate COGS reversal)
  line_total      DECIMAL(15, 2) NOT NULL,  -- quantity * unit_price (revenue to reverse)
  cost_total      DECIMAL(15, 2) NOT NULL,  -- quantity * unit_cost  (COGS to reverse)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sale_refund_items_refund_id ON sale_refund_items(refund_id);
CREATE INDEX IF NOT EXISTS idx_sale_refund_items_sale_item_id ON sale_refund_items(sale_item_id);

COMMENT ON TABLE sale_refund_items IS
  'Refund line items with original cost data for FIFO-accurate GL reversal.';

-- 4. Immutability is enforced in the SERVICE LAYER (salesService.refundSale).
--    Database is passive storage only — no triggers, no generated columns.
--    The service validates sale status (COMPLETED only) and prevents
--    modification of completed refund documents via business logic guards.

-- 5. Refund number generation helper (advisory lock pattern)
--    Application layer generates the number, but add a unique index for safety.
--    Pattern: REF-YYYY-NNNN

-- 6. Add sales.refund permission for RBAC (only if rbac tables exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rbac_permissions') THEN
    INSERT INTO rbac_permissions (key, module, action, description)
    VALUES ('sales.refund', 'sales', 'refund', 'Refund completed sales')
    ON CONFLICT (key) DO NOTHING;

    -- Grant to ADMIN and MANAGER roles (seeded roles)
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT r.id, 'sales.refund', '00000000-0000-0000-0000-000000000000'
    FROM rbac_roles r
    WHERE r.name IN ('admin', 'manager')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

COMMIT;
