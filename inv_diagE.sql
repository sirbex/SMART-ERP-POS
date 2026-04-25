-- Check if SALE_COGS stock movements have batch_id set
-- This would explain why batch remaining > SM expected

-- 1. For SALE_COGS sales: do their stock movements have batch_id?
SELECT 
  CASE WHEN sm.batch_id IS NULL THEN 'No batch_id' ELSE 'Has batch_id' END AS batch_id_status,
  COUNT(*) AS sm_count,
  ROUND(SUM(sm.quantity * COALESCE(sm.unit_cost,0)), 2) AS total_cost
FROM sales s
JOIN ledger_transactions lt ON lt."ReferenceNumber" = s.sale_number
  AND lt."ReferenceType" = 'SALE_COGS'
JOIN stock_movements sm ON sm.reference_id = s.id AND sm.reference_type = 'SALE'
WHERE s.status = 'COMPLETED'
GROUP BY CASE WHEN sm.batch_id IS NULL THEN 'No batch_id' ELSE 'Has batch_id' END;

-- 2. For pre-SALE_COGS sales (SALE ref type): do their stock movements have batch_id?
WITH sale_cogs_sales AS (
  SELECT DISTINCT lt."ReferenceNumber" AS sale_number
  FROM ledger_transactions lt
  WHERE lt."ReferenceType" = 'SALE_COGS'
)
SELECT 
  CASE WHEN sm.batch_id IS NULL THEN 'No batch_id' ELSE 'Has batch_id' END AS batch_id_status,
  COUNT(*) AS sm_count,
  ROUND(SUM(sm.quantity * COALESCE(sm.unit_cost,0)), 2) AS total_cost
FROM stock_movements sm
JOIN sales s ON s.id = sm.reference_id AND sm.reference_type = 'SALE'
WHERE s.sale_number NOT IN (SELECT sale_number FROM sale_cogs_sales)
  AND s.status = 'COMPLETED'
GROUP BY CASE WHEN sm.batch_id IS NULL THEN 'No batch_id' ELSE 'Has batch_id' END;

-- 3. If batch_id IS NULL in SM, those batches were NOT reduced.
-- Quantify: batch remaining NOT reduced for SALE_COGS sales
SELECT 
  ROUND(SUM(sm.quantity * COALESCE(sm.unit_cost,0)), 2) AS unreduced_batch_cost
FROM sales s
JOIN ledger_transactions lt ON lt."ReferenceNumber" = s.sale_number
  AND lt."ReferenceType" = 'SALE_COGS'
JOIN stock_movements sm ON sm.reference_id = s.id AND sm.reference_type = 'SALE'
WHERE s.status = 'COMPLETED'
  AND sm.batch_id IS NULL;

-- 4. Per-sale GL vs SM comparison (properly aggregated)
WITH sm_totals AS (
  SELECT reference_id::uuid AS sale_id,
    ROUND(SUM(quantity * COALESCE(unit_cost,0)), 2) AS sm_cost
  FROM stock_movements
  WHERE reference_type = 'SALE'
  GROUP BY reference_id
),
gl_totals AS (
  SELECT lt."ReferenceNumber" AS sale_number,
    ROUND(SUM(le."CreditAmount"), 2) AS gl_credit
  FROM ledger_entries le
  JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
  JOIN accounts a ON a."Id" = le."AccountId"
  WHERE a."AccountCode" = '1300' AND le."CreditAmount" > 0
    AND lt."ReferenceType" IN ('SALE', 'SALE_COGS')
  GROUP BY lt."ReferenceNumber"
)
SELECT 
  s.sale_number,
  COALESCE(sm.sm_cost, 0) AS sm_cost,
  COALESCE(gl.gl_credit, 0) AS gl_credit,
  ROUND(COALESCE(gl.gl_credit, 0) - COALESCE(sm.sm_cost, 0), 2) AS gap
FROM sales s
LEFT JOIN sm_totals sm ON sm.sale_id = s.id
LEFT JOIN gl_totals gl ON gl.sale_number = s.sale_number
WHERE s.status = 'COMPLETED'
  AND ABS(COALESCE(gl.gl_credit, 0) - COALESCE(sm.sm_cost, 0)) > 10
ORDER BY ABS(COALESCE(gl.gl_credit, 0) - COALESCE(sm.sm_cost, 0)) DESC
LIMIT 30;
