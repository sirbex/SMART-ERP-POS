-- ============================================================================
-- ENTERPRISE DATA INTEGRITY AUDIT
-- Comprehensive check of accounts, balances, double-entry, orphans, math
-- ============================================================================

-- ======================= 1. DOUBLE-ENTRY BALANCE CHECK =======================
-- Every transaction must have equal debits and credits
SELECT '=== 1. DOUBLE-ENTRY BALANCE (debits must equal credits per txn) ===' AS section;

SELECT lt."TransactionNumber",
       SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END) AS total_debits,
       SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END) AS total_credits,
       SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END) -
       SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END) AS imbalance
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
GROUP BY lt."TransactionNumber"
HAVING SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END) !=
       SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END)
ORDER BY lt."TransactionNumber";

-- ======================= 2. TRIAL BALANCE =======================
-- Sum of all DEBIT normal balances must equal sum of all CREDIT normal balances
SELECT '=== 2. TRIAL BALANCE ===' AS section;

SELECT 
  SUM(CASE WHEN "NormalBalance" = 'DEBIT' THEN "CurrentBalance" ELSE 0 END) AS total_debit_balances,
  SUM(CASE WHEN "NormalBalance" = 'CREDIT' THEN "CurrentBalance" ELSE 0 END) AS total_credit_balances,
  SUM(CASE WHEN "NormalBalance" = 'DEBIT' THEN "CurrentBalance" ELSE 0 END) -
  SUM(CASE WHEN "NormalBalance" = 'CREDIT' THEN "CurrentBalance" ELSE 0 END) AS trial_balance_diff
FROM accounts
WHERE "IsPostingAccount" = true;

-- ======================= 3. ACCOUNT BALANCE DRIFT =======================
-- StoredBalance vs ComputedFromEntries
SELECT '=== 3. BALANCE DRIFT (stored vs computed from entries) ===' AS section;

SELECT a."AccountCode", a."AccountName", a."NormalBalance",
       a."CurrentBalance" AS stored,
       CASE a."NormalBalance"
         WHEN 'DEBIT' THEN COALESCE(SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END), 0)
         WHEN 'CREDIT' THEN COALESCE(SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END), 0)
       END AS computed,
       a."CurrentBalance" - CASE a."NormalBalance"
         WHEN 'DEBIT' THEN COALESCE(SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END), 0)
         WHEN 'CREDIT' THEN COALESCE(SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END), 0)
       END AS drift
FROM accounts a
LEFT JOIN ledger_entries le ON le."AccountId" = a."Id"
GROUP BY a."Id", a."AccountCode", a."AccountName", a."NormalBalance", a."CurrentBalance"
HAVING a."CurrentBalance" != CASE a."NormalBalance"
  WHEN 'DEBIT' THEN COALESCE(SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END), 0)
  WHEN 'CREDIT' THEN COALESCE(SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END), 0)
END
ORDER BY a."AccountCode";

-- ======================= 4. ORPHAN LEDGER ENTRIES =======================
-- Entries referencing deleted/nonexistent transactions or accounts
SELECT '=== 4a. ORPHAN ENTRIES (no transaction) ===' AS section;
SELECT le."Id", le."TransactionId", le."AccountId", le."Amount"
FROM ledger_entries le
LEFT JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
WHERE lt."Id" IS NULL;

SELECT '=== 4b. ORPHAN ENTRIES (no account) ===' AS section;
SELECT le."Id", le."TransactionId", le."AccountId", le."Amount"
FROM ledger_entries le
LEFT JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."Id" IS NULL;

-- ======================= 5. ORPHAN TRANSACTIONS =======================
-- Transactions with no entries
SELECT '=== 5. ORPHAN TRANSACTIONS (no entries) ===' AS section;
SELECT lt."Id", lt."TransactionNumber", lt."Description", lt."TransactionDate"
FROM ledger_transactions lt
LEFT JOIN ledger_entries le ON le."TransactionId" = lt."Id"
WHERE le."Id" IS NULL;

