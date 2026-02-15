const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://postgres:password@localhost:5432/pos_system'
});

async function checkState() {
    try {
        console.log('=== ACCOUNTS TABLE (Chart of Accounts) ===');
        const accounts = await pool.query(`
      SELECT "Id", "AccountCode", "AccountName", "CurrentBalance"::numeric
      FROM accounts 
      WHERE "CurrentBalance" != 0
      ORDER BY "AccountCode"
    `);
        console.table(accounts.rows);

        console.log('\n=== ALL LEDGER TRANSACTIONS ===');
        const transactions = await pool.query(`
      SELECT "Id", "ReferenceType", "ReferenceNumber", "TransactionDate", "Description"
      FROM ledger_transactions
      ORDER BY "TransactionDate", "Id"
    `);
        console.table(transactions.rows);

        console.log('\n=== ALL LEDGER ENTRIES ===');
        const entries = await pool.query(`
      SELECT 
        a."AccountCode",
        a."AccountName",
        le."DebitAmount"::numeric as debit,
        le."CreditAmount"::numeric as credit,
        lt."ReferenceType",
        lt."ReferenceNumber"
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      ORDER BY lt."TransactionDate", le."Id"
    `);
        console.table(entries.rows);

        console.log('\n=== CALCULATED BALANCES FROM LEDGER (Source of Truth) ===');
        const calculated = await pool.query(`
      SELECT 
        a."AccountCode",
        a."AccountName",
        SUM(le."DebitAmount")::numeric as total_debit,
        SUM(le."CreditAmount")::numeric as total_credit,
        (SUM(le."DebitAmount") - SUM(le."CreditAmount"))::numeric as calculated_balance
      FROM ledger_entries le
      JOIN accounts a ON a."Id" = le."AccountId"
      GROUP BY a."AccountCode", a."AccountName"
      ORDER BY a."AccountCode"
    `);
        console.table(calculated.rows);

        console.log('\n=== COMPARISON: Accounts Table vs Ledger Calculated ===');
        const comparison = await pool.query(`
      SELECT 
        a."AccountCode",
        a."AccountName",
        a."CurrentBalance"::numeric as table_balance,
        COALESCE((
          SELECT SUM(le."DebitAmount") - SUM(le."CreditAmount")
          FROM ledger_entries le
          WHERE le."AccountId" = a."Id"
        ), 0)::numeric as ledger_balance,
        (a."CurrentBalance" - COALESCE((
          SELECT SUM(le."DebitAmount") - SUM(le."CreditAmount")
          FROM ledger_entries le
          WHERE le."AccountId" = a."Id"
        ), 0))::numeric as difference
      FROM accounts a
      WHERE a."CurrentBalance" != 0 
         OR EXISTS (SELECT 1 FROM ledger_entries le WHERE le."AccountId" = a."Id")
      ORDER BY a."AccountCode"
    `);
        console.table(comparison.rows);

        // Check for discrepancies
        const discrepancies = comparison.rows.filter(r => parseFloat(r.difference) !== 0);
        if (discrepancies.length > 0) {
            console.log('\n⚠️ DISCREPANCIES FOUND:');
            discrepancies.forEach(d => {
                console.log(`  ${d.AccountCode} ${d.AccountName}: Table=${d.table_balance}, Ledger=${d.ledger_balance}, Diff=${d.difference}`);
            });
        } else {
            console.log('\n✅ No discrepancies - accounts match ledger');
        }

        // Check customer deposits table
        console.log('\n=== POS_CUSTOMER_DEPOSITS TABLE ===');
        const deposits = await pool.query(`
      SELECT id, customer_id, deposit_number, amount::numeric, remaining_balance::numeric, status, created_at
      FROM pos_customer_deposits
      ORDER BY created_at
    `);
        console.table(deposits.rows);

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkState();
