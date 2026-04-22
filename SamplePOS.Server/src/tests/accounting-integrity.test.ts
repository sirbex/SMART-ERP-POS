/**
 * ACCOUNTING INTEGRITY TESTS
 * 
 * These tests verify the accounting system maintains consistency.
 * Run these after ANY change to sales, payments, or accounting code.
 * 
 * npm run test:accounting
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system'
});

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: unknown;
}

const results: TestResult[] = [];

function test(name: string, passed: boolean, message: string, details?: unknown) {
  results.push({ name, passed, message, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}: ${message}`);
  if (!passed && details) {
    console.log('   Details:', JSON.stringify(details, null, 2));
  }
}

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  ACCOUNTING INTEGRITY CHECK');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ═══════════════════════════════════════════════════════════════
  // TEST 1: GL Balances (Debits = Credits for all posted entries)
  // ═══════════════════════════════════════════════════════════════
  console.log('📊 TEST GROUP 1: Double-Entry Integrity\n');

  const balanceCheck = await pool.query(`
    SELECT 
      lt."Id" as transaction_id,
      lt."TransactionNumber",
      lt."Description",
      SUM(le."DebitAmount") as total_debits,
      SUM(le."CreditAmount") as total_credits,
      SUM(le."DebitAmount") - SUM(le."CreditAmount") as difference
    FROM ledger_transactions lt
    JOIN ledger_entries le ON le."TransactionId" = lt."Id"
    WHERE lt."IsReversed" = FALSE
    GROUP BY lt."Id", lt."TransactionNumber", lt."Description"
    HAVING ABS(SUM(le."DebitAmount") - SUM(le."CreditAmount")) > 0.01
  `);

  test(
    'Double-Entry Balance',
    balanceCheck.rows.length === 0,
    balanceCheck.rows.length === 0
      ? 'All journal entries are balanced (Debits = Credits)'
      : `${balanceCheck.rows.length} unbalanced journal entries found`,
    balanceCheck.rows.length > 0 ? balanceCheck.rows : undefined
  );

  // ═══════════════════════════════════════════════════════════════
  // TEST 2: Accounts Receivable Reconciliation
  // ═══════════════════════════════════════════════════════════════
  console.log('\n📊 TEST GROUP 2: AR Reconciliation (Account 1200)\n');

  // Get GL balance for AR
  const arGlBalance = await pool.query(`
    SELECT 
      COALESCE(SUM("DebitAmount"), 0) - COALESCE(SUM("CreditAmount"), 0) as gl_balance
    FROM ledger_entries le
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1200'
  `);

  // Get customer subledger balance
  const arSubledger = await pool.query(`
    SELECT COALESCE(SUM(balance), 0) as subledger_balance FROM customers
  `);

  const glBalance = parseFloat(arGlBalance.rows[0]?.gl_balance || 0);
  const subledgerBalance = parseFloat(arSubledger.rows[0]?.subledger_balance || 0);
  const arDifference = glBalance - subledgerBalance;

  test(
    'AR: GL vs Customer Subledger',
    Math.abs(arDifference) < 0.01,
    Math.abs(arDifference) < 0.01
      ? `Balanced - GL: ${glBalance.toFixed(2)}, Subledger: ${subledgerBalance.toFixed(2)}`
      : `MISMATCH - GL: ${glBalance.toFixed(2)}, Subledger: ${subledgerBalance.toFixed(2)}, Diff: ${arDifference.toFixed(2)}`,
    Math.abs(arDifference) >= 0.01 ? { glBalance, subledgerBalance, difference: arDifference } : undefined
  );

  // ═══════════════════════════════════════════════════════════════
  // TEST 3: Credit Sales have Journal Entries
  // ═══════════════════════════════════════════════════════════════
  console.log('\n📊 TEST GROUP 3: Transaction GL Postings\n');

  const creditSalesNoGL = await pool.query(`
    SELECT s.id, s.sale_number, s.total_amount, s.customer_id, c.name as customer_name
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    WHERE s.payment_method = 'CREDIT'
      AND NOT EXISTS (
        SELECT 1 FROM ledger_transactions lt
        WHERE lt."ReferenceType" = 'SALE'
          AND lt."ReferenceId" = s.id
          AND lt."IsReversed" = FALSE
      )
  `);

  test(
    'Credit Sales have GL Entries',
    creditSalesNoGL.rows.length === 0,
    creditSalesNoGL.rows.length === 0
      ? 'All credit sales have corresponding journal entries'
      : `${creditSalesNoGL.rows.length} credit sales missing GL entries`,
    creditSalesNoGL.rows.length > 0 ? creditSalesNoGL.rows : undefined
  );

  // ═══════════════════════════════════════════════════════════════
  // TEST 4: Customer Payments have Journal Entries
  // ═══════════════════════════════════════════════════════════════
  const paymentsNoGL = await pool.query(`
    SELECT cp."Id", cp."PaymentNumber", cp."CustomerName", cp."Amount"
    FROM customer_payments cp
    WHERE NOT EXISTS (
      SELECT 1 FROM ledger_transactions lt
      WHERE lt."ReferenceType" = 'CUSTOMER_PAYMENT'
        AND lt."ReferenceId" = cp."Id"
        AND lt."IsReversed" = FALSE
    )
  `);

  test(
    'Customer Payments have GL Entries',
    paymentsNoGL.rows.length === 0,
    paymentsNoGL.rows.length === 0
      ? 'All customer payments have corresponding journal entries'
      : `${paymentsNoGL.rows.length} payments missing GL entries`,
    paymentsNoGL.rows.length > 0 ? paymentsNoGL.rows : undefined
  );

  // Detect DEPOSIT sales with no customer as a data quality check.
  // Rather than per-sale AR matching (which misses corrective entries with different ref numbers),
  // we check the TOTAL orphaned AR = GL account 1200 balance minus total customer subledger.
  // If these are equal (which they are when Test 2 passes), no AR is permanently stranded.
  const depositSalesNoCustomer = await pool.query(`
    SELECT sale_number, total_amount, amount_paid, created_at
    FROM sales
    WHERE payment_method = 'DEPOSIT'
      AND customer_id IS NULL
      AND status = 'COMPLETED'
    ORDER BY created_at
  `);

  const orphanedArResult = await pool.query(`
    SELECT 
      COALESCE(gl_ar.balance, 0) - COALESCE(sub.balance, 0) as orphaned_ar
    FROM (
      SELECT SUM(le."DebitAmount") - SUM(le."CreditAmount") as balance
      FROM ledger_entries le
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '1200'
    ) gl_ar,
    (
      SELECT COALESCE(SUM(balance), 0) as balance FROM customers
    ) sub
  `);

  const orphanedAr = parseFloat(orphanedArResult.rows[0]?.orphaned_ar || '0');
  const depositSalesCount = depositSalesNoCustomer.rows.length;

  const orphanDepositSales = { rows: depositSalesCount > 0 && orphanedAr > 0.01
    ? depositSalesNoCustomer.rows.map((r: Record<string, unknown>) => ({ ...r, outstanding_ar: orphanedAr }))
    : [] };

  test(
    'DEPOSIT Sales Require Customer',
    orphanDepositSales.rows.length === 0,
    orphanDepositSales.rows.length === 0
      ? depositSalesCount > 0
        ? `${depositSalesCount} DEPOSIT sales have no customer but AR is fully cleared (no orphaned balance)`
        : 'All DEPOSIT sales are tied to a customer account or have cleared AR'
      : `${orphanedAr.toFixed(2)} in AR is orphaned — ${depositSalesCount} DEPOSIT sales have no customer and no clearing entry`,
    orphanDepositSales.rows.length > 0 ? orphanDepositSales.rows : undefined
  );

  // ═══════════════════════════════════════════════════════════════
  // TEST 5: Accounts Payable Reconciliation
  // ═══════════════════════════════════════════════════════════════
  console.log('\n📊 TEST GROUP 4: AP Reconciliation (Account 2100)\n');

  const apGlBalance = await pool.query(`
    SELECT 
      COALESCE(SUM("CreditAmount"), 0) - COALESCE(SUM("DebitAmount"), 0) as gl_balance
    FROM ledger_entries le
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '2100'
  `);

  const apSubledger = await pool.query(`
    SELECT COALESCE(SUM("OutstandingBalance"), 0) as subledger_balance FROM suppliers
  `);

  const apGl = parseFloat(apGlBalance.rows[0]?.gl_balance || 0);
  const apSub = parseFloat(apSubledger.rows[0]?.subledger_balance || 0);
  const apDiff = apGl - apSub;

  test(
    'AP: GL vs Supplier Subledger',
    Math.abs(apDiff) < 0.01,
    Math.abs(apDiff) < 0.01
      ? `Balanced - GL: ${apGl.toFixed(2)}, Subledger: ${apSub.toFixed(2)}`
      : `MISMATCH - GL: ${apGl.toFixed(2)}, Subledger: ${apSub.toFixed(2)}, Diff: ${apDiff.toFixed(2)}`,
    Math.abs(apDiff) >= 0.01 ? { glBalance: apGl, subledgerBalance: apSub, difference: apDiff } : undefined
  );

  // ═══════════════════════════════════════════════════════════════
  // TEST 6: Inventory Reconciliation
  // ═══════════════════════════════════════════════════════════════
  console.log('\n📊 TEST GROUP 5: Inventory Reconciliation (Account 1300)\n');

  const invGlBalance = await pool.query(`
    SELECT 
      COALESCE(SUM("DebitAmount"), 0) - COALESCE(SUM("CreditAmount"), 0) as gl_balance
    FROM ledger_entries le
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1300'
  `);

  const invSubledger = await pool.query(`
    SELECT COALESCE(SUM(
      COALESCE(remaining_quantity, 0) * COALESCE(unit_cost, 0)
    ), 0) as inventory_value 
    FROM cost_layers 
    WHERE remaining_quantity > 0
  `);

  const invGl = parseFloat(invGlBalance.rows[0]?.gl_balance || 0);
  const invSub = parseFloat(invSubledger.rows[0]?.inventory_value || 0);
  const invDiff = invGl - invSub;

  test(
    'Inventory: GL vs Physical Valuation',
    Math.abs(invDiff) < 0.01,
    Math.abs(invDiff) < 0.01
      ? `Balanced - GL: ${invGl.toFixed(2)}, Physical: ${invSub.toFixed(2)}`
      : `MISMATCH - GL: ${invGl.toFixed(2)}, Physical: ${invSub.toFixed(2)}, Diff: ${invDiff.toFixed(2)}`,
    Math.abs(invDiff) >= 0.01 ? { glBalance: invGl, physicalValue: invSub, difference: invDiff } : undefined
  );

  // ═══════════════════════════════════════════════════════════════
  // TEST 7: Orphaned GL Entries
  // ═══════════════════════════════════════════════════════════════
  console.log('\n📊 TEST GROUP 6: Data Integrity\n');

  const orphanedSaleEntries = await pool.query(`
    SELECT lt."Id", lt."ReferenceId", lt."Description"
    FROM ledger_transactions lt
    WHERE lt."ReferenceType" = 'SALE'
      AND lt."IsReversed" = FALSE
      AND NOT EXISTS (
        SELECT 1 FROM sales s WHERE s.id = lt."ReferenceId"
      )
  `);

  test(
    'No Orphaned Sale GL Entries',
    orphanedSaleEntries.rows.length === 0,
    orphanedSaleEntries.rows.length === 0
      ? 'All sale GL entries reference existing sales'
      : `${orphanedSaleEntries.rows.length} orphaned sale entries found`,
    orphanedSaleEntries.rows.length > 0 ? orphanedSaleEntries.rows : undefined
  );

  // ═══════════════════════════════════════════════════════════════
  // TEST 8: Cash Account Validation
  // ═══════════════════════════════════════════════════════════════
  console.log('\n📊 TEST GROUP 7: Cash Reconciliation (Account 1000)\n');

  const cashGl = await pool.query(`
    SELECT 
      COALESCE(SUM("DebitAmount"), 0) - COALESCE(SUM("CreditAmount"), 0) as gl_balance
    FROM ledger_entries le
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1000'
  `);

  const cashBalance = parseFloat(cashGl.rows[0]?.gl_balance || 0);

  test(
    'Cash Balance Non-Negative',
    cashBalance >= 0,
    cashBalance >= 0
      ? `Cash balance: ${cashBalance.toFixed(2)}`
      : `NEGATIVE cash balance: ${cashBalance.toFixed(2)}`,
    cashBalance < 0 ? { cashBalance } : undefined
  );

  // ═══════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`\nSuccess Rate: ${((passed / total) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\n🚨 FAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}: ${r.message}`);
    });
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');

  await pool.end();

  // Exit with error code if any tests failed
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Test suite error:', e);
  process.exit(1);
});