-- ======================= 6. PAYROLL ENTRY → GL LINKAGE =======================
-- Every posted payroll entry must reference a valid GL transaction
SELECT '=== 6a. PAYROLL ENTRIES WITH MISSING GL TRANSACTION ===' AS section;
SELECT pe."Id", pe."EmployeeId", pe."NetPay", pe."JournalEntryId"
FROM payroll_entries pe
WHERE pe."JournalEntryId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ledger_transactions lt WHERE lt."Id" = pe."JournalEntryId");

-- GL transactions that should be referenced by payroll but aren't
SELECT '=== 6b. GL TRANSACTIONS (payroll-type) NOT REFERENCED BY ANY PAYROLL ENTRY ===' AS section;
SELECT lt."TransactionNumber", lt."Description", lt."TransactionDate"
FROM ledger_transactions lt
WHERE lt."Description" ILIKE '%payroll%' OR lt."Description" ILIKE '%salary%'
  AND NOT EXISTS (SELECT 1 FROM payroll_entries pe WHERE pe."JournalEntryId" = lt."Id");

-- ======================= 7. PAYROLL MATH CHECK =======================
-- NetPay = BasicSalary + Allowances - Deductions
SELECT '=== 7. PAYROLL MATH (NetPay = BasicSalary + Allowances - Deductions) ===' AS section;
SELECT pe."Id",
       e."FirstName" || ' ' || e."LastName" AS employee,
       pe."BasicSalary", pe."Allowances", pe."Deductions", pe."NetPay",
       (pe."BasicSalary" + pe."Allowances" - pe."Deductions") AS expected_net,
       pe."NetPay" - (pe."BasicSalary" + pe."Allowances" - pe."Deductions") AS math_error
FROM payroll_entries pe
JOIN employees e ON e."Id" = pe."EmployeeId"
WHERE pe."NetPay" != (pe."BasicSalary" + pe."Allowances" - pe."Deductions");

-- ======================= 8. PAYROLL GL AMOUNT CONSISTENCY =======================
-- GL debit amount for each payroll entry must equal NetPay
SELECT '=== 8. PAYROLL GL AMOUNT vs PAYROLL NetPay ===' AS section;
SELECT pe."Id" AS payroll_entry_id,
       lt."TransactionNumber",
       pe."NetPay" AS payroll_net_pay,
       le."Amount" AS gl_debit_amount,
       pe."NetPay" - le."Amount" AS discrepancy
FROM payroll_entries pe
JOIN ledger_transactions lt ON lt."Id" = pe."JournalEntryId"
JOIN ledger_entries le ON le."TransactionId" = lt."Id" AND le."EntryType" = 'DEBIT'
WHERE pe."NetPay" != le."Amount";

-- ======================= 9. SALES MATH CHECK =======================
-- Sale total_amount vs sum of items, profit check
SELECT '=== 9a. SALES: total_amount vs SUM(item price * qty) ===' AS section;
SELECT s.id, s.sale_number, s.total_amount,
       COALESCE(items.computed_total, 0) AS computed_total,
       s.total_amount - COALESCE(items.computed_total, 0) AS discrepancy
FROM sales s
LEFT JOIN (
  SELECT sale_id, SUM(quantity * unit_price) AS computed_total
  FROM sale_items
  GROUP BY sale_id
) items ON items.sale_id = s.id
WHERE s.total_amount != COALESCE(items.computed_total, 0)
LIMIT 20;

SELECT '=== 9b. SALES: profit = total_amount - total_cost ===' AS section;
SELECT s.id, s.sale_number, s.total_amount, s.total_cost, s.profit,
       (s.total_amount - s.total_cost) AS expected_profit,
       s.profit - (s.total_amount - s.total_cost) AS profit_error
FROM sales s
WHERE s.profit != (s.total_amount - s.total_cost)
LIMIT 20;

