-- Find root cause of two-part inventory discrepancy
-- Using proper CTEs to avoid Cartesian product

-- 1. Per-sale: SM cost vs GL credits (properly aggregated)
WITH sm_by_sale AS (
  SELECT reference_id AS sale_id, 
    ROUND(SUM(quantity * COALESCE(unit_cost,0)), 2) AS sm_cost
  FROM stock_movements
  WHERE reference_type = 'SALE'
  GROUP BY reference_id
),
gl_by_sale AS (
  SELECT lt."ReferenceNumber" AS sale_number, 
    lt."ReferenceType",
    ROUND(SUM(le."CreditAmount"), 2) AS gl_credit
  FROM ledger_entries le
  JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
  JOIN accounts a ON a."Id" = le."AccountId"
  WHERE a."AccountCode" = '1300' AND le."CreditAmount" > 0
    AND lt."ReferenceType" IN ('SALE', 'SALE_COGS')
  GROUP BY lt."ReferenceNumber", lt."ReferenceType"
),
gl_total_by_sale AS (
  SELECT sale_number, ROUND(SUM(gl_credit), 2) AS total_gl_credit
  FROM gl_by_sale
  GROUP BY sale_number
),
-- Check if any sale has BOTH SALE and SALE_COGS GL entries (double credit!)
double_credited AS (
  SELECT 
    g1.sale_number,
    ROUND(SUM(CASE WHEN g1."ReferenceType" = 'SALE' THEN g1.gl_credit ELSE 0 END), 2) AS sale_credit,
    ROUND(SUM(CASE WHEN g1."ReferenceType" = 'SALE_COGS' THEN g1.gl_credit ELSE 0 END), 2) AS sale_cogs_credit
  FROM gl_by_sale g1
  GROUP BY g1.sale_number
  HAVING COUNT(DISTINCT g1."ReferenceType") > 1
)
SELECT 
  'Double-credited sales (both SALE + SALE_COGS GL entries)' AS check_type,
  COUNT(*) AS count,
  ROUND(SUM(sale_cogs_credit), 2) AS total_duplicate_cogs_credit
FROM double_credited;

-- 2. List the double-credited sales
WITH gl_by_sale AS (
  SELECT lt."ReferenceNumber" AS sale_number, 
    lt."ReferenceType",
    ROUND(SUM(le."CreditAmount"), 2) AS gl_credit
  FROM ledger_entries le
  JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
  JOIN accounts a ON a."Id" = le."AccountId"
  WHERE a."AccountCode" = '1300' AND le."CreditAmount" > 0
    AND lt."ReferenceType" IN ('SALE', 'SALE_COGS')
  GROUP BY lt."ReferenceNumber", lt."ReferenceType"
)
SELECT 
  g.sale_number,
  MAX(CASE WHEN g."ReferenceType" = 'SALE' THEN g.gl_credit END) AS sale_gl_credit,
  MAX(CASE WHEN g."ReferenceType" = 'SALE_COGS' THEN g.gl_credit END) AS sale_cogs_gl_credit
FROM gl_by_sale g
GROUP BY g.sale_number
HAVING COUNT(DISTINCT g."ReferenceType") > 1
ORDER BY g.sale_number;

-- 3. SALE_COGS sales that have NO SALE-type GL entry (just SALE_COGS alone)
WITH gl_ref_types AS (
  SELECT lt."ReferenceNumber" AS sale_number, 
    array_agg(DISTINCT lt."ReferenceType") AS ref_types
  FROM ledger_entries le
  JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
  JOIN accounts a ON a."Id" = le."AccountId"
  WHERE a."AccountCode" = '1300' AND le."CreditAmount" > 0
    AND lt."ReferenceType" IN ('SALE', 'SALE_COGS')
  GROUP BY lt."ReferenceNumber"
)
SELECT sale_number, ref_types FROM gl_ref_types
WHERE 'SALE_COGS' = ANY(ref_types)
ORDER BY sale_number;

-- 4. Do SALE_COGS sales have stock movements?
SELECT 
  s.sale_number,
  s.status,
  COUNT(sm.id) AS sm_count,
  ROUND(SUM(COALESCE(sm.quantity * sm.unit_cost, 0)), 2) AS sm_cost
FROM sales s
JOIN ledger_transactions lt ON lt."ReferenceNumber" = s.sale_number
  AND lt."ReferenceType" = 'SALE_COGS'
LEFT JOIN stock_movements sm ON sm.reference_id = s.id 
  AND sm.reference_type = 'SALE'
WHERE s.status = 'COMPLETED'
GROUP BY s.sale_number, s.status
ORDER BY s.sale_number;
