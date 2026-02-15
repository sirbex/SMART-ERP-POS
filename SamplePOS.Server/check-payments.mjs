import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: 'postgresql://postgres:password@localhost:5432/pos_system'
});

async function checkPayments() {
    // Check invoice payments
    console.log('=== INVOICE PAYMENTS ===');
    const payments = await pool.query(`SELECT * FROM invoice_payments ORDER BY created_at DESC`);
    console.table(payments.rows);

    // Check if there are GL entries for these payments
    console.log('\n=== GL ENTRIES FOR INVOICE PAYMENTS ===');
    for (const p of payments.rows) {
        const gl = await pool.query(
            `SELECT le."DebitAmount", le."CreditAmount", le."Description", a."AccountCode"
       FROM ledger_entries le
       JOIN accounts a ON a."Id" = le."AccountId"
       WHERE le."EntityId" = $1`,
            [p.id]
        );
        console.log('Payment', p.receipt_number, '- Amount:', p.amount, '- GL entries:', gl.rows.length);
        if (gl.rows.length > 0) console.table(gl.rows);
    }

    // Check the specific invoice
    console.log('\n=== INVOICE DETAILS ===');
    const inv = await pool.query(`
    SELECT "Id", "InvoiceNumber", "TotalAmount", "TaxAmount", "AmountPaid", "OutstandingBalance", "Status"
    FROM invoices WHERE "InvoiceNumber" = 'INV-2025-0001'
  `);
    console.table(inv.rows);

    await pool.end();
}

checkPayments().catch(e => { console.error(e); process.exit(1); });
