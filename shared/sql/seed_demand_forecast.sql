-- Initial seed: run demand forecast learning cycle 1
-- Daily stats refresh
INSERT INTO product_demand_stats (
  product_id, avg_daily_7d, avg_daily_30d, avg_daily_90d,
  std_dev_daily, demand_trend, trend_strength,
  computed_safety_stock, computed_reorder_point,
  forecast_30d, last_updated_at, learning_cycles
)
SELECT
  p.id,
  -- 7-day average
  COALESCE((SELECT SUM(si.quantity) FROM sale_items si INNER JOIN sales s ON s.id=si.sale_id WHERE si.product_id=p.id AND s.sale_date>=CURRENT_DATE-7), 0) / 7.0,
  -- 30-day average
  COALESCE((SELECT SUM(si.quantity) FROM sale_items si INNER JOIN sales s ON s.id=si.sale_id WHERE si.product_id=p.id AND s.sale_date>=CURRENT_DATE-30), 0) / 30.0,
  -- 90-day average
  COALESCE((SELECT SUM(si.quantity) FROM sale_items si INNER JOIN sales s ON s.id=si.sale_id WHERE si.product_id=p.id AND s.sale_date>=CURRENT_DATE-90), 0) / 90.0,
  -- Std dev of daily sales
  COALESCE((SELECT STDDEV_POP(dq) FROM (SELECT COALESCE(SUM(si.quantity),0) AS dq FROM generate_series(CURRENT_DATE-INTERVAL '30 days',CURRENT_DATE-INTERVAL '1 day',INTERVAL '1 day') d(day) LEFT JOIN sale_items si ON si.product_id=p.id LEFT JOIN sales s ON s.id=si.sale_id AND s.sale_date=d.day::date GROUP BY d.day) x),0),
  -- Demand trend
  CASE WHEN COALESCE((SELECT SUM(si.quantity) FROM sale_items si INNER JOIN sales s ON s.id=si.sale_id WHERE si.product_id=p.id AND s.sale_date>=CURRENT_DATE-30),0)=0 THEN 'STABLE'
    WHEN (COALESCE((SELECT SUM(si.quantity) FROM sale_items si INNER JOIN sales s ON s.id=si.sale_id WHERE si.product_id=p.id AND s.sale_date>=CURRENT_DATE-7),0)/7.0) / NULLIF(COALESCE((SELECT SUM(si.quantity) FROM sale_items si INNER JOIN sales s ON s.id=si.sale_id WHERE si.product_id=p.id AND s.sale_date>=CURRENT_DATE-30),0)/30.0, 0) > 1.15 THEN 'INCREASING'
    WHEN (COALESCE((SELECT SUM(si.quantity) FROM sale_items si INNER JOIN sales s ON s.id=si.sale_id WHERE si.product_id=p.id AND s.sale_date>=CURRENT_DATE-7),0)/7.0) / NULLIF(COALESCE((SELECT SUM(si.quantity) FROM sale_items si INNER JOIN sales s ON s.id=si.sale_id WHERE si.product_id=p.id AND s.sale_date>=CURRENT_DATE-30),0)/30.0, 0) < 0.85 THEN 'DECREASING'
    ELSE 'STABLE' END,
  -- Trend strength
  COALESCE((COALESCE((SELECT SUM(si.quantity) FROM sale_items si INNER JOIN sales s ON s.id=si.sale_id WHERE si.product_id=p.id AND s.sale_date>=CURRENT_DATE-7),0)/7.0) / NULLIF(COALESCE((SELECT SUM(si.quantity) FROM sale_items si INNER JOIN sales s ON s.id=si.sale_id WHERE si.product_id=p.id AND s.sale_date>=CURRENT_DATE-30),0)/30.0, 0), 1.0),
  -- Safety stock: 1.65 * sigma * sqrt(lead_time)
  CEIL(1.65*COALESCE((SELECT STDDEV_POP(dq) FROM (SELECT COALESCE(SUM(si.quantity),0) AS dq FROM generate_series(CURRENT_DATE-INTERVAL '30 days',CURRENT_DATE-INTERVAL '1 day',INTERVAL '1 day') d(day) LEFT JOIN sale_items si ON si.product_id=p.id LEFT JOIN sales s ON s.id=si.sale_id AND s.sale_date=d.day::date GROUP BY d.day) x),0)*SQRT(COALESCE((SELECT s.lead_time_days FROM suppliers s INNER JOIN purchase_orders po ON po.supplier_id=s."Id" INNER JOIN goods_receipts gr ON gr.purchase_order_id=po.id INNER JOIN goods_receipt_items gri ON gri.goods_receipt_id=gr.id WHERE gri.product_id=p.id ORDER BY po.order_date DESC LIMIT 1),7))),
  -- Reorder point: blended velocity * lead_time + safety_stock
  CEIL((0.7*COALESCE((SELECT SUM(si.quantity) FROM sale_items si INNER JOIN sales s ON s.id=si.sale_id WHERE si.product_id=p.id AND s.sale_date>=CURRENT_DATE-30),0)/30.0+0.3*COALESCE((SELECT SUM(si.quantity) FROM sale_items si INNER JOIN sales s ON s.id=si.sale_id WHERE si.product_id=p.id AND s.sale_date>=CURRENT_DATE-7),0)/7.0)*COALESCE((SELECT s.lead_time_days FROM suppliers s INNER JOIN purchase_orders po ON po.supplier_id=s."Id" INNER JOIN goods_receipts gr ON gr.purchase_order_id=po.id INNER JOIN goods_receipt_items gri ON gri.goods_receipt_id=gr.id WHERE gri.product_id=p.id ORDER BY po.order_date DESC LIMIT 1),7)+CEIL(1.65*COALESCE((SELECT STDDEV_POP(dq) FROM (SELECT COALESCE(SUM(si.quantity),0) AS dq FROM generate_series(CURRENT_DATE-INTERVAL '30 days',CURRENT_DATE-INTERVAL '1 day',INTERVAL '1 day') d(day) LEFT JOIN sale_items si ON si.product_id=p.id LEFT JOIN sales s ON s.id=si.sale_id AND s.sale_date=d.day::date GROUP BY d.day) x),0)*SQRT(COALESCE((SELECT s.lead_time_days FROM suppliers s INNER JOIN purchase_orders po ON po.supplier_id=s."Id" INNER JOIN goods_receipts gr ON gr.purchase_order_id=po.id INNER JOIN goods_receipt_items gri ON gri.goods_receipt_id=gr.id WHERE gri.product_id=p.id ORDER BY po.order_date DESC LIMIT 1),7)))),
  -- Forecast 30d: 3-period moving average
  (COALESCE((SELECT SUM(si.quantity) FROM sale_items si INNER JOIN sales s ON s.id=si.sale_id WHERE si.product_id=p.id AND s.sale_date>=CURRENT_DATE-30),0)+COALESCE((SELECT SUM(si.quantity) FROM sale_items si INNER JOIN sales s ON s.id=si.sale_id WHERE si.product_id=p.id AND s.sale_date>=CURRENT_DATE-60 AND s.sale_date<CURRENT_DATE-30),0)+COALESCE((SELECT SUM(si.quantity) FROM sale_items si INNER JOIN sales s ON s.id=si.sale_id WHERE si.product_id=p.id AND s.sale_date>=CURRENT_DATE-90 AND s.sale_date<CURRENT_DATE-60),0))/3.0,
  NOW(), 1
