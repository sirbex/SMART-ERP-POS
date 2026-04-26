-- ============================================================================
-- FIX: Recalculate suppliers.OutstandingBalance from supplier_invoices
-- TARGET: pos_tenant_henber_pharmacy
-- CREATED: 2025
-- 
-- PROBLEM: suppliers."OutstandingBalance" was computed from GR × cost history,
-- not from the invoice sub-ledger. This caused a stale cache (24,948,096)
-- vs the actual invoice-derived outstanding (~6,127,062).
--
-- THIS SCRIPT: Recalculates from supplier_invoices (actual bills) as the
-- operational source of truth for what is currently owed.
-- ============================================================================

-- Step 1: Diagnostic before
SELECT 
    'BEFORE' as phase,
    COUNT(*) as supplier_count,
    COALESCE(SUM("OutstandingBalance"), 0) as cached_total,
    (SELECT COALESCE(SUM("OutstandingBalance"), 0) 
     FROM supplier_invoices 
     WHERE deleted_at IS NULL 
       AND "Status" NOT IN ('Paid','PAID','Cancelled','CANCELLED')) as invoice_total
FROM suppliers 
WHERE "IsActive" = true;

-- Step 2: Recalculate each supplier's OutstandingBalance from their invoices
UPDATE suppliers s
SET "OutstandingBalance" = COALESCE(inv.outstanding, 0),
    "UpdatedAt" = NOW()
FROM (
    SELECT 
        "SupplierId",
        COALESCE(SUM("OutstandingBalance"), 0) as outstanding
    FROM supplier_invoices
    WHERE deleted_at IS NULL
      AND "Status" NOT IN ('Paid', 'PAID', 'Cancelled', 'CANCELLED')
    GROUP BY "SupplierId"
) inv
WHERE s."Id" = inv."SupplierId";

-- Step 3: Zero out suppliers with no outstanding invoices
UPDATE suppliers
SET "OutstandingBalance" = 0,
    "UpdatedAt" = NOW()
WHERE "Id" NOT IN (
    SELECT DISTINCT "SupplierId"
    FROM supplier_invoices
    WHERE deleted_at IS NULL
      AND "Status" NOT IN ('Paid', 'PAID', 'Cancelled', 'CANCELLED')
      AND "OutstandingBalance" > 0
);

-- Step 4: Diagnostic after
SELECT 
    'AFTER' as phase,
    COUNT(*) as supplier_count,
    COALESCE(SUM("OutstandingBalance"), 0) as cached_total,
    (SELECT COALESCE(SUM("OutstandingBalance"), 0) 
     FROM supplier_invoices 
     WHERE deleted_at IS NULL 
       AND "Status" NOT IN ('Paid','PAID','Cancelled','CANCELLED')) as invoice_total
FROM suppliers 
WHERE "IsActive" = true;
