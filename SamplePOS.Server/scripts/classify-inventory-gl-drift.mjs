#!/usr/bin/env node
/**
 * Classify Inventory 1300 drift: CODE vs USER/ADMIN vs DATA (historical).
 *
 * Run on tenant DB (Henber):
 *   cd SamplePOS.Server
 *   DATABASE_URL=postgresql://... node scripts/classify-inventory-gl-drift.mjs
 */
import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(serverDir, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()])
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system',
});

const n = (v) => Number(v ?? 0);

async function main() {
  console.log('\n=== Inventory GL drift — root cause classification ===\n');

  const t = await pool.query(`
    SELECT
      (SELECT COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0)
       FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
       JOIN accounts a ON a."Id" = le."AccountId"
       WHERE a."AccountCode" = '1300'
         AND lt."Status" = 'POSTED' AND lt."IsReversed" = FALSE
         AND lt."Id" NOT IN (
           SELECT "ReversedByTransactionId" FROM ledger_transactions
           WHERE "ReversedByTransactionId" IS NOT NULL
         )) AS gl_net_active,
      (SELECT COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0)
       FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
       JOIN accounts a ON a."Id" = le."AccountId" WHERE a."AccountCode" = '1300') AS gl_all,
      (SELECT COALESCE(SUM(remaining_quantity * cost_price), 0)
       FROM inventory_batches WHERE remaining_quantity > 0) AS batches,
      (SELECT COALESCE(SUM(quantity_on_hand * COALESCE(cost_price, 0)), 0)
       FROM products WHERE quantity_on_hand > 0) AS products
  `);
  const gl = n(t.rows[0].gl_net_active);
  const glAll = n(t.rows[0].gl_all);
  const batches = n(t.rows[0].batches);
  const products = n(t.rows[0].products);
  const drift = gl - batches;
  const threshold = Math.max(5000, Math.abs(gl) * 0.0001);

  console.log(`GL 1300 (net active):  ${gl.toLocaleString()}`);
  console.log(`GL 1300 (all txns):     ${glAll.toLocaleString()}`);
  console.log(`Batch subledger:      ${batches.toLocaleString()}`);
  console.log(`Product valuation:    ${products.toLocaleString()}`);
  console.log(`Drift (GL − batch):   ${drift.toLocaleString()}`);
  console.log(`Materiality:          ${threshold.toLocaleString()}`);
  console.log(`Product vs batch:     ${(products - batches).toLocaleString()} (qty/cost sync)`);
  console.log('');

  if (Math.abs(drift) <= threshold) {
    console.log('VERDICT: Within tolerance — no investigation required.\n');
    await pool.end();
    return;
  }

  const buckets = await pool.query(`
    SELECT lt."ReferenceType" AS rt,
           ROUND(SUM(le."DebitAmount" - le."CreditAmount")::numeric, 2) AS net,
           COUNT(DISTINCT lt."Id") AS txns
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1300'
    GROUP BY lt."ReferenceType"
    ORDER BY ABS(SUM(le."DebitAmount" - le."CreditAmount")) DESC
  `);

  console.log('GL 1300 by reference type:');
  for (const r of buckets.rows) {
    console.log(`  ${String(r.rt).padEnd(22)} ${n(r.net).toLocaleString().padStart(16)}  (${r.txns} txns)`);
  }

  const corrections = await pool.query(`
    SELECT lt."ReferenceNumber", lt."Description",
           ROUND(SUM(le."DebitAmount" - le."CreditAmount")::numeric, 2) AS net,
           lt."IsReversed", lt."CreatedAt"::date AS created
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1300'
      AND (lt."ReferenceType" IN ('CORRECTION','SYSTEM_CORRECTION','OPENING_BALANCE','OPENING_STOCK')
           OR lt."Description" ILIKE '%drift%'
           OR lt."Description" ILIKE '%inventory%correct%'
           OR lt."Description" ILIKE '%shrinkage%')
    GROUP BY lt."Id", lt."ReferenceNumber", lt."Description", lt."IsReversed", lt."CreatedAt"
    ORDER BY ABS(SUM(le."DebitAmount" - le."CreditAmount")) DESC
  `);

  let correctionNet = 0;
  if (corrections.rows.length) {
    console.log('\nManual / system corrections on 1300:');
    for (const r of corrections.rows) {
      const net = n(r.net);
      correctionNet += net;
      console.log(
        `  ${r.created}  ${r.ReferenceNumber || '(no ref)'}  net=${net.toLocaleString()}  rev=${r.IsReversed}  ${(r.Description || '').slice(0, 60)}`,
      );
    }
    console.log(`  → Sum correction net on 1300: ${correctionNet.toLocaleString()}`);
  }

  const dupAll = await pool.query(`
    WITH inv_txns AS (
      SELECT lt."Id", lt."ReferenceType", lt."ReferenceId", lt."ReferenceNumber",
             lt."CreatedAt",
             COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0) AS inv_1300_net
      FROM ledger_transactions lt
      JOIN ledger_entries le ON le."TransactionId" = lt."Id"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '1300'
        AND lt."IsReversed" = FALSE AND lt."Status" = 'POSTED'
        AND lt."Id" NOT IN (
          SELECT "ReversedByTransactionId" FROM ledger_transactions
          WHERE "ReversedByTransactionId" IS NOT NULL
        )
        AND lt."ReferenceType" IN (
          'GOODS_RECEIPT','RETURN_GRN','SALE','SALE_COGS','STOCK_MOVEMENT',
          'OPENING_STOCK','OPENING_BALANCE','DELIVERY_NOTE_PGI','CORRECTION','SYSTEM_CORRECTION'
        )
        AND lt."ReferenceId" IS NOT NULL
      GROUP BY lt."Id", lt."ReferenceType", lt."ReferenceId", lt."ReferenceNumber", lt."CreatedAt"
    ),
    grouped AS (
      SELECT reference_type, reference_id, reference_number,
             COUNT(*) AS txn_count,
             ROUND(SUM(inv_1300_net)::numeric, 2) AS total_net
      FROM (
        SELECT "ReferenceType" AS reference_type, "ReferenceId" AS reference_id,
               "ReferenceNumber" AS reference_number, inv_1300_net
        FROM inv_txns
      ) x
      GROUP BY reference_type, reference_id, reference_number
      HAVING COUNT(*) > 1
    )
    SELECT reference_type, reference_number, txn_count, total_net
    FROM grouped
    ORDER BY ABS(total_net) DESC
    LIMIT 25
  `);

  if (dupAll.rows.length) {
    console.log('\nDuplicate inventory GL postings (all reference types):');
    let dupInflation = 0;
    for (const r of dupAll.rows) {
      console.log(
        `  ${String(r.reference_type).padEnd(20)} ${r.reference_number || '(no ref)'}  `
        + `${r.txn_count} txns  net=${n(r.total_net).toLocaleString()}`,
      );
      dupInflation += n(r.total_net);
    }
    console.log(`  → ${dupAll.rows.length} duplicate group(s) on 1300`);
  }

  const dupGr = await pool.query(`
    SELECT lt."ReferenceId", lt."ReferenceNumber",
           COUNT(DISTINCT lt."Id") AS gl_txn_count,
           ROUND(SUM(le."DebitAmount")::numeric, 2) AS total_dr
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1300'
      AND lt."ReferenceType" = 'GOODS_RECEIPT'
      AND lt."IsReversed" = FALSE
    GROUP BY lt."ReferenceId", lt."ReferenceNumber"
    HAVING COUNT(DISTINCT lt."Id") > 1
    ORDER BY total_dr DESC
    LIMIT 10
  `);

  if (dupGr.rows.length) {
    console.log('\nDuplicate GR GL postings (CODE bug or re-post DATA):');
    for (const r of dupGr.rows) {
      console.log(`  ${r.ReferenceNumber}  ${r.gl_txn_count} txns  DR=${n(r.total_dr).toLocaleString()}`);
    }
  }

  const expenseOn1300 = await pool.query(`
    SELECT ROUND(SUM(le."DebitAmount" - le."CreditAmount")::numeric, 2) AS net
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1300'
      AND lt."ReferenceType" IN ('SUPPLIER_INVOICE','EXPENSE')
  `);
  const expNet = n(expenseOn1300.rows[0]?.net);
  if (Math.abs(expNet) > 1000) {
    console.log(`\nSupplier invoice / expense on 1300 (should be rare): net=${expNet.toLocaleString()}`);
  }

  const cogsVsBatch = await pool.query(`
    WITH sale_gl AS (
      SELECT COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0) AS cogs_gl
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '1300'
        AND lt."ReferenceType" IN ('SALE','SALE_COGS')
        AND lt."IsReversed" = FALSE
    ),
    sale_mov AS (
      SELECT COALESCE(SUM(ABS(sm.quantity) * sm.unit_cost), 0) AS cogs_mov
      FROM stock_movements sm
      WHERE sm.reference_type = 'SALE' AND sm.quantity < 0
    )
    SELECT * FROM sale_gl, sale_mov
  `);
  const cogsGl = n(cogsVsBatch.rows[0]?.cogs_gl);
  const cogsMov = n(cogsVsBatch.rows[0]?.cogs_mov);
  const cogsGap = cogsGl - cogsMov;
  console.log(`\nSales COGS: GL credits 1300=${cogsGl.toLocaleString()}  batch movements=${cogsMov.toLocaleString()}  gap=${cogsGap.toLocaleString()}`);
  if (cogsGap > 50000) {
    console.log('  → If gap ≈ drift: CODE (COGS posting ≠ batch cost) or DATA (old sales before fix)');
  }

  const unposted = await pool.query(`
    SELECT COUNT(*)::int AS cnt,
           COALESCE(SUM(ABS(sm.quantity) * sm.unit_cost), 0) AS val
    FROM stock_movements sm
    WHERE sm.reference_type IN ('GOODS_RECEIPT','SALE','RETURN_GRN')
      AND sm.reference_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM ledger_transactions lt
        WHERE lt."ReferenceId" = sm.reference_id AND lt."IsReversed" = FALSE
      )
  `);
  const unpostedCnt = n(unposted.rows[0]?.cnt);
  const unpostedVal = n(unposted.rows[0]?.val);
  if (unpostedCnt > 0) {
    console.log(`\nStock movements without GL: ${unpostedCnt} refs, value≈${unpostedVal.toLocaleString()}`);
    console.log('  → Would make GL LOWER than batches (opposite of your drift if this dominates)');
  }

  console.log('\n--- CLASSIFICATION (read top signals) ---');
  const pctCorr = Math.abs(correctionNet) / Math.abs(drift || 1);
  const signs = [];

  if (Math.abs(products - batches) < threshold) {
    signs.push('Subledger OK: products and batches agree → not a qty-sync code bug today.');
  } else {
    signs.push('Subledger split: product vs batch mismatch → investigate sync / movements.');
  }

  if (drift > 0) {
    signs.push('GL OVERSTATED vs batches: extra DR (or missing COGS CR) on 1300.');
  } else {
    signs.push('GL UNDERSTATED vs batches: missing GR DR or excess COGS CR.');
  }

  if (Math.abs(correctionNet) > threshold * 0.5) {
    signs.push(
      `DATA/ADMIN (~${(pctCorr * 100).toFixed(0)}% of drift): SYSTEM_CORRECTION / drift-fix / opening entries on 1300.`,
    );
  }
  if (dupAll.rows.length) {
    signs.push('DATA or historical CODE: duplicate GL for same business reference on 1300 — run remediate-inventory-duplicates before heal.');
  }
  if (dupGr.rows.length) {
    signs.push('DATA or historical CODE: duplicate GOODS_RECEIPT GL for same GR.');
  }
  if (Math.abs(expNet) > threshold * 0.1) {
    signs.push('USER/DATA: supplier bills or expenses wrongly hit inventory 1300.');
  }
  if (Math.abs(cogsGap) > threshold * 0.5 && drift > 0) {
    signs.push('CODE or DATA: cumulative sale COGS ≠ batch consumption (pricing/FEFO era).');
  }
  if (
    !corrections.rows.length &&
    !dupAll.rows.length &&
    !dupGr.rows.length &&
    Math.abs(expNet) < 1000 &&
    Math.abs(cogsGap) < threshold
  ) {
    signs.push('No obvious smoking gun in SQL — run on PRODUCTION DB; check henber TXN-000131-style duplicates.');
  }

  for (const s of signs) console.log(`  • ${s}`);

  console.log(`
Likely verdict for Henber-scale drift (~903k on ~109M):
  • NOT a broken reconciliation report (math is correct).
  • NOT "user entered wrong qty" if product=batch (operational qty is consistent).
  • Usually DATA + ADMIN: past GL corrections, duplicate posts, or heal scripts — see INVESTIGATION / reverseDuplicateTxn131.
  • Ongoing CODE bug only if duplicate GR GL or COGS mismatch still appears on NEW documents after deploy.

Do NOT run fixInventoryGLDrift --apply until this script is run on the tenant DB and cause is named.
Recommended order: (1) classify, (2) POST remediate-inventory-duplicates, (3) POST heal-inventory-drift.
`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
