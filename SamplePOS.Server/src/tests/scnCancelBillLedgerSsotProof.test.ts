/**
 * PROOF: Applied SCN cancel restores bill outstanding via ledger SSOT.
 *
 * Reproduces the LEXIE / SBILL-2026-0020 failure mode:
 *   - SCN applied → bill OutstandingBalance reduced
 *   - SCN cancelled → bill must return to pre-apply outstanding
 *   - Stored bill row must match lockAndComputeInvoiceOutstanding (ledger SSOT)
 *
 * Self-discovering: picks any posted open supplier bill on the connected DB.
 * Self-cleaning: created SCN is cancelled in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import pg from 'pg';
import { supplierCreditDebitNoteService } from '../modules/credit-debit-notes/creditDebitNoteService.js';
import { lockAndComputeInvoiceOutstanding } from '../modules/supplier-payments/supplierPaymentRepository.js';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system';

const NOTE_AMOUNT = 1000;

let pool: pg.Pool;
let testInvoiceId = '';
let testSupplierId = '';
const createdNoteIds: string[] = [];

async function getInvoiceOutstanding(invoiceId: string): Promise<number> {
  const res = await pool.query(
    `SELECT "OutstandingBalance" FROM supplier_invoices WHERE "Id" = $1`,
    [invoiceId],
  );
  return Number(res.rows[0]?.OutstandingBalance ?? 0);
}

async function discoverOpenBill(client: pg.PoolClient): Promise<{
  invoiceId: string;
  supplierId: string;
  invoiceNumber: string;
  outstanding: number;
} | null> {
  const res = await client.query(
    `SELECT si."Id", si."SupplierId", si."SupplierInvoiceNumber",
            si."OutstandingBalance"::numeric AS outstanding
     FROM supplier_invoices si
     WHERE si.deleted_at IS NULL
       AND COALESCE(si.document_type, 'SUPPLIER_INVOICE') = 'SUPPLIER_INVOICE'
       AND COALESCE(si.is_posted_to_gl, FALSE) = TRUE
       AND UPPER(COALESCE(si."Status", '')) NOT IN ('PAID', 'CANCELLED', 'CANCELLED', 'DELETED', 'DRAFT')
       AND si."OutstandingBalance"::numeric > $1
     ORDER BY si."OutstandingBalance"::numeric DESC
     LIMIT 1`,
    [NOTE_AMOUNT + 100],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    invoiceId: row.Id as string,
    supplierId: row.SupplierId as string,
    invoiceNumber: row.SupplierInvoiceNumber as string,
    outstanding: Number(row.outstanding),
  };
}

describe('PROOF — SCN apply/cancel bill ledger SSOT', () => {
  let invoiceOutstandingBefore = 0;
  let creditNoteId = '';
  let fixtureInvoiceNumber = '';

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
    const client = await pool.connect();
    try {
      const bill = await discoverOpenBill(client);
      if (!bill) {
        return;
      }
      testInvoiceId = bill.invoiceId;
      testSupplierId = bill.supplierId;
      fixtureInvoiceNumber = bill.invoiceNumber;
      invoiceOutstandingBefore = bill.outstanding;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    for (const noteId of createdNoteIds) {
      try {
        const res = await pool.query(
          `SELECT "Status" FROM supplier_invoices WHERE "Id" = $1`,
          [noteId],
        );
        const status = String(res.rows[0]?.Status ?? '').toUpperCase();
        if (status === 'POSTED' || status === 'APPLIED') {
          await supplierCreditDebitNoteService.cancelNote(pool, noteId, 'PROOF CLEANUP');
        }
      } catch {
        // best effort
      }
    }
    await pool.end();
  });

  it('requires a posted open supplier bill on the connected database', () => {
    if (!testInvoiceId) {
      console.warn(
        '  [PROOF SKIP] No posted supplier bill with outstanding > 1100 found. ' +
          'Seed AP data or set DATABASE_URL to a tenant with open bills.',
      );
    }
    expect(testInvoiceId).toBeTruthy();
  });

  it('captures invoice outstanding before apply', async () => {
    if (!testInvoiceId) return;
    invoiceOutstandingBefore = await getInvoiceOutstanding(testInvoiceId);
    expect(invoiceOutstandingBefore).toBeGreaterThan(NOTE_AMOUNT);
    console.log(
      `  [PROOF] Bill ${fixtureInvoiceNumber} OB before: ${invoiceOutstandingBefore}`,
    );
  });

  it('creates, posts, and applies SCN against reference bill', async () => {
    if (!testInvoiceId) return;

    const { note } = await supplierCreditDebitNoteService.createCreditNote(pool, {
      invoiceId: testInvoiceId,
      noteType: 'PARTIAL',
      reason: 'PROOF scnCancelBillLedgerSsot — apply then cancel',
      lines: [
        {
          productName: 'Proof line',
          description: 'Safe to ignore',
          quantity: 1,
          unitCost: NOTE_AMOUNT,
          taxRate: 0,
        },
      ],
    });
    creditNoteId = note.id;
    createdNoteIds.push(creditNoteId);

    await supplierCreditDebitNoteService.postNote(pool, creditNoteId);
    const applyResult = await supplierCreditDebitNoteService.applyCreditNoteToOpenBillsFIFO(
      pool,
      creditNoteId,
    );

    expect(applyResult.totalApplied).toBeCloseTo(NOTE_AMOUNT, 2);
    expect(applyResult.status).toBe('APPLIED');

    const afterApply = await getInvoiceOutstanding(testInvoiceId);
    console.log(`  [PROOF] Invoice OB after apply: ${afterApply}`);
    expect(afterApply).toBeCloseTo(invoiceOutstandingBefore - NOTE_AMOUNT, 2);
  });

  it('cancel restores bill outstanding and matches ledger SSOT', async () => {
    if (!testInvoiceId || !creditNoteId) return;

    await supplierCreditDebitNoteService.cancelNote(
      pool,
      creditNoteId,
      'PROOF — cancel must restore bill via ledger realignment',
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ledger = await lockAndComputeInvoiceOutstanding(client, testInvoiceId);
      await client.query('ROLLBACK');

      expect(ledger).not.toBeNull();
      const storedAfter = await getInvoiceOutstanding(testInvoiceId);
      const ledgerOb = Number(ledger!.outstandingBalance);

      console.log(`  [PROOF] Invoice OB after cancel (stored): ${storedAfter}`);
      console.log(`  [PROOF] Invoice OB after cancel (ledger):  ${ledgerOb}`);
      console.log(`  [PROOF] Expected (pre-apply):              ${invoiceOutstandingBefore}`);

      expect(storedAfter).toBeCloseTo(invoiceOutstandingBefore, 2);
      expect(ledgerOb).toBeCloseTo(invoiceOutstandingBefore, 2);
      expect(Math.abs(storedAfter - ledgerOb)).toBeLessThan(0.01);
    } finally {
      client.release();
    }
  });
});
