-- Migration 540: P&L profitability by category (products nested under category)
-- products.category is VARCHAR; empty → Uncategorized

CREATE OR REPLACE FUNCTION fn_get_profit_loss_by_category(
    p_date_from DATE,
    p_date_to DATE
)
RETURNS TABLE (
    category_name VARCHAR(255),
    product_id UUID,
    product_name VARCHAR(255),
    product_sku VARCHAR(50),
    total_revenue NUMERIC(18,6),
    total_cogs NUMERIC(18,6),
    gross_profit NUMERIC(18,6),
    gross_margin_percent NUMERIC(10,4),
    quantity_sold NUMERIC(18,6)
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH product_sales AS (
        SELECT
            si.product_id,
            SUM(si.quantity * si.unit_price) as revenue,
            SUM(si.quantity * COALESCE(si.unit_cost, p.cost_price, 0)) as cogs,
            SUM(si.quantity) as qty_sold
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN products p ON si.product_id = p.id
        WHERE s.sale_date >= p_date_from
          AND s.sale_date <= p_date_to
          AND s.status = 'COMPLETED'
        GROUP BY si.product_id
    )
    SELECT
        COALESCE(NULLIF(TRIM(p.category), ''), 'Uncategorized')::VARCHAR(255) as category_name,
        ps.product_id,
        p.name::VARCHAR(255) as product_name,
        COALESCE(p.sku, p.barcode, '')::VARCHAR(50) as product_sku,
        ps.revenue as total_revenue,
        ps.cogs as total_cogs,
        ps.revenue - ps.cogs as gross_profit,
        CASE WHEN ps.revenue > 0
            THEN ROUND(((ps.revenue - ps.cogs) / ps.revenue) * 100, 4)
            ELSE 0
        END as gross_margin_percent,
        ps.qty_sold as quantity_sold
    FROM product_sales ps
    JOIN products p ON p.id = ps.product_id
    WHERE ps.revenue > 0 OR ps.cogs > 0
    ORDER BY 1 ASC, (ps.revenue - ps.cogs) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_get_profit_loss_by_category(DATE, DATE) TO PUBLIC;

INSERT INTO schema_version (version) VALUES (540)
ON CONFLICT DO NOTHING;
