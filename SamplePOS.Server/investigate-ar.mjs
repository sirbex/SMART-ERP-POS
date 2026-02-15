import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:password@localhost:5432/pos_system'
});

async function investigate() {
  console.log('=== ACCOUNTS RECEIVABLE (1200) INVESTIGATION ===\n');

  // 1. Get account 1200 info
  console.log('1. ACCOUNT 1200 INFO:');
  const account = await pool.query(`
    SELECT "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "CurrentBalance"
    FROM accounts WHERE "AccountCode" = '1200'
  `);
  console.table(account.rows);
  const accountId = account.rows[0]?.Id;

  if (!accountId) {
    console.log('Account 1200 not found!');
    await pool.end();
    return;
  }

  // 2. GL Balance from view
  console.log('\n2. GL BALANCE (from vw_account_balances):');
  const glBalance = await pool.query(`
    SELECT account_code, account_name, total_debits, total_credits, net_balance
    FROM vw_account_balances WHERE account_code = '1200'
  `);
  console.table(glBalance.rows);

  // 3. GL Balance from journal_entry_lines
  console.log('\n3. GL BALANCE (computed from journal_entry_lines):');
  const jelBalance = await pool.query(`
    SELECT 
      SUM("DebitAmount") as total_debits,
      SUM("CreditAmount") as total_credits,
      SUM("DebitAmount") - SUM("CreditAmount") as net_balance
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel."JournalEntryId" = je."Id"
    WHERE jel."AccountId" = $1
      AND je."Status" != 'VOIDED'
  `, [accountId]);
  console.log(jelBalance.rows[0]);

  // 4. Customer Subledger Balance
  console.log('\n4. CUSTOMER SUBLEDGER (Sum of customer balances):');
  const subledger = await pool.query(`SELECT SUM(balance) as total_customer_balance FROM customers`);
  console.log(subledger.rows[0]);

  // 5. Individual customer balances
  console.log('\n5. INDIVIDUAL CUSTOMER BALANCES (non-zero):');
  const customers = await pool.query(`
    SELECT id, name, balance FROM customers WHERE balance != 0 ORDER BY balance DESC
  `);
  console.table(customers.rows);

  // 6. All journal entry lines for account 1200
  console.log('\n6. ALL JOURNAL ENTRY LINES FOR ACCOUNT 1200:');
  const jelEntries = await pool.query(`
    SELECT 
      jel."Id",
      je."TransactionId",
      je."SourceEventType",
      je."SourceEntityType",
      je."SourceEntityId",
      jel."DebitAmount",
      jel."CreditAmount",
      jel."Description",
      je."Status",
      je."EntryDate"
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel."JournalEntryId" = je."Id"
    WHERE jel."AccountId" = $1
    ORDER BY je."EntryDate"
  `, [accountId]);
  console.table(jelEntries.rows);

  // 7. Credit sales transactions
  console.log('\n7. CREDIT SALES (payment_method = CREDIT):');
  const creditSales = await pool.query(`
    SELECT s.id, s.sale_number, s.customer_id, c.name as customer_name, 
           s.total_amount, s.amount_paid, s.payment_method, s.created_at
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    WHERE s.payment_method = 'CREDIT'
    ORDER BY s.created_at
  `);
  console.table(creditSales.rows);

  // 8. Customer payments
  console.log('\n8. CUSTOMER PAYMENTS:');
  const payments = await pool.query(`
    SELECT cp."Id", cp."CustomerId", c.name as customer_name, cp."Amount", 
           cp."PaymentMethod", cp."Notes", cp."CreatedAt"
    FROM customer_payments cp
    LEFT JOIN customers c ON cp."CustomerId" = c.id
    ORDER BY cp."CreatedAt"
  `);
  console.table(payments.rows);

  // 9. Check for credit sales without corresponding GL entries
  console.log('\n9. CREDIT SALES vs GL ENTRIES COMPARISON:');
  const salesGlCheck = await pool.query(`
    SELECT 
      s.sale_number,
      s.total_amount as sale_amount,
      (SELECT SUM(jel."DebitAmount") 
       FROM journal_entry_lines jel
       JOIN journal_entries je ON jel."JournalEntryId" = je."Id"
       WHERE je."SourceEntityId" = s.id::text
         AND jel."AccountId" = $1
         AND je."Status" != 'VOIDED'
      ) as gl_debit
    FROM sales s
    WHERE s.payment_method = 'CREDIT'
  `, [accountId]);
  console.table(salesGlCheck.rows);

  // 10. Check for customer payments without corresponding GL entries
  console.log('\n10. CUSTOMER PAYMENTS vs GL ENTRIES COMPARISON:');
  const paymentsGlCheck = await pool.query(`
    SELECT 
      cp.id,
      c.name as customer_name,
      cp.amount as payment_amount,
      (SELECT SUM(jel."CreditAmount") 
       FROM journal_entry_lines jel
       JOIN journal_entries je ON jel."JournalEntryId" = je."Id"
       WHERE je."SourceEntityId" = cp.id::text
         AND jel."AccountId" = $1
         AND je."Status" != 'VOIDED'
      ) as gl_credit
    FROM customer_payments cp
    LEFT JOIN customers c ON cp.customer_id = c.id
  `, [accountId]);
  console.table(paymentsGlCheck.rows);

  // 11. Summary
  console.log('\n=== SUMMARY ===');
  const glNet = parseFloat(jelBalance.rows[0]?.net_balance || 0);
  const subledgerTotal = parseFloat(subledger.rows[0]?.total_customer_balance || 0);
  console.log(`GL Balance (Account 1200): UGX ${glNet.toFixed(2)}`);
  console.log(`Subledger Balance (Customers): UGX ${subledgerTotal.toFixed(2)}`);
  console.log(`Difference: UGX ${(glNet - subledgerTotal).toFixed(2)}`);

  await pool.end();
}

investigate().catch(e => { console.error(e); process.exit(1); });
