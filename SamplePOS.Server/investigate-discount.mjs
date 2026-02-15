import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: 'postgresql://postgres:password@localhost:5432/pos_system'
});

async function investigateDiscount() {
    console.log('=== DISCOUNT CALCULATION INVESTIGATION ===\n');

    // Get all sales with their details
    console.log('1. ALL SALES WITH FINANCIAL DETAILS:');
    const sales = await pool.query(`
    SELECT 
      sale_number,
      subtotal,
      discount_amount,
      tax_amount,
      total_amount,
      amount_paid,
      (subtotal - discount_amount + tax_amount) as expected_total,
      (subtotal - discount_amount + tax_amount) - total_amount as difference
    FROM sales
    ORDER BY created_at DESC
  `);
    console.table(sales.rows);

    // Check sale items for the problematic sale
    console.log('\n2. SALE ITEMS FOR SALE-2025-0001:');
    const saleItems = await pool.query(`
    SELECT 
      si.id,
      si.product_name,
      si.quantity,
      si.unit_price,
      si.discount_percent,
      si.discount_amount,
      si.tax_rate,
      si.tax_amount,
      si.subtotal,
      si.total_amount,
      (si.quantity * si.unit_price) as line_gross,
      (si.quantity * si.unit_price - si.discount_amount) as line_after_discount,
      (si.quantity * si.unit_price - si.discount_amount + si.tax_amount) as expected_line_total
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    WHERE s.sale_number = 'SALE-2025-0001'
  `);
    console.table(saleItems.rows);

    // Show the calculation breakdown
    console.log('\n3. CALCULATION BREAKDOWN:');
    for (const item of saleItems.rows) {
        console.log(`\nProduct: ${item.product_name}`);
        console.log(`  Qty × Price: ${item.quantity} × ${item.unit_price} = ${item.line_gross}`);
        console.log(`  Discount: ${item.discount_amount} (${item.discount_percent}%)`);
        console.log(`  After Discount: ${item.line_after_discount}`);
        console.log(`  Tax: ${item.tax_amount} (${item.tax_rate}%)`);
        console.log(`  Expected Total: ${item.expected_line_total}`);
        console.log(`  Actual Total: ${item.total_amount}`);
        console.log(`  Difference: ${parseFloat(item.expected_line_total) - parseFloat(item.total_amount)}`);
    }

    // Check the invoice vs sale amounts
    console.log('\n4. SALE vs INVOICE COMPARISON:');
    const comparison = await pool.query(`
    SELECT 
      s.sale_number,
      s.subtotal as sale_subtotal,
      s.discount_amount as sale_discount,
      s.tax_amount as sale_tax,
      s.total_amount as sale_total,
      s.amount_paid as sale_amount_paid,
      i."InvoiceNumber",
      i."Subtotal" as invoice_subtotal,
      i."TaxAmount" as invoice_tax,
      i."TotalAmount" as invoice_total,
      i."AmountPaid" as invoice_amount_paid
    FROM sales s
    LEFT JOIN invoices i ON i."SaleId" = s.id
    WHERE s.sale_number = 'SALE-2025-0001'
  `);
    console.table(comparison.rows);

    await pool.end();
}

investigateDiscount().catch(e => { console.error(e); process.exit(1); });
