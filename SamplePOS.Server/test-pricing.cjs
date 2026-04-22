const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:password@localhost:5432/pos_system' });

(async () => {
  try {
    // Check existing customer groups
    const groups = await pool.query('SELECT id, name, discount_percentage, is_active FROM customer_groups LIMIT 10');
    console.log('=== CUSTOMER GROUPS ===');
    console.table(groups.rows);

    // Check customers with groups
    const customers = await pool.query('SELECT id, name, customer_group_id FROM customers WHERE customer_group_id IS NOT NULL LIMIT 5');
    console.log('=== CUSTOMERS WITH GROUPS ===');
    console.table(customers.rows);

    // Check a product around 20k price
    const products = await pool.query(
      "SELECT p.id, p.name, pv.selling_price, pv.cost_price FROM products p LEFT JOIN product_valuation pv ON pv.product_id = p.id WHERE pv.selling_price::numeric BETWEEN 15000 AND 25000 LIMIT 5"
    );
    console.log('=== PRODUCTS ~20K ===');
    console.table(products.rows);

    // Also get ANY product to work with
    const anyProduct = await pool.query(
      "SELECT p.id, p.name, pv.selling_price, pv.cost_price FROM products p LEFT JOIN product_valuation pv ON pv.product_id = p.id WHERE pv.selling_price IS NOT NULL AND pv.selling_price::numeric > 0 ORDER BY pv.selling_price::numeric LIMIT 10"
    );
    console.log('=== ALL PRODUCTS (by price) ===');
    console.table(anyProduct.rows);

    // Check pricing tiers
    const tiers = await pool.query('SELECT id, product_id, customer_group_id, min_quantity, max_quantity, calculated_price, name FROM pricing_tiers LIMIT 5');
    console.log('=== PRICING TIERS ===');
    console.table(tiers.rows);

    // Check price rules
    const rules = await pool.query("SELECT id, customer_group_id, rule_type, rule_value, min_quantity, name FROM price_rules WHERE is_active = true LIMIT 5");
    console.log('=== PRICE RULES ===');
    console.table(rules.rows);

    // Check all customers
    const allCustomers = await pool.query('SELECT id, name, customer_group_id FROM customers LIMIT 10');
    console.log('=== ALL CUSTOMERS ===');
    console.table(allCustomers.rows);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
