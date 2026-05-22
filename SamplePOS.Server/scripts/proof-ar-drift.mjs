#!/usr/bin/env node
/** Quick AR drift check — customer sum vs account 1200 */
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system',
});
const client = await pool.connect();
try {
  const ar = await client.query(`SELECT "CurrentBalance" AS bal FROM accounts WHERE "AccountCode" = '1200'`);
  const cust = await client.query(`SELECT COALESCE(SUM(balance),0) AS bal FROM customers WHERE is_active = true`);
  const arBal = Number(ar.rows[0]?.bal ?? 0);
  const custBal = Number(cust.rows[0]?.bal ?? 0);
  const drift = Math.abs(arBal - custBal);
  console.log(`AR 1200: ${arBal}`);
  console.log(`SUM(customers.balance): ${custBal}`);
  console.log(`Drift: ${drift}`);
  process.exit(drift > 0.01 ? 1 : 0);
} finally {
  client.release();
  await pool.end();
}
