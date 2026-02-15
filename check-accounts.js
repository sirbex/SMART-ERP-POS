const { Pool } = require('pg');

async function checkAccounts() {
    const pool = new Pool({
        connectionString: 'postgresql://postgres:password@localhost:5432/pos_system'
    });

    try {
        const result = await pool.query(`
      SELECT "AccountCode", "AccountName", "AccountType" 
      FROM accounts 
      ORDER BY "AccountCode"
    `);

        console.log('\nAll Accounts in Chart of Accounts:\n');
        console.log('Code  | Name                    | Type');
        console.log('------+-------------------------+-----------');
        result.rows.forEach(row => {
            console.log(`${row.AccountCode.padEnd(5)} | ${row.AccountName.padEnd(23)} | ${row.AccountType}`);
        });
        console.log(`\nTotal: ${result.rows.length} accounts`);
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkAccounts();
