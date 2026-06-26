#!/usr/bin/env node
/**
 * Phase B — Henber AP remediation (document-level fixes, not global heal).
 *
 * Steps:
 *   1. Reverse untagged heal-ap-drift CORRECTIONs (TXN-013389, TXN-011802)
 *   2. Reverse legacy RETURN_GRN on 2100, repost to 2150/2160, create SCN
 *   3. Rebase AP caches
 *   4. Run proof-ap-drift-decompose
 *
 * Usage:
 *   node scripts/henber-ap-phase-b-remediate.mjs           # dry-run
 *   DRY_RUN=0 node scripts/henber-ap-phase-b-remediate.mjs
 */
import pg from 'pg';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DRY_RUN = process.env.DRY_RUN !== '0';
const REVERSAL_DATE = process.env.REVERSAL_DATE || new Date().toISOString().slice(0, 10);
const SYSTEM_USER = process.env.SYSTEM_USER_ID || '4971ceff-c094-41b0-bfaf-a3d88ea634a1';
const __dir = path.dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool({
  connectionString:
    process.env.HENBER_DATABASE_URL
    || 'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@209.38.203.138:5432/pos_tenant_henber_pharmacy',
});

const CORRECTIONS = [
  { id: '608e297c-6120-492d-8fa4-120a71f85824', number: 'TXN-013389' },
  { id: '2b9188be-b9a8-442e-99ca-f5b6d6e9fd75', number: 'TXN-011802' },
];

const NET_ACTIVE = `lt."Status" = 'POSTED' AND lt."IsReversed" = FALSE`;

async function reverseTxn(accountingCore, txnId, label) {
  const check = await pool.query(
    `SELECT "TransactionNumber", "IsReversed" FROM ledger_transactions WHERE "Id" = $1`,
    [txnId],
  );
  if (!check.rows.length) {
    console.log(`  skip ${label}: not found`);
    return;
  }
  if (check.rows[0].IsReversed) {
    console.log(`  skip ${check.rows[0].TransactionNumber}: already reversed`);
    return;
  }
  if (DRY_RUN) {
    console.log(`  would reverse ${check.rows[0].TransactionNumber}`);
    return;
  }
  const r = await accountingCore.reverseTransaction(
    {
      originalTransactionId: txnId,
      reversalDate: REVERSAL_DATE,
      reason: `Phase B AP remediation: reverse ${label}`,
      userId: SYSTEM_USER,
      idempotencyKey: `REVERSAL-${txnId}`,
    },
    pool,
  );
  console.log(`  reversed ${check.rows[0].TransactionNumber} → ${r.transactionNumber}`);
}