-- ======================= 10. SALES → GL LINKAGE =======================
SELECT '=== 10. SALES WITH GL JOURNAL REFS ===' AS section;
SELECT s.sale_number, s.total_amount, s.journal_entry_id,
       lt."TransactionNumber" AS gl_txn,
       CASE WHEN lt."Id" IS NULL AND s.journal_entry_id IS NOT NULL THEN 'BROKEN LINK'
            WHEN s.journal_entry_id IS NULL THEN 'NO GL ENTRY'
            ELSE 'OK' END AS status
FROM sales s
LEFT JOIN ledger_transactions lt ON lt."Id" = s.journal_entry_id
WHERE s.journal_entry_id IS NOT NULL AND lt."Id" IS NULL
LIMIT 20;

-- ======================= 11. INVENTORY BATCH QUANTITIES =======================
-- batch remaining_quantity should never be negative
SELECT '=== 11a. NEGATIVE BATCH QUANTITIES ===' AS section;
SELECT ib.id, p.name AS product, ib.batch_number, ib.remaining_quantity
FROM inventory_batches ib
JOIN products p ON p.id = ib.product_id
WHERE ib.remaining_quantity < 0;

-- Total batch remaining vs product stock_quantity
SELECT '=== 11b. PRODUCT STOCK vs SUM(batch remaining) ===' AS section;
SELECT p.id, p.name, p.stock_quantity,
       COALESCE(b.batch_sum, 0) AS batch_sum,
       p.stock_quantity - COALESCE(b.batch_sum, 0) AS discrepancy
FROM products p
LEFT JOIN (
  SELECT product_id, SUM(remaining_quantity) AS batch_sum
  FROM inventory_batches
  GROUP BY product_id
) b ON b.product_id = p.id
WHERE p.stock_quantity != COALESCE(b.batch_sum, 0)
  AND EXISTS (SELECT 1 FROM inventory_batches WHERE product_id = p.id)
LIMIT 20;

-- ======================= 12. EMPLOYEE SUB-LEDGER COMPLETENESS =======================
SELECT '=== 12a. ACTIVE EMPLOYEES WITHOUT SUB-LEDGER ACCOUNT ===' AS section;
SELECT e."Id", e."FirstName" || ' ' || e."LastName" AS name, e."Status", e."LedgerAccountId"
FROM employees e
WHERE e."Status" = 'ACTIVE' AND e."LedgerAccountId" IS NULL;

SELECT '=== 12b. EMPLOYEE SUB-LEDGER ACCOUNTS POINTING TO NONEXISTENT ACCOUNTS ===' AS section;
SELECT e."Id", e."FirstName" || ' ' || e."LastName" AS name, e."LedgerAccountId"
FROM employees e
LEFT JOIN accounts a ON a."Id" = e."LedgerAccountId"
WHERE e."LedgerAccountId" IS NOT NULL AND a."Id" IS NULL;

-- ======================= 13. ACCOUNT HIERARCHY =======================
SELECT '=== 13a. POSTING ACCOUNTS WITH CHILDREN (should be leaf nodes) ===' AS section;
SELECT a."AccountCode", a."AccountName", a."IsPostingAccount",
       COUNT(c."Id") AS child_count
FROM accounts a
JOIN accounts c ON c."ParentAccountId" = a."Id"
WHERE a."IsPostingAccount" = true
GROUP BY a."Id", a."AccountCode", a."AccountName", a."IsPostingAccount";

SELECT '=== 13b. NON-POSTING ACCOUNTS WITH LEDGER ENTRIES (should not have direct entries) ===' AS section;
SELECT a."AccountCode", a."AccountName", a."IsPostingAccount", COUNT(le."Id") AS entry_count
FROM accounts a
JOIN ledger_entries le ON le."AccountId" = a."Id"
WHERE a."IsPostingAccount" = false
GROUP BY a."Id", a."AccountCode", a."AccountName", a."IsPostingAccount";

