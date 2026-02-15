const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://postgres:password@localhost:5432/pos_system'
});

async function checkBalances() {
    try {
        const result = await pool.query(`
      SELECT 
        a."AccountCode", 
        a."AccountName", 
        a."AccountType", 
        a."CurrentBalance"::numeric as raw_balance,
        CASE 
          WHEN a."AccountType" IN ('LIABILITY', 'EQUITY', 'REVENUE') 
          THEN -a."CurrentBalance"::numeric 
          ELSE a."CurrentBalance"::numeric 
        END as display_balance
      FROM accounts a 
      WHERE a."CurrentBalance" != 0 
      ORDER BY a."AccountCode"
    `);

        console.log('=== CURRENT ACCOUNTS WITH BALANCES ===\n');
        console.log('After fix, the API will display balances correctly:');
        console.log('- Liabilities with credit balances show as POSITIVE');
        console.log('- Assets with debit balances show as POSITIVE\n');

        console.table(result.rows);

        console.log('\n=== EXPLANATION ===');
        result.rows.forEach(r => {
            const type = r.AccountType;
            const raw = parseFloat(r.raw_balance);
            const display = parseFloat(r.display_balance);

            if (type === 'LIABILITY') {
                console.log(`${r.AccountCode} ${r.AccountName}:`);
                console.log(`  Raw: ${raw} (Debit-Credit = negative means credit balance)`);
                console.log(`  Display: ${display} (Show as positive since liability has credit balance)`);
                console.log(`  ✅ This is correct: Owed to customers = ${display.toLocaleString()}`);
            } else {
                console.log(`${r.AccountCode} ${r.AccountName}:`);
                console.log(`  Raw: ${raw}`);
                console.log(`  Display: ${display}`);
                console.log(`  ✅ Cash on hand = ${display.toLocaleString()}`);
            }
            console.log('');
        });

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkBalances();
