-- ============================================================================
-- RECLASSIFY LEGACY PAYROLL GL ENTRIES (TXN-000027, TXN-000028)
-- Old pattern: DR 5000 COGS / CR 2100 AP
-- Correct pattern: DR 6000 Salaries & Wages / CR 2150-xxx employee sub-ledger
--
-- Strategy: Update the AccountId on the existing entries to point to the
-- correct accounts, then recalculate all affected balances.
-- ============================================================================

-- First, examine the legacy entries
SELECT 'Legacy entries to reclassify:' AS info;
SELECT lt."TransactionNumber", le."EntryType", a."AccountCode", a."AccountName", le."Amount"
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE lt."TransactionNumber" IN ('TXN-000027', 'TXN-000028')
ORDER BY lt."TransactionNumber", le."EntryType";

-- Check which employees these payroll entries belong to
SELECT 'Payroll entries -> employees for legacy transactions:' AS info;
SELECT pe."Id" AS payroll_entry_id,
       lt."TransactionNumber",
       e."FirstName" || ' ' || e."LastName" AS employee_name,
       a."AccountCode" AS employee_account_code,
       pe."NetPay"
FROM payroll_entries pe
JOIN ledger_transactions lt ON lt."Id" = pe."JournalEntryId"
JOIN employees e ON e."Id" = pe."EmployeeId"
LEFT JOIN accounts a ON a."Id" = e."LedgerAccountId"
WHERE lt."TransactionNumber" IN ('TXN-000027', 'TXN-000028')
ORDER BY lt."TransactionNumber";
