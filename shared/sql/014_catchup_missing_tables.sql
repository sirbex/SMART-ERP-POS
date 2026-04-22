-- ============================================================
-- CATCH-UP MIGRATION: Missing Tables from Production
-- Applied to: all tenant DBs
-- Tables created:
--   1. down_payment_clearings  (SAP-style clearing bridge)
--   2. dist_sales_orders       (Distribution module)
--   3. dist_sales_order_lines
--   4. dist_deliveries
--   5. dist_delivery_lines
--   6. dist_invoices
--   7. dist_invoice_lines
--   8. dist_receipts
--   9. dist_down_payment_clearings
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. Down Payment Clearings
--    Links pos_customer_deposits to invoices (SAP clearing)
--    Source: shared/sql/400_down_payment_clearings.sql
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS down_payment_clearings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clearing_number VARCHAR(50) UNIQUE NOT NULL,           -- CLR-2026-0001
    down_payment_id UUID NOT NULL REFERENCES pos_customer_deposits(id),
    invoice_id UUID NOT NULL REFERENCES invoices("Id"),
    amount NUMERIC(15, 2) NOT NULL,
    cleared_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_clearing_amount_positive CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_dpc_down_payment_id ON down_payment_clearings(down_payment_id);
CREATE INDEX IF NOT EXISTS idx_dpc_invoice_id      ON down_payment_clearings(invoice_id);
CREATE INDEX IF NOT EXISTS idx_dpc_clearing_number ON down_payment_clearings(clearing_number);

CREATE SEQUENCE IF NOT EXISTS clearing_number_seq START 1;

-- ────────────────────────────────────────────────────────────
-- 2. Distribution Module Tables
--    Sales Order → Delivery → Invoice → Clearing/Payment
--    Source: database/migrations/022_distribution_module.sql
-- ────────────────────────────────────────────────────────────

-- ── Sales Orders ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dist_sales_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id),
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN','PARTIALLY_DELIVERED','FULLY_DELIVERED','CLOSED','CANCELLED')),
    order_date DATE NOT NULL,
    notes TEXT,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dist_so_customer ON dist_sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_dist_so_status   ON dist_sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_dist_so_number   ON dist_sales_orders(order_number);

-- ── Sales Order Lines ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dist_sales_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_order_id UUID NOT NULL REFERENCES dist_sales_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    ordered_qty DECIMAL(12,3) NOT NULL CHECK (ordered_qty > 0),
    confirmed_qty DECIMAL(12,3) NOT NULL DEFAULT 0 CHECK (confirmed_qty >= 0),
    delivered_qty DECIMAL(12,3) NOT NULL DEFAULT 0 CHECK (delivered_qty >= 0),
    open_qty DECIMAL(12,3) NOT NULL DEFAULT 0 CHECK (open_qty >= 0),
    unit_price DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
    line_total DECIMAL(14,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dist_sol_order   ON dist_sales_order_lines(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_dist_sol_product ON dist_sales_order_lines(product_id);

-- ── Deliveries ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dist_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_number VARCHAR(50) UNIQUE NOT NULL,
    sales_order_id UUID NOT NULL REFERENCES dist_sales_orders(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT','POSTED','CANCELLED')),
    delivery_date DATE NOT NULL,
    notes TEXT,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dist_del_order    ON dist_deliveries(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_dist_del_customer ON dist_deliveries(customer_id);
CREATE INDEX IF NOT EXISTS idx_dist_del_status   ON dist_deliveries(status);

-- ── Delivery Lines ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dist_delivery_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id UUID NOT NULL REFERENCES dist_deliveries(id) ON DELETE CASCADE,
    sales_order_line_id UUID NOT NULL REFERENCES dist_sales_order_lines(id),
    product_id UUID NOT NULL REFERENCES products(id),
    quantity DECIMAL(12,3) NOT NULL CHECK (quantity > 0),
    unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dist_dll_delivery ON dist_delivery_lines(delivery_id);

-- ── Distribution Invoices ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS dist_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    sales_order_id UUID NOT NULL REFERENCES dist_sales_orders(id),
    delivery_id UUID NOT NULL REFERENCES dist_deliveries(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    total_amount DECIMAL(14,2) NOT NULL CHECK (total_amount >= 0),
    amount_paid DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    amount_due DECIMAL(14,2) NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN','PARTIALLY_PAID','PAID','CANCELLED')),
    issue_date DATE NOT NULL,
    due_date DATE,
    notes TEXT,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dist_inv_customer ON dist_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_dist_inv_order    ON dist_invoices(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_dist_inv_delivery ON dist_invoices(delivery_id);
CREATE INDEX IF NOT EXISTS idx_dist_inv_status   ON dist_invoices(status);

-- ── Distribution Invoice Lines ────────────────────────────────

CREATE TABLE IF NOT EXISTS dist_invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES dist_invoices(id) ON DELETE CASCADE,
    delivery_line_id UUID NOT NULL REFERENCES dist_delivery_lines(id),
    product_id UUID NOT NULL REFERENCES products(id),
    quantity DECIMAL(12,3) NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(12,2) NOT NULL,
    line_total DECIMAL(14,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dist_il_invoice ON dist_invoice_lines(invoice_id);

-- ── Distribution Receipts ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS dist_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number VARCHAR(50) UNIQUE NOT NULL,
    invoice_id UUID NOT NULL REFERENCES dist_invoices(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    amount DECIMAL(14,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(30) NOT NULL
        CHECK (payment_method IN ('CASH','CARD','MOBILE_MONEY','BANK_TRANSFER','DEPOSIT')),
    reference_number VARCHAR(100),
    receipt_date DATE NOT NULL,
    notes TEXT,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dist_rcpt_invoice  ON dist_receipts(invoice_id);
CREATE INDEX IF NOT EXISTS idx_dist_rcpt_customer ON dist_receipts(customer_id);

-- ── Distribution Down Payment Clearings ──────────────────────

CREATE TABLE IF NOT EXISTS dist_down_payment_clearings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clearing_number VARCHAR(50) UNIQUE NOT NULL,
    invoice_id UUID NOT NULL REFERENCES dist_invoices(id),
    down_payment_id UUID NOT NULL REFERENCES pos_customer_deposits(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    amount DECIMAL(14,2) NOT NULL CHECK (amount > 0),
    cleared_by UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dist_dpc_invoice  ON dist_down_payment_clearings(invoice_id);
CREATE INDEX IF NOT EXISTS idx_dist_dpc_deposit  ON dist_down_payment_clearings(down_payment_id);
CREATE INDEX IF NOT EXISTS idx_dist_dpc_customer ON dist_down_payment_clearings(customer_id);

COMMIT;
