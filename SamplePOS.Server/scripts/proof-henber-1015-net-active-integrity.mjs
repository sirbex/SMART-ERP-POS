#!/usr/bin/env node
/**
 * Integrity gate: Henber 1015 + reverse-pair algebra.
 * Exits non-zero on any failed assertion. No catch swallowing.
 */
import pg from 'pg';

const pool = new pg.Pool({
  connectionString:
    'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@209.38.203.138:5432/pos_tenant_henber_pharmacy',
  connectionTimeoutMillis: 25000,
});

const money = (n) => Math.round(Number(n || 0) * 100) / 100;
const NET_ACTIVE = `
  lt."Status" = 'POSTED'
  AND lt."IsReversed" = FALSE
  AND lt."Id" NOT IN (
    SELECT "ReversedByTransactionId"
    FROM ledger_transactions
    WHERE "ReversedByTransactionId" IS NOT NULL
  )
`;

const failures = [];
function assert(cond, msg, detail) {
  if (!cond) failures.push({ msg, detail });
}

const acct = await pool.query(
  `SELECT "Id", "AccountCode", "AccountName", "NormalBalance"
   FROM accounts WHERE "AccountCode" = '1015'`,
);
assert(acct.rows.length === 1, '1015 account exists', acct.rows);
const accountId = acct.rows[0].Id;

const postedOnly = await pool.query(
  `SELECT COALESCE(SUM(le."DebitAmount"),0)::float8 d,
          COALESCE(SUM(le."CreditAmount"),0)::float8 c
   FROM ledger_entries le
   JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
   WHERE le."AccountId"=$1 AND lt."Status"='POSTED'`,
  [accountId],
);
const netActive = await pool.query(
  `SELECT COALESCE(SUM(le."DebitAmount"),0)::float8 d,
          COALESCE(SUM(le."CreditAmount"),0)::float8 c
   FROM ledger_entries le
   JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
   WHERE le."AccountId"=$1 AND ${NET_ACTIVE}`,
  [accountId],
);

const poD = money(postedOnly.rows[0].d);
const poC = money(postedOnly.rows[0].c);
const naD = money(netActive.rows[0].d);
const naC = money(netActive.rows[0].c);
const poBal = money(poD - poC);
const naBal = money(naD - naC);

// Reverse-leg contribution on 1015 (POSTED txns that are someone's ReversedByTransactionId)
const reverseLegs = await pool.query(
  `SELECT COALESCE(SUM(le."DebitAmount"),0)::float8 d,
          COALESCE(SUM(le."CreditAmount"),0)::float8 c,
          COUNT(DISTINCT lt."Id")::int AS txn_count
   FROM ledger_entries le
   JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
   WHERE le."AccountId"=$1
     AND lt."Status"='POSTED'
     AND lt."Id" IN (
       SELECT "ReversedByTransactionId" FROM ledger_transactions
       WHERE "ReversedByTransactionId" IS NOT NULL
     )`,
  [accountId],
);
const revD = money(reverseLegs.rows[0].d);
const revC = money(reverseLegs.rows[0].c);
const revSigned = money(revD - revC); // asset: DR - CR

assert(
  money(poD - naD) === revD && money(poC - naC) === revC,
  'postedOnly - netActive equals reverse-leg totals on 1015',
  { poD, poC, naD, naC, revD, revC },
);
assert(
  money(poBal - naBal) === revSigned,
  'postedOnly bal - netActive bal equals reverse-leg signed',
  { poBal, naBal, revSigned },
);

