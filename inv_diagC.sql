-- Comprehensive inventory gap analysis
-- Gap: Batch remaining 101,685,120 vs GL 101,628,741.56 = -56,378.44

-- 1. Stock movement summary using proper enum comparison
SELECT
  movement_type,
  reference_type,
  COUNT(*) AS cnt,
  ROUND(SUM(quantity * COALESCE(unit_cost, 0)), 2) AS total_cost
FROM stock_movements
GROUP BY movement_type, reference_type
ORDER BY movement_type, reference_type;

-- 2. Expected remaining from stock movements (inflows - outflows)
WITH movement_totals AS (
  SELECT
    ROUND(SUM(CASE WHEN movement_type IN ('GOODS_RECEIPT','OPENING_BALANCE','ADJUSTMENT_IN') THEN quantity * COALESCE(unit_cost,0) ELSE 0 END), 2) AS inflows,
    ROUND(SUM(CASE WHEN movement_type IN ('SALE','ADJUSTMENT_OUT') THEN quantity * COALESCE(unit_cost,0) ELSE 0 END), 2) AS outflows_pos,
    ROUND(SUM(CASE WHEN movement_type = 'SUPPLIER_RETURN' THEN quantity * COALESCE(unit_cost,0) ELSE 0 END), 2) AS supplier_returns_signed
  FROM stock_movements
)
SELECT 
  inflows,
  outflows_pos,
  supplier_returns_signed,
  inflows - outflows_pos + supplier_returns_signed AS sm_expected_remaining,
  101685120.00 AS actual_batch_remaining,
  101628741.56 AS gl_balance,
  101685120.00 - (inflows - outflows_pos + supplier_returns_signed) AS batch_vs_sm_gap,
  (inflows - outflows_pos + supplier_returns_signed) - 101628741.56 AS sm_vs_gl_gap,
  101685120.00 - 101628741.56 AS total_gap
FROM movement_totals;

-- 3. SALE_COGS GL entries - find which sale numbers they correspond to
SELECT 
  lt."ReferenceType",
  lt."ReferenceNumber",
  ROUND(le."CreditAmount", 2) AS inv_credit,
  lt."Description"
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."AccountCode" = '1300'
  AND lt."ReferenceType" = 'SALE_COGS'
  AND le."CreditAmount" > 0
ORDER BY le."CreditAmount" DESC
LIMIT 20;

-- 4. Compare SALE stock movements vs GL SALE credits per sale
-- Find sales where GL credit != stock movement cost
SELECT 
  s.sale_number,
  ROUND(SUM(sm.quantity * COALESCE(sm.unit_cost, 0)), 2) AS sm_cost,
  ROUND(SUM(le."CreditAmount"), 2) AS gl_credit,
  ROUND(SUM(le."CreditAmount") - SUM(sm.quantity * COALESCE(sm.unit_cost, 0)), 2) AS gap
FROM sales s
JOIN stock_movements sm ON sm.reference_type = 'SALE' AND sm.reference_id = s.id
JOIN ledger_transactions lt ON lt."ReferenceNumber" = s.sale_number 
  AND lt."ReferenceType" IN ('SALE', 'SALE_COGS')
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE s.status = 'COMPLETED'
  AND a."AccountCode" = '1300'
  AND le."CreditAmount" > 0
GROUP BY s.sale_number
HAVING ABS(ROUND(SUM(le."CreditAmount") - SUM(sm.quantity * COALESCE(sm.unit_cost, 0)), 2)) > 1
ORDER BY ABS(ROUND(SUM(le."CreditAmount") - SUM(sm.quantity * COALESCE(sm.unit_cost, 0)), 2)) DESC
LIMIT 20;
