-- Backfill GL Entries from Existing Transactions
-- Run this once to create ledger entries for historical data

-- Account IDs (from pos_system database)
-- 1010 Cash:                 a237fccc-08ee-49c9-9e80-f654bbf24846
-- 1200 Accounts Receivable:  49a1be92-cac3-42df-9b88-f5dc08d12000
-- 1300 Inventory:            261d1b86-37bd-4b9e-a99f-6599e37bc059
-- 2100 Accounts Payable:     90a73ab2-54d3-4b71-9186-cf8738d69e5a
-- 4000 Sales Revenue:        78c709b8-3b96-4368-ba15-ca0baa3d4867
-- 5000 COGS:                 a4d29004-edaf-4fb8-94f4-fe33c00e1afe

BEGIN;

-- ============================================================================
-- 1. SALES TRANSACTIONS
-- ============================================================================

INSERT INTO ledger_transactions (
    "Id", "TransactionNumber", "TransactionDate", "ReferenceType", 
    "ReferenceId", "ReferenceNumber", "Description", 
    "TotalDebitAmount", "TotalCreditAmount", "Status",
    "CreatedAt", "UpdatedAt", "IsReversed"
)
SELECT 
    gen_random_uuid(),
    'TXN-' || LPAD((ROW_NUMBER() OVER (ORDER BY created_at))::TEXT, 6, '0'),
    COALESCE(created_at, NOW()),
    'SALE',
    id,
    sale_number,
    'Sale: ' || sale_number || ' - ' || COALESCE(payment_method, 'CASH'),
    total_amount + COALESCE(total_cost, 0),
    total_amount + COALESCE(total_cost, 0),
    'POSTED',
    NOW(), NOW(), false
FROM sales
WHERE id NOT IN (SELECT "ReferenceId" FROM ledger_transactions WHERE "ReferenceType" = 'SALE');

-- Entry 1: DR Cash (or AR for CREDIT sales)
INSERT INTO ledger_entries ("Id", "TransactionId", "AccountId", "EntryType", "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber", "CreatedAt")
SELECT 
    gen_random_uuid(),
    lt."Id",
    CASE 
        WHEN s.payment_method = 'CREDIT' THEN '49a1be92-cac3-42df-9b88-f5dc08d12000'::uuid
        ELSE 'a237fccc-08ee-49c9-9e80-f654bbf24846'::uuid
    END,
    'DEBIT',
    s.total_amount,
    s.total_amount,
    0,
    CASE WHEN s.payment_method = 'CREDIT' THEN 'A/R from credit sale' ELSE 'Cash received' END,
    1,
    NOW()
FROM sales s
JOIN ledger_transactions lt ON lt."ReferenceId" = s.id AND lt."ReferenceType" = 'SALE';

-- Entry 2: CR Sales Revenue
INSERT INTO ledger_entries ("Id", "TransactionId", "AccountId", "EntryType", "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber", "CreatedAt")
SELECT 
    gen_random_uuid(),
    lt."Id",
    '78c709b8-3b96-4368-ba15-ca0baa3d4867'::uuid,
    'CREDIT',
    s.total_amount,
    0,
    s.total_amount,
    'Sales revenue',
    2,
    NOW()
FROM sales s
JOIN ledger_transactions lt ON lt."ReferenceId" = s.id AND lt."ReferenceType" = 'SALE';

-- Entry 3: DR COGS (only if total_cost > 0)
INSERT INTO ledger_entries ("Id", "TransactionId", "AccountId", "EntryType", "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber", "CreatedAt")
SELECT 
    gen_random_uuid(),
    lt."Id",
    'a4d29004-edaf-4fb8-94f4-fe33c00e1afe'::uuid,
    'DEBIT',
    COALESCE(s.total_cost, 0),
    COALESCE(s.total_cost, 0),
    0,
    'Cost of goods sold',
    3,
    NOW()
FROM sales s
JOIN ledger_transactions lt ON lt."ReferenceId" = s.id AND lt."ReferenceType" = 'SALE'
WHERE COALESCE(s.total_cost, 0) > 0;

-- Entry 4: CR Inventory (only if total_cost > 0)
INSERT INTO ledger_entries ("Id", "TransactionId", "AccountId", "EntryType", "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber", "CreatedAt")
SELECT 
    gen_random_uuid(),
    lt."Id",
    '261d1b86-37bd-4b9e-a99f-6599e37bc059'::uuid,
    'CREDIT',
    COALESCE(s.total_cost, 0),
    0,
    COALESCE(s.total_cost, 0),
    'Inventory reduction',
    4,
    NOW()