async function remediateOrphanReturnGrns(accountingCore, glEntryService, returnGrnService) {
  const orphans = await pool.query(`
    SELECT r.id AS rgrn_id, r.return_grn_number, lt."Id" AS txn_id, lt."TransactionNumber"
    FROM return_grn r
    JOIN ledger_transactions lt ON lt."ReferenceType" = 'RETURN_GRN' AND lt."ReferenceId" = r.id
    JOIN ledger_entries le ON le."TransactionId" = lt."Id"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '2100' AND ${NET_ACTIVE}
      AND NOT EXISTS (
        SELECT 1 FROM supplier_invoices si
        WHERE si.return_grn_id = r.id AND si.deleted_at IS NULL
      )
    GROUP BY r.id, r.return_grn_number, lt."Id", lt."TransactionNumber"
  `);

  for (const row of orphans.rows) {
    console.log(`\n  RGRN ${row.return_grn_number} (${row.TransactionNumber})`);
    if (DRY_RUN) {
      console.log('    would: reverse wrong GL → repost clearing → create SCN');
      continue;
    }
    try {
      await reverseTxn(accountingCore, row.txn_id, row.return_grn_number);

    const rgrn = await pool.query(
      `SELECT r.id, r.return_grn_number, r.grn_id, r.supplier_id,
              COALESCE(SUM(rl.line_total), 0)::numeric AS total,
              s."CompanyName"
       FROM return_grn r
       LEFT JOIN return_grn_lines rl ON rl.rgrn_id = r.id
       LEFT JOIN suppliers s ON s."Id" = r.supplier_id
       WHERE r.id = $1
       GROUP BY r.id, r.return_grn_number, r.grn_id, r.supplier_id, s."CompanyName"`,
      [row.rgrn_id],
    );
    const r = rgrn.rows[0];
    const invCheck = await pool.query(
      `SELECT EXISTS(
         SELECT 1 FROM supplier_invoices si
         WHERE si.deleted_at IS NULL
           AND UPPER(si."Status") NOT IN ('CANCELLED','DELETED','VOIDED')
           AND (
             si."Id" IN (SELECT invoice_id FROM supplier_invoice_grn_links WHERE grn_id = $1)
             OR si."InternalReferenceNumber" = (SELECT receipt_number FROM goods_receipts WHERE id = $1)
           )
       ) AS has_invoice`,
      [r.grn_id],
    );
    const hasInvoice = invCheck.rows[0]?.has_invoice ?? false;

    await glEntryService.recordReturnGrnToGL({
      returnGrnId: r.id,
      returnGrnNumber: r.return_grn_number,
      returnDate: REVERSAL_DATE,
      totalAmount: Number(r.total),
      supplierId: r.supplier_id,
      supplierName: r.CompanyName || 'Supplier',
      hasInvoice,
    }, pool);

    await returnGrnService.createCreditNoteFromReturn(pool, r.id);
    console.log(`    reposted GL + SCN for ${r.return_grn_number}`);
    } catch (err) {
      console.error(`    FAILED ${row.return_grn_number}:`, err?.message || err);
    }
  }
}

async function rebaseCaches() {
  if (DRY_RUN) {
    console.log('\nWould rebase 2100 + recalc supplier balances');
    return;
  }
  const { rebaseAccountCachesFromPostedLedger } = await import(
    '../dist/SamplePOS.Server/src/modules/supplier-payments/apBalanceGovernance.js'
  );
  const { syncSupplierBalanceFromOpenItems } = await import(
    '../dist/SamplePOS.Server/src/modules/supplier-payments/apReconciliationEngine.js'
  );
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await rebaseAccountCachesFromPostedLedger(client, ['2100']);
    const sups = await client.query(`SELECT "Id" FROM suppliers WHERE "IsActive" = true`);
    for (const s of sups.rows) {
      await syncSupplierBalanceFromOpenItems(client, s.Id, 'PHASE_B_REMEDIATE');
    }
    await client.query('COMMIT');
    console.log('\nRebased 2100 + supplier caches');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

try {
  console.log(`Phase B AP remediation — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  const { AccountingCore } = await import('../dist/SamplePOS.Server/src/services/accountingCore.js');
  const glEntryService = await import('../dist/SamplePOS.Server/src/services/glEntryService.js');
  const { returnGrnService } = await import(
    '../dist/SamplePOS.Server/src/modules/return-grn/returnGrnService.js'
  );

  console.log('Step 1: Reverse untagged CORRECTION heals');
  for (const c of CORRECTIONS) {
    try {
      await reverseTxn(AccountingCore, c.id, c.number);
    } catch (err) {
      console.error(`  FAILED ${c.number}:`, err?.message || err);
    }
  }

  console.log('\nStep 2: Remediate orphan RETURN_GRN on 2100');
  await remediateOrphanReturnGrns(AccountingCore, glEntryService, returnGrnService);

  console.log('\nStep 3: Rebase caches');
  await rebaseCaches();

  if (!DRY_RUN) {
    console.log('\nStep 4: Proof');
    const proof = spawnSync('node', ['scripts/proof-ap-drift-decompose.mjs'], {
      cwd: path.join(__dir, '..'),
      env: process.env,
      stdio: 'inherit',
    });
    process.exit(proof.status ?? 0);
  } else {
    console.log('\nDry run complete. DRY_RUN=0 to execute.');
  }
} catch (e) {
  console.error(e?.message || e);
  process.exit(1);
} finally {
  await pool.end();
}
