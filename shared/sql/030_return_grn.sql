-- Migration 030: Return GRN (RGRN) tables
-- Allows returning goods to suppliers (stock document only, no GL)
-- Follows SAP/Odoo pattern: RGRN reduces stock, Supplier Credit Note handles accounting

-- ============================================================
-- 0. Add SUPPLIER_RETURN to movement_type enum
-- ============================================================
ALTER TYPE movement_type ADD VALUE IF NOT EXISTS 'SUPPLIER_RETURN';

-- ============================================================
-- 1. return_grn header table
-- ============================================================
CREATE TABLE IF NOT EXISTS return_grn (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_grn_number VARCHAR(50) UNIQUE NOT NULL,
    grn_id          UUID NOT NULL REFERENCES goods_receipts(id),
    supplier_id     UUID NOT NULL REFERENCES suppliers("Id"),
    return_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT', 'POSTED')),
    reason          TEXT NOT NULL,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_return_grn_grn_id ON return_grn(grn_id);
CREATE INDEX idx_return_grn_supplier ON return_grn(supplier_id);
CREATE INDEX idx_return_grn_status ON return_grn(status);

-- ============================================================
-- 2. return_grn_lines table
-- ============================================================
CREATE TABLE IF NOT EXISTS return_grn_lines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rgrn_id         UUID NOT NULL REFERENCES return_grn(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id),
    batch_id        UUID REFERENCES inventory_batches(id),
    uom_id          UUID REFERENCES uoms(id),
    quantity        DECIMAL(15, 4) NOT NULL CHECK (quantity > 0),
    base_quantity   DECIMAL(15, 4) NOT NULL CHECK (base_quantity > 0),
    unit_cost       DECIMAL(15, 2) NOT NULL DEFAULT 0,
    line_total      DECIMAL(15, 2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_return_grn_lines_rgrn ON return_grn_lines(rgrn_id);
CREATE INDEX idx_return_grn_lines_product ON return_grn_lines(product_id);
CREATE INDEX idx_return_grn_lines_batch ON return_grn_lines(batch_id);

-- ============================================================
-- 3. Add return_grn_id to supplier credit notes for linkage
-- ============================================================
ALTER TABLE supplier_invoices
    ADD COLUMN IF NOT EXISTS return_grn_id UUID REFERENCES return_grn(id);
