import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: 'postgresql://postgres:password@localhost:5432/pos_system'
});

async function investigateTaxDiscrepancy() {
    console.log('=== TAX-RELATED AR DISCREPANCY INVESTIGATION ===\n');

    // 1. Current AR balance
    console.log('1. CURRENT AR (1200) BALANCE:');
    const arBalance = await pool.query(`
    SELECT 
      "CurrentBalance",
      (SELECT SUM("DebitAmount") - SUM("CreditAmount") FROM ledger_entries le 
       JOIN accounts a ON a."Id" = le."AccountId" WHERE a."AccountCode" = '1200') as computed_balance
    FROM accounts WHERE "AccountCode" = '1200'
  `);
    console.table(arBalance.rows);

    // 2. Customer subledger
    console.log('\n2. CUSTOMER SUBLEDGER:');
    const customers = await pool.query(`
    SELECT id, name, balance FROM customers WHERE balance != 0 ORDER BY balance DESC
  `);
    console.table(customers.rows);
    console.log('Total customer balance:', (await pool.query(`SELECT COALESCE(SUM(balance), 0) as total FROM customers`)).rows[0].total);

    // 3. Invoice outstanding
    console.log('\n3. INVOICE OUTSTANDING:');
    const invoices = await pool.query(`
    SELECT "InvoiceNumber", "TotalAmount", "TaxAmount", "AmountPaid", "OutstandingBalance", "Status"
    FROM invoices
    WHERE "Status" NOT IN ('Draft', 'Cancelled', 'Void')
    ORDER BY "InvoiceNumber"
  `);
    console.table(invoices.rows);

    // 4. All AR ledger entries
    console.log('\n4. ALL AR LEDGER ENTRIES:');
    const arEntries = await pool.query(`
    SELECT le."DebitAmount", le."CreditAmount", le."Description", le."EntityType", le."EntityId"
    FROM ledger_entries le
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1200'
    ORDER BY le."EntryDate"
  `);
    console.table(arEntries.rows);

    // 5. Sales with tax
    console.log('\n5. SALES WITH TAX:');
    const salesWithTax = await pool.query(`
    SELECT id, sale_number, subtotal, tax_amount, total_amount, payment_method, customer_id
    FROM sales
    WHERE COALESCE(tax_amount, 0) > 0
    ORDER BY created_at DESC
  `);
    console.table(salesWithTax.rows);

    // 6. Check what GL entries were created for sales with tax
    console.log('\n6. GL ENTRIES FOR SALES (checking for tax issues):');
    const saleGLEntries = await pool.query(`
    SELECT 
      s.sale_number,
      s.total_amount as sale_total,
      s.tax_amount as sale_tax,
      s.subtotal as sale_subtotal,
      le."DebitAmount", 
      le."CreditAmount",
      a."AccountCode",
      a."AccountName",
      le."EntityType"
    FROM sales s
    LEFT JOIN ledger_entries le ON le."EntityId" = s.id::TEXT
    LEFT JOIN accounts a ON a."Id" = le."AccountId"
    WHERE s.id IN (SELECT id FROM sales ORDER BY created_at DESC LIMIT 10)
    ORDER BY s.sale_number, a."AccountCode"
  `);
    console.table(saleGLEntries.rows);

    // 7. Check journal entries for sales
    console.log('\n7. JOURNAL ENTRIES FOR RECENT SALES:');
    const journalEntries = await pool.query(`
    SELECT 
      je."TransactionId",
      je."SourceEntityType",
      je."SourceEntityId",
      je."Description",
      jel."DebitAmount",
      jel."CreditAmount",
      a."AccountCode",
      a."AccountName"
    FROM journal_entries je
    JOIN journal_entry_lines jel ON jel."JournalEntryId" = je."Id"
    JOIN accounts a ON a."Id" = jel."AccountId"
    WHERE je."SourceEntityType" = 'Sale'
    ORDER BY je."CreatedAt" DESC
    LIMIT 20
  `);
    console.table(journalEntries.rows);

    // 8. Sum up AR entries
    console.log('\n8. AR ENTRY TOTALS:');
    const arTotals = await pool.query(`
    SELECT 
      SUM(le."DebitAmount") as total_debits,
      SUM(le."CreditAmount") as total_credits,
      SUM(le."DebitAmount") - SUM(le."CreditAmount") as net_balance
    FROM ledger_entries le
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1200'
  `);
    console.log(arTotals.rows[0]);

    await pool.end();
}

investigateTaxDiscrepancy().catch(e => { console.error(e); process.exit(1); });