-- ======================= 14. DUPLICATE DETECTION =======================
SELECT '=== 14a. DUPLICATE ACCOUNT CODES ===' AS section;
SELECT "AccountCode", COUNT(*) AS cnt
FROM accounts
GROUP BY "AccountCode"
HAVING COUNT(*) > 1;

SELECT '=== 14b. DUPLICATE SALE NUMBERS ===' AS section;
SELECT sale_number, COUNT(*) AS cnt
FROM sales
GROUP BY sale_number
HAVING COUNT(*) > 1;

SELECT '=== 14c. DUPLICATE TRANSACTION NUMBERS ===' AS section;
SELECT "TransactionNumber", COUNT(*) AS cnt
FROM ledger_transactions
GROUP BY "TransactionNumber"
HAVING COUNT(*) > 1;

-- ======================= 15. NEGATIVE BALANCE ANOMALIES =======================
SELECT '=== 15. ACCOUNTS WITH UNEXPECTED NEGATIVE BALANCES ===' AS section;
SELECT "AccountCode", "AccountName", "NormalBalance", "CurrentBalance"
FROM accounts
WHERE "CurrentBalance" < 0
  AND "IsPostingAccount" = true
ORDER BY "AccountCode";

-- ======================= 16. GLOBAL DEBIT = CREDIT CHECK =======================
SELECT '=== 16. GLOBAL: Total Debits vs Total Credits (must be equal) ===' AS section;
SELECT
  SUM(CASE WHEN "EntryType" = 'DEBIT' THEN "Amount" ELSE 0 END) AS total_debits,
  SUM(CASE WHEN "EntryType" = 'CREDIT' THEN "Amount" ELSE 0 END) AS total_credits,
  SUM(CASE WHEN "EntryType" = 'DEBIT' THEN "Amount" ELSE 0 END) -
  SUM(CASE WHEN "EntryType" = 'CREDIT' THEN "Amount" ELSE 0 END) AS global_imbalance
FROM ledger_entries;

-- ======================= 17. PAYROLL PERIOD TOTALS =======================
SELECT '=== 17. PAYROLL PERIOD TOTAL vs SUM(entries) ===' AS section;
SELECT pp."Id", pp."StartDate", pp."EndDate", pp."Status",
       COUNT(pe."Id") AS entry_count,
       SUM(pe."NetPay") AS sum_net_pay,
       SUM(pe."BasicSalary") AS sum_basic
FROM payroll_periods pp
LEFT JOIN payroll_entries pe ON pe."PayrollPeriodId" = pp."Id"
GROUP BY pp."Id", pp."StartDate", pp."EndDate", pp."Status"
ORDER BY pp."StartDate";

-- ======================= 18. CUSTOMER BALANCE vs GL =======================
SELECT '=== 18. CUSTOMER BALANCES: stored vs transactions ===' AS section;
SELECT c.id, c.name, c.balance AS stored_balance,
       COALESCE(SUM(CASE WHEN ct.type = 'CREDIT_SALE' THEN ct.amount
                         WHEN ct.type = 'PAYMENT' THEN -ct.amount
                         ELSE 0 END), 0) AS computed_balance,
       c.balance - COALESCE(SUM(CASE WHEN ct.type = 'CREDIT_SALE' THEN ct.amount
                                      WHEN ct.type = 'PAYMENT' THEN -ct.amount
                                      ELSE 0 END), 0) AS discrepancy
FROM customers c
LEFT JOIN customer_transactions ct ON ct.customer_id = c.id
GROUP BY c.id, c.name, c.balance
HAVING c.balance != COALESCE(SUM(CASE WHEN ct.type = 'CREDIT_SALE' THEN ct.amount
                                       WHEN ct.type = 'PAYMENT' THEN -ct.amount
                                       ELSE 0 END), 0)
LIMIT 20;

SELECT '=== AUDIT COMPLETE ===' AS section;
