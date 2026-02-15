import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/samplepos'
});

async function testReports() {
  try {
    console.log('=== Testing Fixed Reports ===\n');

    // Test 1: Sales Report Query (Fixed from sales → transactions)
    console.log('1. Testing Sales Report Query...');
    const salesQuery = `
      SELECT 
        DATE(s.created_at) as period,
        COUNT(DISTINCT s.id) as transaction_count,
        SUM(si.quantity) as total_quantity_sold,
        SUM(si.price * si.quantity) as total_sales,
        SUM(si.quantity * COALESCE(si.price, 0)) as total_cost,
        AVG(s.total) as average_transaction_value
      FROM transactions s
      INNER JOIN transaction_items si ON si.transaction_id = s.id
      WHERE s.created_at BETWEEN '2025-01-01' AND '2025-12-31'
      GROUP BY DATE(s.created_at)
      ORDER BY period
      LIMIT 5
    `;
    
    const salesResult = await pool.query(salesQuery);
    console.log(`✅ Sales Report: ${salesResult.rows.length} rows returned`);
    if (salesResult.rows.length > 0) {
      console.log('   Sample:', JSON.stringify(salesResult.rows[0], null, 2));
    }

    // Test 2: Best-Selling Products Query (Fixed from sale_items → transaction_items)
    console.log('\n2. Testing Best-Selling Products Query...');
    const bestSellingQuery = `
      SELECT 
        p.id as product_id,
        p.name as product_name,
        p.sku,
        SUM(si.quantity) as quantity_sold,
        SUM(si.price * si.quantity) as total_revenue,
        COUNT(DISTINCT s.id) as transaction_count
      FROM transaction_items si
      INNER JOIN transactions s ON s.id = si.transaction_id
      INNER JOIN inventory_items p ON p.id = si.inventory_item_id
      WHERE s.created_at BETWEEN '2025-01-01' AND '2025-12-31'
      GROUP BY p.id, p.name, p.sku
      ORDER BY quantity_sold DESC
      LIMIT 5
    `;
    
    const bestSellingResult = await pool.query(bestSellingQuery);
    console.log(`✅ Best-Selling Products: ${bestSellingResult.rows.length} rows returned`);
    if (bestSellingResult.rows.length > 0) {
      console.log('   Sample:', JSON.stringify(bestSellingResult.rows[0], null, 2));
    }

    // Test 3: Payment Report Query (Fixed from sales → transactions)
    console.log('\n3. Testing Payment Report Query...');
    const paymentQuery = `
      WITH payment_summary AS (
        SELECT 
          s.payment_method,
          COUNT(*) as transaction_count,
          SUM(s.total) as total_amount
        FROM transactions s
        WHERE s.created_at BETWEEN '2025-01-01' AND '2025-12-31'
        GROUP BY s.payment_method
      ),
      grand_total AS (
        SELECT SUM(total_amount) as grand_total FROM payment_summary
      )
      SELECT 
        ps.payment_method,
        ps.transaction_count,
        ps.total_amount,
        ps.total_amount / ps.transaction_count as average_amount,
        (ps.total_amount / NULLIF(gt.grand_total, 0) * 100) as percentage_of_total
      FROM payment_summary ps
      CROSS JOIN grand_total gt
      ORDER BY ps.total_amount DESC
    `;
    
    const paymentResult = await pool.query(paymentQuery);
    console.log(`✅ Payment Report: ${paymentResult.rows.length} rows returned`);
    if (paymentResult.rows.length > 0) {
      console.log('   Sample:', JSON.stringify(paymentResult.rows[0], null, 2));
    }

    // Test 4: Profit & Loss Query (Fixed from sales/sale_items → transactions/transaction_items)
    console.log('\n4. Testing Profit & Loss Query...');
    const plQuery = `
      SELECT 
        DATE_TRUNC('month', s.created_at)::DATE as period,
        SUM(s.total) as revenue,
        SUM(si.quantity * COALESCE(si.price, 0)) as cost_of_goods_sold,
        SUM(s.total - (si.quantity * COALESCE(si.price, 0))) as gross_profit
      FROM transactions s
      INNER JOIN transaction_items si ON si.transaction_id = s.id
      WHERE s.created_at BETWEEN '2025-01-01' AND '2025-12-31'
      GROUP BY DATE_TRUNC('month', s.created_at)::DATE
      ORDER BY period
      LIMIT 5
    `;
    
    const plResult = await pool.query(plQuery);
    console.log(`✅ Profit & Loss: ${plResult.rows.length} rows returned`);
    if (plResult.rows.length > 0) {
      console.log('   Sample:', JSON.stringify(plResult.rows[0], null, 2));
    }

    console.log('\n=== All Fixed Reports Working! ===\n');
    console.log('Summary:');
    console.log(`✅ Sales Report: ${salesResult.rows.length} periods`);
    console.log(`✅ Best-Selling Products: ${bestSellingResult.rows.length} products`);
    console.log(`✅ Payment Report: ${paymentResult.rows.length} payment methods`);
    console.log(`✅ Profit & Loss: ${plResult.rows.length} periods`);
    console.log('\nAll transaction-based reports are now querying the correct tables!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

testReports();
