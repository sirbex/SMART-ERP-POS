-- How was 1300 initially funded? Check opening balance / all debits
SELECT 
  lt."ReferenceType",
  lt."ReferenceNumber",
  lt."TransactionDate"::DATE AS txn_date,
  lt."Description",
  ROUND(le."DebitAmount", 2) AS debit,
  ROUND(le."CreditAmount", 2) AS credit
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."AccountCode" = '1300'
ORDER BY lt."TransactionDate" ASC
LIMIT 30;

-- Check entries via LedgerTransactionId (might be different set)
SELECT 
  ROUND(SUM(le."DebitAmount"), 2) AS debits_via_ltid,
  ROUND(SUM(le."CreditAmount"), 2) AS credits_via_ltid,
  ROUND(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 2) AS net_via_ltid
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."LedgerTransactionId"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."AccountCode" = '1300';

-- Does TransactionId = LedgerTransactionId for 1300 entries?
SELECT 
  COUNT(*) FILTER (WHERE "TransactionId" = "LedgerTransactionId") AS same,
  COUNT(*) FILTER (WHERE "TransactionId" != "LedgerTransactionId") AS different,
  COUNT(*) FILTER (WHERE "LedgerTransactionId" IS NULL) AS ltid_null,
  COUNT(*) FILTER (WHERE "TransactionId" IS NULL) AS txid_null
FROM ledger_entries le
JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."AccountCode" = '1300';

-- What are the 5 GRs - are they opening balance?
SELECT 
  gr.receipt_number,
  gr.status,
  gr.received_date::DATE,
  SUM(gri.received_quantity * gri.unit_cost) AS gr_total_value
FROM goods_receipts gr
JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
WHERE gr.receipt_number IN ('GR-2026-0001','GR-2026-0002','GR-2026-0003','GR-2026-0004','GR-2026-0005')
GROUP BY gr.id, gr.receipt_number, gr.status, gr.received_date
ORDER BY gr.receipt_number;