const nums = ['CRP-000006', 'CRP-000007', 'CRP-000012', 'CRP-000014'];
let orphanCr = 0;
const pairDetails = [];
for (const num of nums) {
  const orig = await pool.query(
    `SELECT lt."Id" AS id, lt."TransactionNumber" AS num, lt."Status" AS status,
            lt."IsReversed" AS is_rev, lt."ReversedByTransactionId" AS rev_by,
            COALESCE(SUM(le."DebitAmount"),0)::float8 AS d,
            COALESCE(SUM(le."CreditAmount"),0)::float8 AS c
     FROM ledger_transactions lt
     JOIN ledger_entries le ON le."TransactionId"=lt."Id"
     JOIN accounts a ON a."Id"=le."AccountId" AND a."AccountCode"='1015'
     WHERE lt."ReferenceNumber"=$1 AND lt."ReferenceType"='CUSTOMER_PAYMENT'
     GROUP BY 1,2,3,4,5`,
    [num],
  );
  assert(orig.rows.length === 1, `original journal for ${num}`, orig.rows);
  const o = orig.rows[0];
  assert(o.status === 'REVERSED' && o.is_rev === true, `${num} original REVERSED`, o);
  assert(o.rev_by, `${num} has ReversedByTransactionId`, o);
  assert(money(o.d) > 0 && money(o.c) === 0, `${num} original is DR on 1015`, o);

  const rev = await pool.query(
    `SELECT lt."Id" AS id, lt."TransactionNumber" AS num, lt."Status" AS status,
            lt."ReferenceType" AS reftype,
            COALESCE(SUM(le."DebitAmount"),0)::float8 AS d,
            COALESCE(SUM(le."CreditAmount"),0)::float8 AS c
     FROM ledger_transactions lt
     JOIN ledger_entries le ON le."TransactionId"=lt."Id"
     JOIN accounts a ON a."Id"=le."AccountId" AND a."AccountCode"='1015'
     WHERE lt."Id"=$1
     GROUP BY 1,2,3,4`,
    [o.rev_by],
  );
  assert(rev.rows.length === 1, `reverse journal for ${num}`, rev.rows);
  const r = rev.rows[0];
  assert(r.status === 'POSTED', `${num} reverse POSTED`, r);
  assert(money(r.c) === money(o.d) && money(r.d) === 0, `${num} reverse CR equals original DR`, {
    o,
    r,
  });
  orphanCr = money(orphanCr + money(r.c));
  pairDetails.push({
    payment: num,
    origDr: money(o.d),
    revCr: money(r.c),
    origTxn: o.num,
    revTxn: r.num,
  });
}

assert(orphanCr === 5_030_640, 'orphan reverse credits sum to 5,030,640', { orphanCr, pairDetails });
assert(poBal === -5_030_642, 'postedOnly balance is -5,030,642', { poBal });
assert(naBal === -2, 'netActive balance is -2', { naBal });
assert(
  money(poBal - naBal) === money(-orphanCr),
  'overdraft delta equals -orphan CR (asset sign)',
  { poBal, naBal, orphanCr },
);

// Bank GL sample: every complete reverse pair on each bank-linked GL must net 0 under net-active
const banks = await pool.query(
  `SELECT ba.id, ba.name, a."Id" AS gl_id, a."AccountCode" AS code
   FROM bank_accounts ba
   JOIN accounts a ON a."Id"=ba.gl_account_id
   WHERE ba.is_active = TRUE`,
);
const bankChecks = [];
for (const b of banks.rows) {
  const pairs = await pool.query(
    `SELECT
       o."Id" AS orig_id,
       o."TransactionNumber" AS orig_num,
       r."Id" AS rev_id,
       r."TransactionNumber" AS rev_num,
       COALESCE(SUM(CASE WHEN le."TransactionId"=o."Id" THEN le."DebitAmount" ELSE 0 END),0)::float8 AS orig_d,
       COALESCE(SUM(CASE WHEN le."TransactionId"=o."Id" THEN le."CreditAmount" ELSE 0 END),0)::float8 AS orig_c,
       COALESCE(SUM(CASE WHEN le."TransactionId"=r."Id" THEN le."DebitAmount" ELSE 0 END),0)::float8 AS rev_d,
       COALESCE(SUM(CASE WHEN le."TransactionId"=r."Id" THEN le."CreditAmount" ELSE 0 END),0)::float8 AS rev_c
     FROM ledger_transactions o
     JOIN ledger_transactions r ON r."Id"=o."ReversedByTransactionId"
     JOIN ledger_entries le ON le."TransactionId" IN (o."Id", r."Id") AND le."AccountId"=$1
     WHERE o."Status"='REVERSED' AND o."IsReversed"=TRUE
     GROUP BY 1,2,3,4`,
    [b.gl_id],
  );
  for (const p of pairs.rows) {
    const net = money(money(p.orig_d) - money(p.orig_c) + money(p.rev_d) - money(p.rev_c));
    assert(net === 0, `bank ${b.code} reverse pair nets to 0 on GL`, { bank: b, pair: p, net });
  }

  const po = await pool.query(
    `SELECT COALESCE(SUM(le."DebitAmount")-SUM(le."CreditAmount"),0)::float8 bal
     FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
     WHERE le."AccountId"=$1 AND lt."Status"='POSTED'`,
    [b.gl_id],
  );
  const na = await pool.query(
    `SELECT COALESCE(SUM(le."DebitAmount")-SUM(le."CreditAmount"),0)::float8 bal
     FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
     WHERE le."AccountId"=$1 AND ${NET_ACTIVE}`,
    [b.gl_id],
  );
  const revOnly = await pool.query(
    `SELECT COALESCE(SUM(le."DebitAmount")-SUM(le."CreditAmount"),0)::float8 bal
     FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
     WHERE le."AccountId"=$1 AND lt."Status"='POSTED'
       AND lt."Id" IN (SELECT "ReversedByTransactionId" FROM ledger_transactions WHERE "ReversedByTransactionId" IS NOT NULL)`,
    [b.gl_id],
  );
  const poB = money(po.rows[0].bal);
  const naB = money(na.rows[0].bal);
  const revB = money(revOnly.rows[0].bal);
  assert(
    money(poB - naB) === revB,
    `bank ${b.code} postedOnly-netActive = reverse-leg signed`,
    { code: b.code, poB, naB, revB },
  );
  bankChecks.push({
    code: b.code,
    name: b.name,
    pairCount: pairs.rows.length,
    postedOnly: poB,
    netActive: naB,
    reverseLegSigned: revB,
  });
}