FROM sales s
JOIN ledger_transactions lt ON lt."ReferenceId" = s.id AND lt."ReferenceType" = 'SALE'
WHERE COALESCE(s.total_cost, 0) > 0;

-- ============================================================================
-- 2. GOODS RECEIPTS (DR Inventory, CR A/P)
-- ============================================================================

-- First, create a temp view with GR totals
INSERT INTO ledger_transactions (
    "Id", "TransactionNumber", "TransactionDate", "ReferenceType", 
    "ReferenceId", "ReferenceNumber", "Description", 
    "TotalDebitAmount", "TotalCreditAmount", "Status",
    "CreatedAt", "UpdatedAt", "IsReversed"
)
SELECT 
    gen_random_uuid(),
    'TXN-' || LPAD((100 + ROW_NUMBER() OVER (ORDER BY gr.created_at))::TEXT, 6, '0'),
    COALESCE(gr.received_date::timestamp with time zone, gr.created_at, NOW()),
    'GOODS_RECEIPT',
    gr.id,
    gr.receipt_number,
    'Goods Receipt: ' || gr.receipt_number,
    COALESCE(gr_totals.total_value, 0),
    COALESCE(gr_totals.total_value, 0),
    'POSTED',
    NOW(), NOW(), false
FROM goods_receipts gr
LEFT JOIN (
    SELECT goods_receipt_id, SUM(received_quantity * cost_price) as total_value
    FROM goods_receipt_items
    GROUP BY goods_receipt_id
) gr_totals ON gr.id = gr_totals.goods_receipt_id
WHERE gr.status = 'COMPLETED'
AND gr.id NOT IN (SELECT "ReferenceId" FROM ledger_transactions WHERE "ReferenceType" = 'GOODS_RECEIPT');

-- DR Inventory
INSERT INTO ledger_entries ("Id", "TransactionId", "AccountId", "EntryType", "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber", "CreatedAt")
SELECT 
    gen_random_uuid(),
    lt."Id",
    '261d1b86-37bd-4b9e-a99f-6599e37bc059'::uuid,
    'DEBIT',
    COALESCE(gr_totals.total_value, 0),
    COALESCE(gr_totals.total_value, 0),
    0,
    'Inventory received',
    1,
    NOW()
FROM goods_receipts gr
LEFT JOIN (
    SELECT goods_receipt_id, SUM(received_quantity * cost_price) as total_value
    FROM goods_receipt_items
    GROUP BY goods_receipt_id
) gr_totals ON gr.id = gr_totals.goods_receipt_id
JOIN ledger_transactions lt ON lt."ReferenceId" = gr.id AND lt."ReferenceType" = 'GOODS_RECEIPT';

-- CR Accounts Payable
INSERT INTO ledger_entries ("Id", "TransactionId", "AccountId", "EntryType", "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber", "CreatedAt")
SELECT 
    gen_random_uuid(),
    lt."Id",
    '90a73ab2-54d3-4b71-9186-cf8738d69e5a'::uuid,
    'CREDIT',
    COALESCE(gr_totals.total_value, 0),
    0,
    COALESCE(gr_totals.total_value, 0),
    'Payable to supplier',
    2,
    NOW()
FROM goods_receipts gr
LEFT JOIN (
    SELECT goods_receipt_id, SUM(received_quantity * cost_price) as total_value
    FROM goods_receipt_items
    GROUP BY goods_receipt_id
) gr_totals ON gr.id = gr_totals.goods_receipt_id
JOIN ledger_transactions lt ON lt."ReferenceId" = gr.id AND lt."ReferenceType" = 'GOODS_RECEIPT';

-- ============================================================================
-- 3. CUSTOMER PAYMENTS (DR Cash, CR A/R)
-- ============================================================================

INSERT INTO ledger_transactions (
    "Id", "TransactionNumber", "TransactionDate", "ReferenceType", 
    "ReferenceId", "ReferenceNumber", "Description", 
    "TotalDebitAmount", "TotalCreditAmount", "Status",
    "CreatedAt", "UpdatedAt", "IsReversed"
)
SELECT 
    gen_random_uuid(),
    'TXN-' || LPAD((200 + ROW_NUMBER() OVER (ORDER BY "Id"))::TEXT, 6, '0'),
    COALESCE("PaymentDate"::timestamp with time zone, NOW()),
    'CUSTOMER_PAYMENT',
    "Id",
    "PaymentNumber",
    'Customer Payment: ' || "PaymentNumber",
    "Amount",
    "Amount",
    'POSTED',
    NOW(), NOW(), false
FROM customer_payments
WHERE "Id" NOT IN (SELECT "ReferenceId" FROM ledger_transactions WHERE "ReferenceType" = 'CUSTOMER_PAYMENT');

