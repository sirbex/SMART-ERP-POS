#!/usr/bin/env node
/** Post-deploy: heal SALUD + credit-balance suppliers, verify tenant AP recon */
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.HENBER_DATABASE_URL });
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

const { repairSupplierInvoiceOutstandingFromLedger } = await import(
  '../src/modules/supplier-payments/supplierPaymentRepository.js'
);
const { syncSupplierBalanceFromOpenItems } = await import(
  '../src/modules/supplier-payments/apReconciliationEngine.js'
);

async function snap() {
  const r = await pool.query(`
    WITH gl AS (
      SELECT COALESCE(SUM(le."CreditAmount")-SUM(le."DebitAmount"),0) AS v
      FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
      JOIN accounts a ON a."Id"=le."AccountId"
      WHERE a."AccountCode"='2100' AND UPPER(le."EntityType")='SUPPLIER' AND lt."Status"='POSTED'
    ), sub AS (SELECT COALESCE(SUM("OutstandingBalance"),0) AS v FROM suppliers)
    SELECT gl.v::numeric AS gl, sub.v::numeric AS sub FROM gl, sub`);
  const gl = Number(r.rows[0].gl);
  const sub = Number(r.rows[0].sub);
  return { gl, sub, diff: gl - sub };
}

console.log('BEFORE', snap(await snap()));

const client = await pool.connect();
try {
  await client.query('BEGIN');
  const targets = await client.query(`
    SELECT s."Id", s."CompanyName",
           COALESCE(gl.net,0)::numeric AS gl_e,
           s."OutstandingBalance"::numeric AS cache
    FROM suppliers s
    LEFT JOIN LATERAL (
      SELECT SUM(le."CreditAmount")-SUM(le."DebitAmount") AS net
      FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
      JOIN accounts a ON a."Id"=le."AccountId"
      WHERE a."AccountCode"='2100' AND le."EntityId"::text=s."Id"::text
        AND UPPER(le."EntityType")='SUPPLIER' AND lt."Status"='POSTED'
    ) gl ON TRUE
    WHERE ABS(COALESCE(gl.net,0)-s."OutstandingBalance") > 0.01
  `);
  for (const s of targets.rows) {
    const inv = await repairSupplierInvoiceOutstandingFromLedger(client, s.Id);
    const { oldBalance, newBalance } = await syncSupplierBalanceFromOpenItems(client, s.Id, 'POST_DEPLOY_HEAL');
    console.log(`${s.CompanyName}: inv ${inv.repaired}/${inv.scanned}, ${fmt(oldBalance)} → ${fmt(newBalance)} (GL ${fmt(s.gl_e)})`);
    const glNet = Number(s.gl_e);
    if (glNet < -0.009 && Math.abs(newBalance - glNet) > 0.01) {
      await client.query(`UPDATE suppliers SET "OutstandingBalance"=$2,"UpdatedAt"=NOW() WHERE "Id"=$1`, [s.Id, glNet]);
      console.log(`  → credit balance ${fmt(glNet)}`);
    }
  }
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}

const after = await snap();
console.log('AFTER', { gl: fmt(after.gl), sub: fmt(after.sub), diff: fmt(after.diff), ok: Math.abs(after.diff) < 0.02 });
await pool.end();
process.exit(Math.abs(after.diff) >= 0.02 ? 1 : 0);
