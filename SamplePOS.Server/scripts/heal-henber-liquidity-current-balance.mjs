#!/usr/bin/env node
/**
 * Heal Henber liquidity CurrentBalance cache to LEDGER_NET_ACTIVE SSOT.
 * Hard-fail if post-heal cache ≠ net-active for 1010/1012/1015/1031/1032.
 */
import pg from 'pg';

const pool = new pg.Pool({
  connectionString:
    'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@209.38.203.138:5432/pos_tenant_henber_pharmacy',
  connectionTimeoutMillis: 25000,
});

const money = (n) => Math.round(Number(n || 0) * 100) / 100;
const CODES = ['1010', '1012', '1015', '1031', '1032', '1040'];
const NET_ACTIVE = `
  lt."Status" = 'POSTED'
  AND lt."IsReversed" = FALSE
  AND lt."Id" NOT IN (
    SELECT "ReversedByTransactionId"
    FROM ledger_transactions
    WHERE "ReversedByTransactionId" IS NOT NULL
  )
`;

const before = await pool.query(
  `SELECT a."AccountCode" AS code,
          a."CurrentBalance"::float8 AS cur,
          a."NormalBalance" AS nb,
          COALESCE((
            SELECT SUM(le."DebitAmount") - SUM(le."CreditAmount")
            FROM ledger_entries le
            JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
            WHERE le."AccountId"=a."Id" AND ${NET_ACTIVE}
          ),0)::float8 AS net_debit
   FROM accounts a
   WHERE a."AccountCode" = ANY($1::text[])
   ORDER BY 1`,
  [CODES],
);

const updates = [];
for (const row of before.rows) {
  const target =
    row.nb === 'CREDIT' ? money(-row.net_debit) : money(row.net_debit);
  // NormalBalance DEBIT: balance = debit - credit = net_debit
  // CREDIT: balance = credit - debit = -net_debit
  const newBal = row.nb === 'DEBIT' ? money(row.net_debit) : money(-row.net_debit);
  const old = money(row.cur);
  if (Math.abs(old - newBal) > 0.01) {
    await pool.query(
      `UPDATE accounts SET "CurrentBalance" = $2, "UpdatedAt" = NOW()
       WHERE "AccountCode" = $1`,
      [row.code, newBal],
    );
    updates.push({ code: row.code, old, newBal });
  }
}

const after = await pool.query(
  `SELECT a."AccountCode" AS code,
          a."CurrentBalance"::float8 AS cur,
          a."NormalBalance" AS nb,
          COALESCE((
            SELECT SUM(le."DebitAmount") - SUM(le."CreditAmount")
            FROM ledger_entries le
            JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
            WHERE le."AccountId"=a."Id" AND ${NET_ACTIVE}
          ),0)::float8 AS net_debit,
          COALESCE((
            SELECT SUM(le."DebitAmount") - SUM(le."CreditAmount")
            FROM ledger_entries le
            JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
            WHERE le."AccountId"=a."Id" AND lt."Status"='POSTED'
          ),0)::float8 AS posted_only
   FROM accounts a
   WHERE a."AccountCode" = ANY($1::text[])
   ORDER BY 1`,
  [CODES],
);

const failures = [];
const verified = [];
for (const row of after.rows) {
  const expected = row.nb === 'DEBIT' ? money(row.net_debit) : money(-row.net_debit);
  const cur = money(row.cur);
  const po = money(row.posted_only);
  const ok = Math.abs(cur - expected) < 0.02;
  verified.push({
    code: row.code,
    currentBalance: cur,
    netActive: expected,
    postedOnly: po,
    consistent: ok,
  });
  if (!ok) failures.push({ code: row.code, cur, expected });
  if (row.code === '1015' && Math.abs(cur + 2) > 1 && Math.abs(cur + 5030642) < 1) {
    failures.push({ code: '1015', msg: 'still shows false overdraft', cur });
  }
}

const report = {
  ok: failures.length === 0,
  updates,
  verified,
  failures,
  henber1015Fixed: verified.find((v) => v.code === '1015')?.consistent === true
    && Math.abs(verified.find((v) => v.code === '1015')?.currentBalance ?? 999) < 10,
};
console.log(JSON.stringify(report, null, 2));
await pool.end();
if (!report.ok) process.exit(1);