// Verify Deposit Worksheet clearing formula (net-active) against live 1015
const clearing = await pool.query(
  `SELECT COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0)::float8 AS bal
   FROM ledger_entries le
   JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
   JOIN accounts a ON a."Id" = le."AccountId"
   WHERE a."AccountCode" = '1015'
     AND ${NET_ACTIVE}`,
);
assert(
  money(clearing.rows[0].bal) === naBal,
  'Deposit Worksheet clearing GL matches net-active 1015',
  { clearing: money(clearing.rows[0].bal), naBal },
);

// After heal: accounts.CurrentBalance for liquidity codes must match net-active.
// (Bare POSTED cache was the remaining inconsistency; heal-henber-liquidity-current-balance.mjs.)
const curRows = await pool.query(
  `SELECT a."AccountCode" AS code, a."CurrentBalance"::float8 AS cur
   FROM accounts a
   WHERE a."AccountCode" IN ('1015','1010','1031','1032')
   ORDER BY 1`,
);
const currentBalanceChecks = [];
for (const row of curRows.rows) {
  const gl = await pool.query(
    `SELECT
       (SELECT COALESCE(SUM(le."DebitAmount")-SUM(le."CreditAmount"),0)::float8
        FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
        WHERE le."AccountId"=a."Id" AND ${NET_ACTIVE}) AS na,
       (SELECT COALESCE(SUM(le."DebitAmount")-SUM(le."CreditAmount"),0)::float8
        FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
        WHERE le."AccountId"=a."Id" AND lt."Status"='POSTED') AS po
     FROM accounts a WHERE a."AccountCode"=$1`,
    [row.code],
  );
  const na = money(gl.rows[0].na);
  const po = money(gl.rows[0].po);
  const cur = money(row.cur);
  const curEqualsNetActive = Math.abs(cur - na) < 0.02;
  currentBalanceChecks.push({
    code: row.code,
    cur,
    netActive: na,
    postedOnly: po,
    curEqualsPostedOnly: Math.abs(cur - po) < 0.02,
    curEqualsNetActive,
  });
  assert(curEqualsNetActive, `${row.code} CurrentBalance matches net-active after heal`, {
    cur,
    na,
    po,
  });
}

const report = {
  ok: failures.length === 0,
  account1015: {
    postedOnly: { d: poD, c: poC, bal: poBal },
    netActive: { d: naD, c: naC, bal: naBal },
    reverseLegs: { d: revD, c: revC, signed: revSigned, txnCount: reverseLegs.rows[0].txn_count },
    orphanCrps: pairDetails,
    orphanCrTotal: orphanCr,
  },
  bankChecks,
  currentBalanceChecks,
  note:
    'Liquidity SSOT = LEDGER_NET_ACTIVE_SQL. CurrentBalance healed to match net-active on Henber liquidity codes.',
  failures,
};

console.log(JSON.stringify(report, null, 2));
await pool.end();
if (failures.length) process.exit(1);
