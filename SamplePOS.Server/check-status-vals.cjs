const { Pool } = require('pg');
const p = new Pool({ connectionString: 'postgresql://postgres:password@localhost:5432/pos_system' });

(async () => {
  let passed = 0;
  let failed = 0;

  async function expectError(label, sql, params = []) {
    try {
      await p.query('BEGIN');
      await p.query(sql, params);
      await p.query('ROLLBACK');
      console.log(`FAIL: ${label} - expected error but query succeeded`);
      failed++;
    } catch (e) {
      await p.query('ROLLBACK');
      if (e.message.includes('Cannot modify') || e.message.includes('Cannot delete') ||
        e.message.includes('immutable') || e.message.includes('cannot')) {
        console.log(`PASS: ${label} - ${e.message.substring(0, 80)}`);
        passed++;
      } else {
        console.log(`FAIL: ${label} - unexpected error: ${e.message.substring(0, 80)}`);
        failed++;
      }
    }
  }

  async function expectSuccess(label, sql, params = []) {
    try {
      await p.query('BEGIN');
      await p.query(sql, params);
      await p.query('ROLLBACK');
      console.log(`PASS: ${label}`);
      passed++;
    } catch (e) {
      await p.query('ROLLBACK');
      console.log(`FAIL: ${label} - ${e.message.substring(0, 80)}`);
      failed++;
    }
  }

  // Get test IDs
  const sale = await p.query("SELECT id, sale_number FROM sales WHERE status='COMPLETED' LIMIT 1");
  const po = await p.query("SELECT id, order_number FROM purchase_orders WHERE status='COMPLETED' LIMIT 1");
  const gr = await p.query("SELECT id FROM goods_receipts WHERE status='COMPLETED' LIMIT 1");
  const sm = await p.query("SELECT id FROM stock_movements LIMIT 1");

  console.log('=== IMMUTABILITY ENFORCEMENT TESTS ===\n');

  // 1. Sales
  if (sale.rows.length > 0) {
    const sid = sale.rows[0].id;
    await expectError('Sale: block amount change on COMPLETED',
      `UPDATE sales SET total_amount = 0 WHERE id = $1`, [sid]);
    await expectError('Sale: block status change to DRAFT',
      `UPDATE sales SET status = 'DRAFT' WHERE id = $1`, [sid]);
    await expectSuccess('Sale: allow void transition',
      `UPDATE sales SET status = 'VOID', void_reason = 'test' WHERE id = $1`, [sid]);
  }

  // 2. Purchase Orders
  if (po.rows.length > 0) {
    const pid = po.rows[0].id;
    await expectError('PO: block update on COMPLETED',
      `UPDATE purchase_orders SET total_amount = 0 WHERE id = $1`, [pid]);
  }

  // 3. Goods Receipts
  if (gr.rows.length > 0) {
    const gid = gr.rows[0].id;
    await expectError('GR: block update on COMPLETED',
      `UPDATE goods_receipts SET total_value = 0 WHERE id = $1`, [gid]);
  }

  // 4. Stock Movements (append-only)
  if (sm.rows.length > 0) {
    const mid = sm.rows[0].id;
    await expectError('StockMovement: block UPDATE',
      `UPDATE stock_movements SET quantity = 0 WHERE id = $1`, [mid]);
    await expectError('StockMovement: block DELETE',
      `DELETE FROM stock_movements WHERE id = $1`, [mid]);
  }

  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);

  await p.end();
})();