FROM products p WHERE p.is_active=true
ON CONFLICT (product_id) DO UPDATE SET
  avg_daily_7d=EXCLUDED.avg_daily_7d, avg_daily_30d=EXCLUDED.avg_daily_30d, avg_daily_90d=EXCLUDED.avg_daily_90d,
  std_dev_daily=EXCLUDED.std_dev_daily, demand_trend=EXCLUDED.demand_trend, trend_strength=EXCLUDED.trend_strength,
  computed_safety_stock=EXCLUDED.computed_safety_stock, computed_reorder_point=EXCLUDED.computed_reorder_point,
  forecast_30d=EXCLUDED.forecast_30d, last_updated_at=NOW(),
  learning_cycles=product_demand_stats.learning_cycles+1;

-- Seasonality refresh
INSERT INTO product_seasonality (product_id, month, avg_daily_sales, total_units, sample_years, seasonal_index)
SELECT p.id, m.month,
  COALESCE((SELECT SUM(si.quantity)/NULLIF(COUNT(DISTINCT s.sale_date),0)
    FROM sale_items si INNER JOIN sales s ON s.id=si.sale_id
    WHERE si.product_id=p.id AND EXTRACT(MONTH FROM s.sale_date)=m.month), 0),
  COALESCE((SELECT SUM(si.quantity) FROM sale_items si INNER JOIN sales s ON s.id=si.sale_id
    WHERE si.product_id=p.id AND EXTRACT(MONTH FROM s.sale_date)=m.month), 0),
  COALESCE((SELECT COUNT(DISTINCT EXTRACT(YEAR FROM s.sale_date))
    FROM sale_items si INNER JOIN sales s ON s.id=si.sale_id
    WHERE si.product_id=p.id AND EXTRACT(MONTH FROM s.sale_date)=m.month), 0),
  CASE WHEN COALESCE((SELECT SUM(si2.quantity)/NULLIF(COUNT(DISTINCT s2.sale_date),0)
    FROM sale_items si2 INNER JOIN sales s2 ON s2.id=si2.sale_id WHERE si2.product_id=p.id), 0) = 0 THEN 1.0
  ELSE
    COALESCE((SELECT SUM(si.quantity)/NULLIF(COUNT(DISTINCT s.sale_date),0)
      FROM sale_items si INNER JOIN sales s ON s.id=si.sale_id
      WHERE si.product_id=p.id AND EXTRACT(MONTH FROM s.sale_date)=m.month), 0) /
    (SELECT SUM(si2.quantity)/NULLIF(COUNT(DISTINCT s2.sale_date),0)
      FROM sale_items si2 INNER JOIN sales s2 ON s2.id=si2.sale_id WHERE si2.product_id=p.id)
  END
FROM products p CROSS JOIN generate_series(1,12) AS m(month)
WHERE p.is_active = true
ON CONFLICT (product_id, month) DO UPDATE SET
  avg_daily_sales = EXCLUDED.avg_daily_sales,
  total_units = EXCLUDED.total_units,
  sample_years = EXCLUDED.sample_years,
  seasonal_index = EXCLUDED.seasonal_index,
  last_updated_at = NOW();

-- Log initial run
INSERT INTO demand_forecast_runs (run_type, products_updated, execution_time_ms, details)
VALUES ('DAILY', (SELECT COUNT(*) FROM product_demand_stats), 0, '{"source":"initial_seed"}');

-- Verify
SELECT 'product_demand_stats' AS tbl, COUNT(*) AS rows, SUM(learning_cycles) AS total_cycles FROM product_demand_stats
UNION ALL
SELECT 'product_seasonality', COUNT(*), NULL FROM product_seasonality;
