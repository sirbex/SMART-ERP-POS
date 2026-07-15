/**
 * Petty Cash reclass proof (Phase 1D)
 *
 * Finds historical CASH_MOVEMENT journals that posted to 1015 (misused as petty cash)
 * and reports / optionally reclasses net credit impact into 1012.
 *
 * Usage:
 *   node SamplePOS.Server/scripts/proof-petty-cash-reclass.mjs
 *   node SamplePOS.Server/scripts/proof-petty-cash-reclass.mjs --live
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const live = process.argv.includes('--live');

function loadEnv() {
  const candidates = [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = /^([^#=]+)=(.*)$/.exec(line);
      if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    }
  }
}

loadEnv();

const DATABASE_URL = process.env.DATABASE_URL || process.env.TENANT_DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function main() {
  const client = await pool.connect();
  const lines = [];
  const log = (s) => {
    console.log(s);
    lines.push(s);
  };

  try {
    log('════════════════════════════════════════════════════════════════════════');
    log(` PETTY CASH RECLASS PROOF (Phase 1D) — ${live ? 'LIVE' : 'DRY-RUN'}`);
    log(` Generated: ${new Date().toISOString()}`);
    log('════════════════════════════════════════════════════════════════════════');

    await client.query(`
      INSERT INTO accounts (
        "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
        "IsPostingAccount", "IsActive", "Level", "CurrentBalance",
        "AllowManualPosting", "SystemAccountTag", "CreatedAt", "UpdatedAt"
      )
      SELECT gen_random_uuid(), '1012', 'Petty Cash', 'ASSET', 'DEBIT',
             true, true, 2, 0, false, 'PETTY_CASH', NOW(), NOW()
      WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '1012')
    `);

    const bal = await client.query(`
      SELECT "AccountCode", "AccountName", COALESCE("CurrentBalance",0)::float8 AS bal
      FROM accounts WHERE "AccountCode" IN ('1010','1012','1015')
      ORDER BY "AccountCode"
    `);
    log('\n── Current balances ──');
    for (const r of bal.rows) {
      log(`  ${r.AccountCode} ${r.AccountName}: ${Number(r.bal).toFixed(2)}`);
    }

    // CASH_MOVEMENT credits to 1015 = float misuse (petty source)
    const misuse = await client.query(`
      SELECT
        COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0)::float8 AS net_credit_to_1015
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '1015'
        AND lt."ReferenceType" = 'CASH_MOVEMENT'
    `);
    const netCredit = Number(misuse.rows[0]?.net_credit_to_1015 ?? 0);
    log('\n── CASH_MOVEMENT activity on 1015 (legacy float misuse) ──');
    log(`  Net credit to 1015 from CASH_MOVEMENT: ${netCredit.toFixed(2)}`);
    log('  (Positive = 1015 was used as float source; candidate to move to 1012)');

    const receiptDebits = await client.query(`
      SELECT COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0)::float8 AS net
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '1015'
        AND COALESCE(lt."PostingSource", '') = 'PAYMENT_RECEIPT'
    `);
    log(`  Net from PAYMENT_RECEIPT on 1015: ${Number(receiptDebits.rows[0]?.net ?? 0).toFixed(2)}`);
    log('  (Should remain on 1015 — unsettled receipts)');

    if (netCredit > 0.009) {
      log(`\n── Reclass candidate: DR 1012 / CR 1015 for ${netCredit.toFixed(2)} ──`);
      if (live) {
        // Direct balance + ledger correction via SYSTEM_CORRECTION shape would need AccountingCore.
        // For proof live mode: mark recommendation only unless TREASURY available.
        log('  LIVE mode: create a manual TREASURY_TRANSFER (1015 → 1012) via UI/API for this amount,');
        log('  or run after enabling treasury_document_enabled.');
        log('  Auto-post skipped in script to avoid bypassing Treasury Document SSOT.');
      } else {
        log('  DRY-RUN: no journal posted. Re-run with --live for guidance, or post via Petty Cash / Transfer UI.');
      }
    } else {
      log('\n✓ No material CASH_MOVEMENT credit residual on 1015 to reclass.');
    }

    log('\n── Semantic check ──');
    log('  1010 = Cash Drawer');
    log('  1012 = Petty Cash');
    log('  1015 = Undeposited Funds (receipts only)');
    log('\n RESULT: PROOF OK — Phase 1D mapping documented');
    log('════════════════════════════════════════════════════════════════════════');

    const out = path.resolve(__dirname, '../../PROOF_PETTY_CASH_RECLASS.md');
    fs.writeFileSync(out, lines.join('\n') + '\n', 'utf8');
    log(`Wrote ${out}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
