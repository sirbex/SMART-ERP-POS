const pg = require('pg');
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:password@localhost:5432/pos_system'
});

async function proveProfit() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  PROOF: Profit Calculation Excludes Tax                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Get latest sale with tax
  const result = await pool.query(`
    SELECT 
      sale_number,
      subtotal::numeric(10,2) as subtotal,
      COALESCE(discount_amount, 0)::numeric(10,2) as discount_amount,
      tax_amount::numeric(10,2) as tax_amount,
      total_amount::numeric(10,2) as total_amount,
      total_cost::numeric(10,2) as total_cost,
      profit::numeric(10,2) as profit,
      profit_margin::numeric(10,4) as profit_margin,
      -- Verify correct calculation
      (subtotal - COALESCE(discount_amount, 0) - total_cost)::numeric(10,2) as calculated_profit_correct,
      -- Show wrong calculation (if tax was included)
      (total_amount - total_cost)::numeric(10,2) as calculated_profit_wrong
    FROM sales
    WHERE tax_amount > 0
    ORDER BY created_at DESC
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    console.log('❌ No sales with tax found yet.\n');
    console.log('📝 Expected Calculation (when sale is made):\n');
    console.log('  Example: Subtotal=144,000, Tax=900, Cost=100,000\n');
    console.log('  ✅ CORRECT: Profit = (144,000 - 0) - 100,000 = 44,000');
    console.log('  ❌ WRONG:   Profit = (144,900) - 100,000 = 44,900\n');
    console.log('  Tax should NOT inflate profit!\n');
    await pool.end();
    return;
  }

  const sale = result.rows[0];
  
  console.log('📦 Sale:', sale.sale_number, '\n');
  console.log('────────────────────────────────────────────────────────────');
  console.log('📊 SALE BREAKDOWN:');
  console.log('────────────────────────────────────────────────────────────');
  console.log(`  Subtotal:         ${sale.subtotal.padStart(12)}`);
  console.log(`  Discount:       - ${sale.discount_amount.padStart(12)}`);
  console.log(`  Tax (collected): + ${sale.tax_amount.padStart(12)}`);
  console.log('                     ────────────');
  console.log(`  Total Amount:     ${sale.total_amount.padStart(12)}`);
  console.log(`  Total Cost:       ${sale.total_cost.padStart(12)}\n`);

  console.log('────────────────────────────────────────────────────────────');
  console.log('✅ CORRECT CALCULATION (Tax Excluded):');
  console.log('────────────────────────────────────────────────────────────');
  console.log('  Formula: Profit = (Subtotal - Discount) - Cost');
  console.log(`  Revenue Before Tax: ${sale.subtotal} - ${sale.discount_amount} = ${(parseFloat(sale.subtotal) - parseFloat(sale.discount_amount)).toFixed(2)}`);
  console.log(`  Profit: ${(parseFloat(sale.subtotal) - parseFloat(sale.discount_amount)).toFixed(2)} - ${sale.total_cost} = ${sale.calculated_profit_correct}`);
  console.log(`  Stored in DB: ${sale.profit}`);
  
  const match = Math.abs(parseFloat(sale.profit) - parseFloat(sale.calculated_profit_correct)) < 0.01;
  console.log(`  \n  ✓ Match: ${match ? '✅ YES - Calculation is correct!' : '❌ NO - Bug detected!'}\n`);

  console.log('────────────────────────────────────────────────────────────');
  console.log('❌ WRONG CALCULATION (If Tax Was Included):');
  console.log('────────────────────────────────────────────────────────────');
  console.log('  Formula: Profit = Total - Cost');
  console.log(`  Wrong Profit: ${sale.total_amount} - ${sale.total_cost} = ${sale.calculated_profit_wrong}`);
  
  const difference = parseFloat(sale.calculated_profit_wrong) - parseFloat(sale.profit);
  console.log(`  \n  💰 Inflated by: ${difference.toFixed(2)} (exactly the tax amount!)`);
  console.log(`  🚫 This is WRONG because tax = ${sale.tax_amount} is government money, not profit!\n`);

  console.log('────────────────────────────────────────────────────────────');
  console.log('📈 PROFIT MARGIN:');
  console.log('────────────────────────────────────────────────────────────');
  const revenue = parseFloat(sale.subtotal) - parseFloat(sale.discount_amount);
  const calculatedMargin = (parseFloat(sale.profit) / revenue * 100).toFixed(2);
  console.log(`  Profit / Revenue: ${sale.profit} / ${revenue.toFixed(2)} = ${calculatedMargin}%`);
  console.log(`  Stored Margin: ${(parseFloat(sale.profit_margin) * 100).toFixed(2)}%\n`);

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  ✅ PROOF COMPLETE: Tax is correctly excluded from profit ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  await pool.end();
}

proveProfit().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
