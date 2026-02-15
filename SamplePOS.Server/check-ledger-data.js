import pg from 'pg';
const { Pool } = pg;

async function checkLedgerData() {
    const pool = new Pool({
        connectionString: 'postgresql://postgres:password@localhost:5432/pos_system'
    });

    try {
        // Get recent ledger transactions
        const result = await pool.query(`
      SELECT 
        "TransactionNumber", 
        "ReferenceNumber", 
        "TransactionDate"::text as date,
        "Description",
        CAST("TotalDebitAmount" AS FLOAT) as debit,
        CAST("TotalCreditAmount" AS FLOAT) as credit
      FROM ledger_transactions 
      ORDER BY "TransactionDate" DESC 
      LIMIT 10
    `);

        console.log('\nRecent Ledger Transactions:\n');
        result.rows.forEach(row => {
            console.log(`${row.TransactionNumber} | ${row.date} | ${row.Description?.substring(0, 50) || 'N/A'}`);
            console.log(`  Reference: ${row.ReferenceNumber}`);
            console.log(`  Debit: ${row.debit}, Credit: ${row.credit}\n`);
        });

        // Check if references match real sales
        console.log('\n--- Checking if ledger references match real sales ---\n');

        const salesCheck = await pool.query(`
      SELECT 
        lt."ReferenceNumber" as ledger_ref,
        s.id as sale_id,
        s.sale_number
      FROM ledger_transactions lt
      LEFT JOIN sales s ON s.id::text = lt."ReferenceNumber"
      ORDER BY lt."TransactionDate" DESC
      LIMIT 10
    `);

        salesCheck.rows.forEach(row => {
            const matched = row.sale_id ? '✅ MATCHED' : '❌ NO MATCH';
            console.log(`${row.ledger_ref} -> ${matched} ${row.sale_number || ''}`);
        });

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkLedgerData();
