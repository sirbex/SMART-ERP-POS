-- ============================================================================
-- DEEP DIVE: Invoice vs Sale consistency
-- Check if invoices correctly reflect actual sale payment status
-- ============================================================================

\echo '=== 1. INVOICE + SALE CROSS-REFERENCE ==='
SELECT c.name AS customer,
       i."InvoiceNumber",
       i."Status" AS inv_status,
       i."TotalAmount" AS inv_total,
       i."AmountPaid" AS inv_paid,
       i."OutstandingBalance" AS inv_outstanding,
       s.sale_number,
       s.total_amount AS sale_total,
       s.amount_paid AS sale_paid,
       s.payment_method AS sale_method,
       s.status AS sale_status,
       CASE
         WHEN s.payment_method != 'CREDIT' AND i."OutstandingBalance" > 0
           THEN '!! NON-CREDIT SALE WITH OUTSTANDING INVOICE'
         WHEN s.amount_paid >= s.total_amount AND i."OutstandingBalance" > 0
           THEN '!! FULLY PAID SALE WITH OUTSTANDING INVOICE'
         ELSE 'OK'
       END AS issue
FROM invoices i
JOIN customers c ON c.id = i."CustomerId"
LEFT JOIN sales s ON s.id = i."SaleId"
WHERE c.balance != 0
ORDER BY c.name, i."CreatedAt";

\echo '=== 2. INVOICES WITHOUT LINKED SALE ==='
SELECT c.name AS customer,
       i."InvoiceNumber",
       i."Status",
       i."TotalAmount",
       i."OutstandingBalance",
       i."SaleId",
       i."QuotationId",
       i."CreatedAt"::date
FROM invoices i
JOIN customers c ON c.id = i."CustomerId"
WHERE c.balance != 0
  AND i."SaleId" IS NULL
ORDER BY c.name;

\echo '=== 3. INVOICE_PAYMENTS FOR THESE INVOICES ==='
SELECT c.name AS customer,
       i."InvoiceNumber",
       ip."Amount" AS payment_amount,
       ip."PaymentMethod",
       ip."Notes",
       ip."CreatedAt"::date AS payment_date
FROM invoice_payments ip
JOIN invoices i ON i."Id" = ip."InvoiceId"
JOIN customers c ON c.id = i."CustomerId"
WHERE c.balance != 0
ORDER BY c.name, ip."CreatedAt";

\echo '=== 4. PAYMENT LINES FOR CREDIT SALES ==='
SELECT c.name AS customer,
       s.sale_number,
       pl.payment_method AS line_method,
       pl.amount AS line_amount,
       pl.reference
FROM payment_lines pl
JOIN sales s ON s.id = pl.sale_id
JOIN customers c ON c.id = s.customer_id
WHERE c.balance != 0
ORDER BY c.name, s.sale_number;

\echo '=== 5. MUTUMBA DAUDE SALE-2026-0017 DETAIL (paid 100K on 79K sale) ==='
SELECT s.sale_number, s.total_amount, s.amount_paid, s.payment_method, s.status,
       s.change_amount, s.notes
FROM sales s WHERE s.sale_number = 'SALE-2026-0017';

\echo '=== 6. MUTUMBA DAUDE INV-2026-0011 (115.5K Unpaid) ==='
SELECT i."InvoiceNumber", i."Status", i."TotalAmount", i."AmountPaid",
       i."OutstandingBalance", i."SaleId", i."QuotationId",
       i."Notes", i."CreatedAt"::date
FROM invoices i WHERE i."InvoiceNumber" = 'INV-2026-0011';

\echo '=== 7. ALL INVOICES SYSTEM-WIDE WITH ISSUES ==='
SELECT c.name AS customer,
       i."InvoiceNumber",
       i."Status" AS inv_status,
       i."OutstandingBalance" AS inv_outstanding,
       s.payment_method AS sale_method,
       s.amount_paid AS sale_paid,
       s.total_amount AS sale_total,
       CASE
         WHEN s.payment_method != 'CREDIT' AND i."OutstandingBalance" > 0
           THEN 'NON-CREDIT WITH BALANCE'
         WHEN s.amount_paid >= s.total_amount AND i."OutstandingBalance" > 0
           THEN 'OVERPAID WITH BALANCE'
         ELSE 'OK'
       END AS issue
FROM invoices i
LEFT JOIN customers c ON c.id = i."CustomerId"
LEFT JOIN sales s ON s.id = i."SaleId"
WHERE i."Status" NOT IN ('Cancelled', 'Voided')
ORDER BY issue DESC, c.name;
