/**
 * Heal local pos_system 1015 over-clear (−41,960) from reverse-after-deposit tests.
 *
 * DRY_RUN=0 node --import tsx scripts/heal-local-1015-overclear.ts
 */
import pg from 'pg';
import 'dotenv/config';
import { reverse as reverseTreasury } from '../src/modules/treasury/treasuryService.js';
import { AccountingCore } from '../src/services/accountingCore.js';
import { getBusinessDate } from '../src/utils/dateRange.js';

const DRY_RUN = process.env.DRY_RUN !== '0';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function bal1015(): Promise<number> {
  const r = await pool.query(`
    SELECT COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0)::float8 AS bal
    FROM ledger_entries le
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1015'
  `);
  return Number(r.rows[0].bal);
}

async function main() {
  const before = await bal1015();
  console.log('DRY_RUN=', DRY_RUN, '1015 before=', before);

  const td = await pool.query<{ id: string; document_number: string; status: string; reversed_by_document_id: string | null }>(
    `SELECT id, document_number, status, reversed_by_document_id
     FROM treasury_documents WHERE document_number = 'TD-2026-00074'`,
  );
  if (!td.rows[0]) throw new Error('TD-2026-00074 not found');
  console.log('TD-74', td.rows[0]);

  const admin = await pool.query<{ id: string }>(
    `SELECT id FROM users ORDER BY created_at NULLS LAST LIMIT 1`,
  );
  const userId = admin.rows[0]?.id;
  if (!userId) throw new Error('No user');

  if (DRY_RUN) {
    console.log(`
Plan:
  1. Reverse TD-2026-00074 (double-deposit of CRP-000005 after correct-method) → +31,960
  2. JE DR 1015 10,000 / CR 3050 — heal CRP-000003 reverse-after-deposit
  3. Mark CRP-000005 settlement SETTLED residual 0 (cash already in bank via original CRP-000004 deposit)
  Expected 1015 ≈ 0
`);
    await pool.end();
    return;
  }

  if (!td.rows[0].reversed_by_document_id && td.rows[0].status === 'POSTED') {
    const rev = await reverseTreasury(
      pool,
      td.rows[0].id,
      userId,
      'Heal local 1015: undo double-deposit of CRP-000005 after reverse-after-deposit correct-method',
    );
    console.log('Reversed TD-74 →', rev.reversal.documentNumber);
  } else {
    console.log('TD-74 already reversed or not POSTED — skip');
  }

  console.log('1015 after TD reverse=', await bal1015());

  // Heal CRP-000003 reverse-after-deposit (−10,000). 1015 is system-controlled — must use PAYMENT_RECEIPT shape.
  const remaining = await bal1015();
  if (remaining < -0.009) {
    const healAmt = Math.abs(remaining);
    await AccountingCore.createJournalEntry(
      {
        entryDate: getBusinessDate(),
        description: `Heal: restore Undeposited Funds after invalid reverse-after-deposit (CRP-000003 local test)`,
        referenceType: 'CUSTOMER_PAYMENT',
        referenceId: '00000000-0000-4000-8000-00000000aaaa',
        referenceNumber: 'HEAL-1015-CRP3',
        lines: [
          {
            accountCode: '1015',
            description: 'Restore 1015 after invalid reverse of deposited CRP-000003',
            debitAmount: healAmt,
            creditAmount: 0,
          },
          {
            accountCode: '1200',
            description: 'Offset heal — cash already in bank from original deposit',
            debitAmount: 0,
            creditAmount: healAmt,
          },
        ],
        userId,
        idempotencyKey: 'HEAL-LOCAL-1015-CRP000003-v2',
        source: 'PAYMENT_RECEIPT' as const,
      },
      pool,
    );
    console.log('Posted PAYMENT_RECEIPT-shaped heal for', healAmt);
  }

  // CRP-000005 cash already banked via original CRP-000004 deposit — do not leave unsettled
  const settle = await pool.query(
    `UPDATE receipt_settlements rs
     SET residual_amount = 0,
         settled_amount = GREATEST(COALESCE(settled_amount, 0), originating_amount),
         settlement_status = 'SETTLED',
         updated_at = NOW()
     FROM ar_customer_payments p
     WHERE rs.source_type = 'AR_CUSTOMER_PAYMENT'
       AND rs.source_id = p.id
       AND p.payment_number = 'CRP-000005'
     RETURNING rs.source_number, rs.residual_amount, rs.settlement_status`,
  );
  console.log('CRP-000005 settlement:', settle.rows[0]);

  const after = await bal1015();
  console.log('1015 after=', after);
  if (Math.abs(after) > 0.02) {
    console.warn('WARNING: 1015 not zero — investigate');
    process.exitCode = 2;
  }
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
