import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:password@localhost:5432/pos_system'
});

async function checkSchema() {
  // Check expenses columns
  console.log('EXPENSES TABLE SCHEMA:');
  const exp = await pool.query(`
    SELECT column_name, data_type, is_nullable FROM information_schema.columns 
    WHERE table_name = 'expenses' ORDER BY ordinal_position
  `);
  console.table(exp.rows);

  // Check sales columns
  console.log('\nSALES TABLE SCHEMA:');
  const sal = await pool.query(`
    SELECT column_name, data_type, is_nullable FROM information_schema.columns 
    WHERE table_name = 'sales' ORDER BY ordinal_position
  `);
  console.table(sal.rows);

  // Check journal_entry_lines columns
  console.log('\nJOURNAL_ENTRY_LINES columns:');
  const jel = await pool.query(`
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name = 'journal_entry_lines' ORDER BY ordinal_position
  `);
  console.table(jel.rows);

  // Check ledger_entries columns
  console.log('\nLEDGER_ENTRIES columns:');
  const le = await pool.query(`
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name = 'ledger_entries' ORDER BY ordinal_position
  `);
  console.table(le.rows);

  // Check accounts columns
  console.log('\nACCOUNTS columns:');
  const acc = await pool.query(`
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name = 'accounts' ORDER BY ordinal_position
  `);
  console.table(acc.rows);

  // Check vw_account_balances
  console.log('\nVW_ACCOUNT_BALANCES structure:');
  const vw = await pool.query(`
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name = 'vw_account_balances' ORDER BY ordinal_position
  `);
  console.table(vw.rows);

  await pool.end();
}

checkSchema().catch(e => { console.error(e); process.exit(1); });
