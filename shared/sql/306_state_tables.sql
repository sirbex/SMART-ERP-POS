-- ============================================================
-- 306: SAP-Style State Tables (Write-Time Aggregation)
-- ============================================================
-- Architecture: "Transaction tables are history. State tables are reality.
--               Reports read reality."
--
-- These tables are maintained ATOMICALLY inside posting transactions
-- via ON CONFLICT DO UPDATE with additive math. Never read from
-- transactional tables (sales, sale_items, stock_movements) for reports.
--
-- Existing state table (already created in 254):
--   sales_daily_summary  PK(sale_date, payment_method)
--
-- New state tables created here:
--   product_daily_summary  PK(business_date, product_id)
--   customer_balances      PK(customer_id)
--   supplier_balances      PK(supplier_id)
--   inventory_balances     PK(product_id)
-- ============================================================

-- ============================================================
-- 1. product_daily_summary — Per-product per-day sales rollup
-- Updated by: salesService.createSale(), salesService.voidSale()
-- ============================================================
CREATE TABLE IF NOT EXISTS product_daily_summary (
    business_date     DATE          NOT NULL,
    product_id        UUID          NOT NULL REFERENCES products(id),
    category          VARCHAR(255)  NOT NULL DEFAULT 'Uncategorized',
    units_sold        NUMERIC(15,4) NOT NULL DEFAULT 0,
    revenue           NUMERIC(15,2) NOT NULL DEFAULT 0,
    cost_of_goods     NUMERIC(15,2) NOT NULL DEFAULT 0,
    gross_profit      NUMERIC(15,2) NOT NULL DEFAULT 0,
    discount_given    NUMERIC(15,2) NOT NULL DEFAULT 0,
    transaction_count INTEGER       NOT NULL DEFAULT 0,
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    PRIMARY KEY (business_date, product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_daily_summary_date
    ON product_daily_summary (business_date);
CREATE INDEX IF NOT EXISTS idx_product_daily_summary_product
    ON product_daily_summary (product_id);
CREATE INDEX IF NOT EXISTS idx_product_daily_summary_category
    ON product_daily_summary (category);

-- ============================================================
-- 2. customer_balances — Real-time AR state per customer
-- Updated by: salesService.createSale() (credit), paymentsService
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_balances (
    customer_id       UUID          NOT NULL REFERENCES customers(id),
    total_invoiced    NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_paid        NUMERIC(15,2) NOT NULL DEFAULT 0,
    balance           NUMERIC(15,2) NOT NULL DEFAULT 0,
    last_invoice_date DATE,
    last_payment_date DATE,
    transaction_count INTEGER       NOT NULL DEFAULT 0,
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    PRIMARY KEY (customer_id)
);

-- ============================================================
-- 3. supplier_balances — Real-time AP state per supplier
-- Updated by: goodsReceiptService.finalizeGR(), supplier payments
-- ============================================================
CREATE TABLE IF NOT EXISTS supplier_balances (
    supplier_id       UUID          NOT NULL REFERENCES suppliers("Id"),
    total_invoiced    NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_paid        NUMERIC(15,2) NOT NULL DEFAULT 0,
    balance           NUMERIC(15,2) NOT NULL DEFAULT 0,
    last_gr_date      DATE,
    last_payment_date DATE,
    transaction_count INTEGER       NOT NULL DEFAULT 0,
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    PRIMARY KEY (supplier_id)
);

-- ============================================================
-- 4. inventory_balances — Real-time stock state per product
-- Updated by: salesService (decrease), goodsReceiptService (increase),
--             stock adjustments (increase/decrease)
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_balances (
    product_id        UUID          NOT NULL REFERENCES products(id),
    quantity_on_hand  NUMERIC(15,4) NOT NULL DEFAULT 0,
    total_received    NUMERIC(15,4) NOT NULL DEFAULT 0,
    total_sold        NUMERIC(15,4) NOT NULL DEFAULT 0,
    total_adjusted    NUMERIC(15,4) NOT NULL DEFAULT 0,
    last_movement_date DATE,
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    PRIMARY KEY (product_id)
);

-- ============================================================
-- BACKFILL: product_daily_summary from existing sale_items + sales
-- ============================================================
INSERT INTO product_daily_summary (
    business_date, product_id, category,
    units_sold, revenue, cost_of_goods, gross_profit, discount_given,
    transaction_count, updated_at
)
SELECT
    s.sale_date                                           AS business_date,
    si.product_id,
    COALESCE(NULLIF(TRIM(p.category), ''), 'Uncategorized') AS category,
    COALESCE(SUM(si.quantity), 0)                          AS units_sold,
    COALESCE(SUM(si.total_price), 0)                       AS revenue,
    COALESCE(SUM(si.unit_cost * si.quantity), 0)           AS cost_of_goods,
    COALESCE(SUM(si.total_price - si.unit_cost * si.quantity), 0) AS gross_profit,
    COALESCE(SUM(si.discount_amount), 0)                   AS discount_given,
    COUNT(DISTINCT s.id)::INTEGER                          AS transaction_count,
    NOW()
FROM sales s
JOIN sale_items si ON si.sale_id = s.id
JOIN products p ON p.id = si.product_id
WHERE s.status = 'COMPLETED'
  AND si.product_id IS NOT NULL
GROUP BY s.sale_date, si.product_id, COALESCE(NULLIF(TRIM(p.category), ''), 'Uncategorized')
ON CONFLICT (business_date, product_id) DO UPDATE SET
    category          = EXCLUDED.category,
    units_sold        = EXCLUDED.units_sold,
    revenue           = EXCLUDED.revenue,
    cost_of_goods     = EXCLUDED.cost_of_goods,
    gross_profit      = EXCLUDED.gross_profit,
    discount_given    = EXCLUDED.discount_given,
    transaction_count = EXCLUDED.transaction_count,
    updated_at        = NOW();

-- ============================================================
-- BACKFILL: customer_balances from invoices + credit_transactions
-- Handles dual schema: legacy PascalCase (henber) and snake_case (newer tenants)
-- ============================================================
DO $$
DECLARE
    pascal_invoices boolean;
BEGIN
    -- Detect invoice column naming convention
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'invoices'
          AND column_name  = 'TotalAmount'
    ) INTO pascal_invoices;

    IF pascal_invoices THEN
        -- Legacy PascalCase schema (e.g. henber)
        INSERT INTO customer_balances (
            customer_id, total_invoiced, total_paid, balance,
            last_invoice_date, last_payment_date, transaction_count, updated_at
        )
        SELECT
            c.id AS customer_id,
            COALESCE(inv.total_invoiced, 0)     AS total_invoiced,
            COALESCE(pay.total_paid, 0)         AS total_paid,
            c.balance                           AS balance,
            inv.last_invoice_date,
            pay.last_payment_date,
            COALESCE(inv.inv_count, 0) + COALESCE(pay.pay_count, 0) AS transaction_count,
            NOW()
        FROM customers c
        LEFT JOIN LATERAL (
            SELECT
                SUM("TotalAmount") AS total_invoiced,
                MAX(issue_date)    AS last_invoice_date,
                COUNT(*)::INTEGER  AS inv_count
            FROM invoices
            WHERE "CustomerId" = c.id
              AND "Status" NOT IN ('Cancelled', 'Voided', 'Draft')
        ) inv ON true
        LEFT JOIN LATERAL (
            SELECT
                SUM(ABS(amount)) AS total_paid,
                MAX(created_at::date) AS last_payment_date,
                COUNT(*)::INTEGER AS pay_count
            FROM credit_transactions
            WHERE customer_id = c.id
              AND transaction_type = 'PAYMENT'
        ) pay ON true
        WHERE c.is_active = true
        ON CONFLICT (customer_id) DO UPDATE SET
            total_invoiced    = EXCLUDED.total_invoiced,
            total_paid        = EXCLUDED.total_paid,
            balance           = EXCLUDED.balance,
            last_invoice_date = EXCLUDED.last_invoice_date,
            last_payment_date = EXCLUDED.last_payment_date,
            transaction_count = EXCLUDED.transaction_count,
            updated_at        = NOW();
    ELSE
        -- snake_case schema (newer tenants)
        INSERT INTO customer_balances (
            customer_id, total_invoiced, total_paid, balance,
            last_invoice_date, last_payment_date, transaction_count, updated_at
        )
        SELECT
            c.id AS customer_id,
            COALESCE(inv.total_invoiced, 0)     AS total_invoiced,
            COALESCE(pay.total_paid, 0)         AS total_paid,
            c.balance                           AS balance,
            inv.last_invoice_date,
            pay.last_payment_date,
            COALESCE(inv.inv_count, 0) + COALESCE(pay.pay_count, 0) AS transaction_count,
            NOW()
        FROM customers c
        LEFT JOIN LATERAL (
            SELECT
                SUM(total_amount)       AS total_invoiced,
                MAX(issue_date::date)   AS last_invoice_date,
                COUNT(*)::INTEGER       AS inv_count
            FROM invoices
            WHERE customer_id = c.id
              AND status NOT IN ('Cancelled', 'Voided', 'Draft', 'CANCELLED', 'VOIDED', 'DRAFT')
        ) inv ON true
        LEFT JOIN LATERAL (
            SELECT
                SUM(ABS(amount)) AS total_paid,
                MAX(created_at::date) AS last_payment_date,
                COUNT(*)::INTEGER AS pay_count
            FROM credit_transactions
            WHERE customer_id = c.id
              AND transaction_type = 'PAYMENT'
        ) pay ON true
        WHERE c.is_active = true
        ON CONFLICT (customer_id) DO UPDATE SET
            total_invoiced    = EXCLUDED.total_invoiced,
            total_paid        = EXCLUDED.total_paid,
            balance           = EXCLUDED.balance,
            last_invoice_date = EXCLUDED.last_invoice_date,
            last_payment_date = EXCLUDED.last_payment_date,
            transaction_count = EXCLUDED.transaction_count,
            updated_at        = NOW();
    END IF;
END $$;

-- ============================================================
-- BACKFILL: supplier_balances from GR + supplier payments
-- ============================================================
INSERT INTO supplier_balances (
    supplier_id, total_invoiced, total_paid, balance,
    last_gr_date, last_payment_date, transaction_count, updated_at
)
SELECT
    s."Id" AS supplier_id,
    COALESCE(gr_totals.total_invoiced, 0)  AS total_invoiced,
    COALESCE(pay_totals.total_paid, 0)     AS total_paid,
    COALESCE(s."OutstandingBalance", 0)    AS balance,
    gr_totals.last_gr_date,
    pay_totals.last_payment_date,
    COALESCE(gr_totals.gr_count, 0) + COALESCE(pay_totals.pay_count, 0) AS transaction_count,
    NOW()
FROM suppliers s
LEFT JOIN LATERAL (
    SELECT
        SUM(gri.received_quantity * gri.cost_price) AS total_invoiced,
        MAX(gr.received_date::date)                 AS last_gr_date,
        COUNT(DISTINCT gr.id)::INTEGER              AS gr_count
    FROM goods_receipt_items gri
    JOIN goods_receipts gr ON gr.id = gri.goods_receipt_id
    JOIN purchase_orders po ON gr.purchase_order_id = po.id
    WHERE po.supplier_id = s."Id"
      AND gr.status = 'COMPLETED'
      AND (gri.is_bonus = false OR gri.is_bonus IS NULL)
) gr_totals ON true
LEFT JOIN LATERAL (
    SELECT
        SUM("Amount")              AS total_paid,
        MAX("PaymentDate"::date)   AS last_payment_date,
        COUNT(*)::INTEGER          AS pay_count
    FROM supplier_payments
    WHERE "SupplierId" = s."Id"
      AND "Status" = 'COMPLETED'
) pay_totals ON true
WHERE s."IsActive" = true
ON CONFLICT (supplier_id) DO UPDATE SET
    total_invoiced    = EXCLUDED.total_invoiced,
    total_paid        = EXCLUDED.total_paid,
    balance           = EXCLUDED.balance,
    last_gr_date      = EXCLUDED.last_gr_date,
    last_payment_date = EXCLUDED.last_payment_date,
    transaction_count = EXCLUDED.transaction_count,
    updated_at        = NOW();

-- ============================================================
-- BACKFILL: inventory_balances from batch/movement aggregates
-- ============================================================
INSERT INTO inventory_balances (
    product_id, quantity_on_hand, total_received, total_sold,
    total_adjusted, last_movement_date, updated_at
)
SELECT
    p.id AS product_id,
    COALESCE(p.quantity_on_hand, 0)          AS quantity_on_hand,
    COALESCE(recv.total_received, 0)         AS total_received,
    COALESCE(sold.total_sold, 0)             AS total_sold,
    COALESCE(adj.total_adjusted, 0)          AS total_adjusted,
    GREATEST(recv.last_recv, sold.last_sold, adj.last_adj) AS last_movement_date,
    NOW()
FROM products p
LEFT JOIN LATERAL (
    SELECT
        SUM(sm.quantity) AS total_received,
        MAX(sm.created_at::date) AS last_recv
    FROM stock_movements sm
    WHERE sm.product_id = p.id
      AND sm.movement_type::text IN ('GOODS_RECEIPT', 'RETURN_IN', 'ADJUSTMENT_IN')
) recv ON true
LEFT JOIN LATERAL (
    SELECT
        SUM(sm.quantity) AS total_sold,
        MAX(sm.created_at::date) AS last_sold
    FROM stock_movements sm
    WHERE sm.product_id = p.id
      AND sm.movement_type::text IN ('SALE', 'RETURN_OUT')
) sold ON true
LEFT JOIN LATERAL (
    SELECT
        SUM(CASE
            WHEN sm.movement_type::text IN ('ADJUSTMENT_IN', 'COUNT_GAIN') THEN sm.quantity
            WHEN sm.movement_type::text IN ('ADJUSTMENT_OUT', 'COUNT_LOSS', 'DAMAGE', 'EXPIRED') THEN -sm.quantity
            ELSE 0
        END) AS total_adjusted,
        MAX(sm.created_at::date) AS last_adj
    FROM stock_movements sm
    WHERE sm.product_id = p.id
      AND sm.movement_type::text IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'COUNT_GAIN', 'COUNT_LOSS', 'DAMAGE', 'EXPIRED')
) adj ON true
ON CONFLICT (product_id) DO UPDATE SET
    quantity_on_hand   = EXCLUDED.quantity_on_hand,
    total_received     = EXCLUDED.total_received,
    total_sold         = EXCLUDED.total_sold,
    total_adjusted     = EXCLUDED.total_adjusted,
    last_movement_date = EXCLUDED.last_movement_date,
    updated_at         = NOW();
