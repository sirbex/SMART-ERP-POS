-- Three-way inventory reconciliation (corrected schema names)
SELECT
  (SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
     FROM ledger_entries le
     JOIN ledger_transactions lt ON le."TransactionId"=lt."Id"
     JOIN accounts a ON le."AccountId"=a."Id"
     WHERE a."AccountCode"='1300' AND lt."IsReversed"=FALSE) AS gl_inventory_balance,
  (SELECT COALESCE(ROUND(SUM(cl.remaining_quantity*cl.unit_cost)::numeric,2),0)
     FROM cost_layers cl
     WHERE cl.remaining_quantity>0) AS cost_layers_total,
  (SELECT COALESCE(ROUND(SUM(pi.quantity_on_hand*COALESCE(pv.average_cost,0))::numeric,2),0)
     FROM product_inventory pi
     LEFT JOIN product_valuation pv ON pv.product_id=pi.product_id
     WHERE pi.quantity_on_hand>0) AS subledger_avco;

-- Current report filter effect
SELECT
  (SELECT COALESCE(ROUND(SUM(cl.remaining_quantity*cl.unit_cost)::numeric,2),0)
     FROM cost_layers cl
     JOIN products p ON p.id=cl.product_id
     WHERE cl.is_active=true AND cl.remaining_quantity>0
       AND p.is_active=true) AS report_shows_active_product,
  (SELECT COALESCE(ROUND(SUM(cl.remaining_quantity*cl.unit_cost)::numeric,2),0)
     FROM cost_layers cl
     JOIN products p ON p.id=cl.product_id
     WHERE cl.is_active=true AND cl.remaining_quantity>0
       AND p.is_active=false) AS hidden_by_inactive_product,
  (SELECT COUNT(*) FROM cost_layers WHERE remaining_quantity>0 AND is_active=false) AS inactive_layers_with_stock;

-- Cost layers vs product_inventory per-product drift (top 5)
SELECT p.name, p.sku,
  pi.quantity_on_hand AS qty_subledger,
  COALESCE(cl_sum.qty,0) AS qty_cost_layers,
  (pi.quantity_on_hand - COALESCE(cl_sum.qty,0)) AS drift_qty
FROM product_inventory pi
JOIN products p ON p.id=pi.product_id
LEFT JOIN (
  SELECT product_id, SUM(remaining_quantity) AS qty
  FROM cost_layers WHERE remaining_quantity>0 GROUP BY product_id
) cl_sum ON cl_sum.product_id=pi.product_id
WHERE ABS(pi.quantity_on_hand - COALESCE(cl_sum.qty,0)) > 0.001
ORDER BY ABS(pi.quantity_on_hand - COALESCE(cl_sum.qty,0)) DESC
LIMIT 5;
-- Three-way inventory reconciliation (corrected schema names)
SELECT
  (SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
     FROM ledger_entries le
     JOIN ledger_transactions lt ON le."TransactionId"=lt."Id"
     JOIN accounts a ON le."AccountId"=a."Id"
     WHERE a."AccountCode"='1300' AND lt."IsReversed"=FALSE) AS gl_inventory_balance,
  (SELECT COALESCE(ROUND(SUM(cl.remaining_quantity*cl.unit_cost)::numeric,2),0)
     FROM cost_layers cl
     WHERE cl.remaining_quantity>0) AS cost_layers_total,
  (SELECT COALESCE(ROUND(SUM(pi.quantity_on_hand*COALESCE(pv.average_cost,0))::numeric,2),0)
     FROM product_inventory pi
     LEFT JOIN product_valuation pv ON pv.product_id=pi.product_id
     WHERE pi.quantity_on_hand>0) AS subledger_avco;

-- Report filter effect
SELECT
  (SELECT COALESCE(ROUND(SUM(cl.remaining_quantity*cl.unit_cost)::numeric,2),0)
     FROM cost_layers cl
     JOIN products p ON p.id=cl.product_id
     WHERE cl.is_active=true AND cl.remaining_quantity>0
       AND p.is_active=true) AS report_active_only,
  (SELECT COALESCE(ROUND(SUM(cl.remaining_quantity*cl.unit_cost)::numeric,2),0)
     FROM cost_layers cl
     JOIN products p ON p.id=cl.product_id
     WHERE cl.is_active=true AND cl.remaining_quantity>0
       AND p.is_active=false) AS hidden_inactive_products,
  (SELECT COUNT(*) FROM cost_layers WHERE remaining_quantity>0 AND is_active=false) AS inactive_layers_with_stock;

-- Per-product drift (top 5)
SELECT p.name, p.sku,
  pi.quantity_on_hand AS qty_subledger,
  COALESCE(cl_sum.qty,0) AS qty_cost_layers,
  (pi.quantity_on_hand - COALESCE(cl_sum.qty,0)) AS drift_qty
FROM product_inventory pi
JOIN products p ON p.id=pi.product_id
LEFT JOIN (
  SELECT product_id, SUM(remaining_quantity) AS qty
  FROM cost_layers WHERE remaining_quantity>0 GROUP BY product_id
) cl_sum ON cl_sum.product_id=pi.product_id
WHERE ABS(pi.quantity_on_hand - COALESCE(cl_sum.qty,0)) > 0.001
ORDER BY ABS(pi.quantity_on_hand - COALESCE(cl_sum.qty,0)) DESC
LIMIT 5;
-- Three-way inventory reconciliation
SELECT
  (SELECT COALESCE(SUM(CASE WHEN a."AccountType"='ASSET' THEN gl."DebitAmount"-gl."CreditAmount" ELSE 0 END),0)
     FROM "GLEntries" gl JOIN "Accounts" a ON a."Id"=gl."AccountId"
     WHERE a."AccountCode"='1300') AS gl_inventory_balance,
  (SELECT COALESCE(ROUND(SUM(cl.remaining_quantity*cl.unit_cost)::numeric,2),0)
     FROM cost_layers cl
     WHERE cl.is_active=true AND cl.remaining_quantity>0) AS cost_layers_total,
  (SELECT COALESCE(ROUND(SUM(pi.quantity_on_hand*COALESCE(pv.average_cost,0))::numeric,2),0)
     FROM product_inventory pi
     LEFT JOIN product_valuation pv ON pv.product_id=pi.product_id
     WHERE pi.quantity_on_hand>0) AS subledger_avco;

-- Impact of current report filter: p.is_active = true
SELECT
  (SELECT COALESCE(ROUND(SUM(cl.remaining_quantity*cl.unit_cost)::numeric,2),0)
     FROM cost_layers cl
     JOIN products p ON p.id=cl.product_id
     WHERE cl.is_active=true AND cl.remaining_quantity>0
       AND p.is_active=true) AS report_shows,
  (SELECT COALESCE(ROUND(SUM(cl.remaining_quantity*cl.unit_cost)::numeric,2),0)
     FROM cost_layers cl
     JOIN products p ON p.id=cl.product_id
     WHERE cl.is_active=true AND cl.remaining_quantity>0
       AND p.is_active=false) AS hidden_by_inactive_product;
