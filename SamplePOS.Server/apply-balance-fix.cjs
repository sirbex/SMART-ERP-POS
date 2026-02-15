// Apply the account balance fix
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: 'postgresql://postgres:password@localhost:5432/pos_system'
});

async function main() {
    try {
        const sqlPath = path.join(__dirname, '..', 'shared', 'sql', 'fix_account_balances.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Recalculating account balances from ledger entries...\n');
        const result = await pool.query(sql);

        if (Array.isArray(result)) {
            result.forEach((r, i) => {
                if (r.rows && r.rows.length > 0) {
                    console.log(`\nResult ${i + 1}:`);
                    console.table(r.rows);
                }
            });
        }

        console.log('\n✅ Account balances recalculated!');
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await pool.end();
    }
}

main();
