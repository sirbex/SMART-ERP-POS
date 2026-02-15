import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: 'postgresql://postgres:password@localhost:5432/pos_system'
});

async function checkSaleGL() {
    console.log('=== SALE SALE-2025-0001 FULL ANALYSIS ===\n');

    // Get the sale
    const sale = await pool.query(`
    SELECT * FROM sales WHERE sale_number = 'SALE-2025-0001'
  `);
    console.log('1. SALE DETAILS:');
    console.table(sale.rows);
    const saleId = sale.rows[0]?.id;

    // Check ledger_entries for sale
    console.log('\n2. LEDGER ENTRIES FOR SALE:');
    const saleLE = await pool.query(`
    SELECT le.*, a."AccountCode", a."AccountName"
    FROM ledger_entries le
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE le."EntityId" = $1
    ORDER BY le."EntryDate"
  `, [saleId]);
    console.table(saleLE.rows);

    // Check journal_entries for sale
    console.log('\n3. JOURNAL ENTRIES FOR SALE:');
    const saleJE = await pool.query(`
    SELECT je.*, jel."DebitAmount", jel."CreditAmount", a."AccountCode", a."AccountName"
    FROM journal_entries je
    LEFT JOIN journal_entry_lines jel ON jel."JournalEntryId" = je."Id"
    LEFT JOIN accounts a ON a."Id" = jel."AccountId"
    WHERE je."SourceEntityId" = $1
    ORDER BY je."CreatedAt"
  `, [saleId]);
    console.table(saleJE.rows);

    // Check invoice for sale
    const invoice = await pool.query(`
    SELECT * FROM invoices WHERE "SaleId" = $1
  `, [saleId]);
    console.log('\n4. INVOICE FOR SALE:');
    console.table(invoice.rows);
    const invoiceId = invoice.rows[0]?.Id;

    // Check ledger entries for invoice
    if (invoiceId) {
        console.log('\n5. LEDGER ENTRIES FOR INVOICE:');
        const invLE = await pool.query(`
      SELECT le.*, a."AccountCode", a."AccountName"
      FROM ledger_entries le
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE le."EntityId" = $1
      ORDER BY le."EntryDate"
    `, [invoiceId]);
        console.table(invLE.rows);
    }

    // Summary of all AR entries
    console.log('\n6. ALL AR ENTRIES (summary):');
    const arSummary = await pool.query(`
    SELECT 
      le."EntityType", 
      le."EntityId",
      SUM(le."DebitAmount") as debits,
      SUM(le."CreditAmount") as credits
    FROM ledger_entries le
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1200'
    GROUP BY le."EntityType", le."EntityId"
    ORDER BY le."EntityType"
  `);
    console.table(arSummary.rows);

    await pool.end();
}

checkSaleGL().catch(e => { console.error(e); process.exit(1); });
