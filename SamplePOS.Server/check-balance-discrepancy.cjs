// Check account balance discrepancy
const { Pool } = require('pg');
const p = new Pool({ connectionString: 'postgresql://postgres:password@localhost:5432/pos_system' });

(async () => {
    console.log('=== ACCOUNTS TABLE BALANCES ===');
    const a = await p.query(`
        SELECT "AccountCode", "AccountName", "CurrentBalance" 
        FROM accounts 
        WHERE "IsActive" = true 
        ORDER BY "AccountCode"
    `);
    console.table(a.rows);

    console.log('\n=== LEDGER ENTRIES CALCULATED BALANCES ===');
    const le = await p.query(`
        SELECT 
            a."AccountCode", 
            a."AccountName", 
            SUM(le."DebitAmount") as total_debit,
            SUM(le."CreditAmount") as total_credit,
            SUM(le."DebitAmount") - SUM(le."CreditAmount") as calculated_balance 
        FROM ledger_entries le 
        JOIN accounts a ON a."Id" = le."AccountId" 
        GROUP BY a."AccountCode", a."AccountName" 
        ORDER BY a."AccountCode"
    `);
    console.table(le.rows);

    console.log('\n=== BALANCE DISCREPANCIES ===');
    const disc = await p.query(`
        WITH ledger_calc AS (
            SELECT 
                le."AccountId",
                SUM(le."DebitAmount") - SUM(le."CreditAmount") as calculated_balance
            FROM ledger_entries le
            GROUP BY le."AccountId"
        )
        SELECT 
            a."AccountCode",
            a."AccountName",
            a."CurrentBalance" as table_balance,
            COALESCE(lc.calculated_balance, 0) as ledger_balance,
            a."CurrentBalance" - COALESCE(lc.calculated_balance, 0) as difference
        FROM accounts a
        LEFT JOIN ledger_calc lc ON lc."AccountId" = a."Id"
        WHERE a."IsActive" = true
          AND ABS(a."CurrentBalance" - COALESCE(lc.calculated_balance, 0)) > 0.01
        ORDER BY a."AccountCode"
    `);

    if (disc.rows.length === 0) {
        console.log('✅ No discrepancies found!');
    } else {
        console.log('❌ Found discrepancies:');
        console.table(disc.rows);
    }

    await p.end();
})();
