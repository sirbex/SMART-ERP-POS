const { Pool } = require('pg');
const p = new Pool({ connectionString: 'postgresql://postgres:password@localhost:5432/pos_system' });

(async () => {
  // Check key columns for finality indicators
  const tables = ['invoices', 'supplier_invoices', 'supplier_payments', 'customer_payments',
    'invoice_payments', 'stock_movements', 'bank_transactions', 'ledger_transactions', 'cash_movements'];

  for (const t of tables) {
    const r = await p.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`, [t]);
    const cols = r.rows.map(c => `${c.column_name}(${c.data_type})`).join(', ');
    console.log(`\n${t}:`);
    console.log(`  ${cols}`);
  }

  // Check what ledger_transactions uses for immutability  
  const lt = await p.query(`SELECT DISTINCT status FROM ledger_transactions ORDER BY status LIMIT 10`);
  console.log('\nledger_transactions.status:', lt.rows.map(r => r.status));

  // Check invoices for status-like columns
  const inv = await p.query(`SELECT DISTINCT payment_status FROM invoices ORDER BY 1 LIMIT 10`);
  console.log('invoices.payment_status:', inv.rows.map(r => r.payment_status));

  // Check PascalCase Status columns
  for (const t of ['invoices', 'supplier_invoices', 'supplier_payments', 'customer_payments', 'ledger_transactions']) {
    try {
      const s = await p.query(`SELECT DISTINCT "Status" FROM ${t} ORDER BY 1`);
      console.log(`\n${t}."Status":`, s.rows.map(r => r.Status));
    } catch (e) {
      console.log(`\n${t}: no "Status" col -`, e.message.substring(0, 60));
    }
  }

  // Check bank_transactions finality
  const bt = await p.query(`SELECT DISTINCT is_reconciled, is_reversed FROM bank_transactions`);
  console.log('\nbank_transactions (is_reconciled, is_reversed):', bt.rows);

  await p.end();
})();