-- DR Cash
INSERT INTO ledger_entries ("Id", "TransactionId", "AccountId", "EntryType", "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber", "CreatedAt")
SELECT 
    gen_random_uuid(),
    lt."Id",
    'a237fccc-08ee-49c9-9e80-f654bbf24846'::uuid,
    'DEBIT',
    cp."Amount",
    cp."Amount",
    0,
    'Cash received from customer',
    1,
    NOW()
FROM customer_payments cp
JOIN ledger_transactions lt ON lt."ReferenceId" = cp."Id" AND lt."ReferenceType" = 'CUSTOMER_PAYMENT';

-- CR Accounts Receivable
INSERT INTO ledger_entries ("Id", "TransactionId", "AccountId", "EntryType", "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber", "CreatedAt")
SELECT 
    gen_random_uuid(),
    lt."Id",
    '49a1be92-cac3-42df-9b88-f5dc08d12000'::uuid,
    'CREDIT',
    cp."Amount",
    0,
    cp."Amount",
    'Reduce customer receivable',
    2,
    NOW()
FROM customer_payments cp
JOIN ledger_transactions lt ON lt."ReferenceId" = cp."Id" AND lt."ReferenceType" = 'CUSTOMER_PAYMENT';

-- ============================================================================
-- 4. SUPPLIER PAYMENTS (DR A/P, CR Cash)
-- ============================================================================

INSERT INTO ledger_transactions (
    "Id", "TransactionNumber", "TransactionDate", "ReferenceType", 
    "ReferenceId", "ReferenceNumber", "Description", 
    "TotalDebitAmount", "TotalCreditAmount", "Status",
    "CreatedAt", "UpdatedAt", "IsReversed"
)
SELECT 
    gen_random_uuid(),
    'TXN-' || LPAD((300 + ROW_NUMBER() OVER (ORDER BY "Id"))::TEXT, 6, '0'),
    COALESCE("PaymentDate"::timestamp with time zone, NOW()),
    'SUPPLIER_PAYMENT',
    "Id",
    "PaymentNumber",
    'Supplier Payment: ' || "PaymentNumber",
    "Amount",
    "Amount",
    'POSTED',
    NOW(), NOW(), false
FROM supplier_payments
WHERE "Id" NOT IN (SELECT "ReferenceId" FROM ledger_transactions WHERE "ReferenceType" = 'SUPPLIER_PAYMENT');

-- DR Accounts Payable
INSERT INTO ledger_entries ("Id", "TransactionId", "AccountId", "EntryType", "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber", "CreatedAt")
SELECT 
    gen_random_uuid(),
    lt."Id",
    '90a73ab2-54d3-4b71-9186-cf8738d69e5a'::uuid,
    'DEBIT',
    sp."Amount",
    sp."Amount",
    0,
    'Pay supplier invoice',
    1,
    NOW()
FROM supplier_payments sp
JOIN ledger_transactions lt ON lt."ReferenceId" = sp."Id" AND lt."ReferenceType" = 'SUPPLIER_PAYMENT';

-- CR Cash
INSERT INTO ledger_entries ("Id", "TransactionId", "AccountId", "EntryType", "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber", "CreatedAt")
SELECT 
    gen_random_uuid(),
    lt."Id",
    'a237fccc-08ee-49c9-9e80-f654bbf24846'::uuid,
    'CREDIT',
    sp."Amount",
    0,
    sp."Amount",
    'Cash paid to supplier',
    2,
    NOW()
FROM supplier_payments sp
JOIN ledger_transactions lt ON lt."ReferenceId" = sp."Id" AND lt."ReferenceType" = 'SUPPLIER_PAYMENT';

COMMIT;

-- Summary of what was created
SELECT 'Transactions Created' as metric, COUNT(*) as count FROM ledger_transactions
UNION ALL
SELECT 'Entries Created', COUNT(*) FROM ledger_entries
UNION ALL
SELECT 'Sales in GL', COUNT(*) FROM ledger_transactions WHERE "ReferenceType" = 'SALE'
UNION ALL
SELECT 'Goods Receipts in GL', COUNT(*) FROM ledger_transactions WHERE "ReferenceType" = 'GOODS_RECEIPT'
UNION ALL
SELECT 'Customer Payments in GL', COUNT(*) FROM ledger_transactions WHERE "ReferenceType" = 'CUSTOMER_PAYMENT'
UNION ALL
SELECT 'Supplier Payments in GL', COUNT(*) FROM ledger_transactions WHERE "ReferenceType" = 'SUPPLIER_PAYMENT';
