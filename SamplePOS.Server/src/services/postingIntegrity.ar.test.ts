/**
 * AR posting integrity — Phase 2 regression suite.
 *
 * Asserts customer attribution on account 1200, journal balance, and refund
 * AR/cash split (open-item alignment) for every AR-touching workflow.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { JournalEntryRequest, JournalLine } from './accountingCore.js';

type MockFn = (...args: unknown[]) => Promise<unknown>;

const CUSTOMER_ID = '43eecb7b-e537-45b9-9119-641c4d1bb525';

let capturedEntries: JournalEntryRequest[] = [];
const createJournalEntryMock = jest.fn<MockFn>(async (request: unknown) => {
  capturedEntries.push(request as JournalEntryRequest);
  return {
    transactionId: 'txn-test',
    transactionNumber: 'TXN-000001',
    status: 'POSTED',
    totalDebits: 0,
    totalCredits: 0,
  };
});

jest.unstable_mockModule('./accountingCore.js', () => ({
  AccountingCore: {
    createJournalEntry: createJournalEntryMock,
    reverseTransaction: jest.fn<MockFn>(),
  },
  AccountingError: class extends Error {
    constructor(msg: string, public readonly code: string) {
      super(msg);
      this.name = 'AccountingError';
    }
  },
}));

jest.unstable_mockModule('../db/pool.js', () => ({
  pool: { query: jest.fn<MockFn>().mockResolvedValue({ rows: [] }) },
  default: { query: jest.fn<MockFn>().mockResolvedValue({ rows: [] }) },
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule('../utils/constants.js', () => ({
  SYSTEM_USER_ID: 'system-user',
}));

const {
  recordSaleToGL,
  recordSaleRefundToGL,
  recordInvoicePaymentToGL,
  recordCustomerPaymentToGL,
  recordCustomerCreditNoteToGL,
  recordCustomerDebitNoteToGL,
  AccountCodes,
} = await import('./glEntryService.js');

function totalDebits(lines: JournalLine[]): number {
  return lines.reduce((sum, l) => sum + l.debitAmount, 0);
}

function totalCredits(lines: JournalLine[]): number {
  return lines.reduce((sum, l) => sum + l.creditAmount, 0);
}

function findArLine(lines: JournalLine[]): JournalLine | undefined {
  return lines.find((l) => l.accountCode === AccountCodes.ACCOUNTS_RECEIVABLE);
}

function assertBalanced(lines: JournalLine[]) {
  expect(Math.abs(totalDebits(lines) - totalCredits(lines))).toBeLessThan(0.001);
}

function assertCustomerAr(
  line: JournalLine | undefined,
  customerId: string,
  opts: { debit?: number; credit?: number },
) {
  expect(line).toBeDefined();
  expect(line!.entityType).toBe('customer');
  expect(line!.entityId).toBe(customerId);
  if (opts.debit !== undefined) expect(line!.debitAmount).toBe(opts.debit);
  if (opts.credit !== undefined) expect(line!.creditAmount).toBe(opts.credit);
}

describe('postingIntegrity — AR workflows (Phase 2)', () => {
  beforeEach(() => {
    capturedEntries = [];
    jest.clearAllMocks();
  });

  it('credit sale — tags AR debit with customer entity', async () => {
    await recordSaleToGL({
      saleId: 'sale-credit',
      saleNumber: 'SALE-2026-0100',
      saleDate: '2026-03-15',
      totalAmount: 10000,
      costAmount: 6000,
      paymentMethod: 'CREDIT',
      amountPaid: 0,
      customerId: CUSTOMER_ID,
      saleItems: [{ productType: 'inventory', totalPrice: 10000, unitCost: 6000, quantity: 1 }],
    });

    const lines = capturedEntries[0].lines;
    assertCustomerAr(findArLine(lines), CUSTOMER_ID, { debit: 10000 });
    assertBalanced(lines);
  });

  it('invoice payment (legacy) — tags AR credit with customer entity', async () => {
    await recordInvoicePaymentToGL({
      paymentId: 'pay-legacy',
      receiptNumber: 'RCP-001',
      paymentDate: '2026-03-15',
      amount: 5000,
      paymentMethod: 'CASH',
      invoiceId: 'inv-1',
      invoiceNumber: 'INV-001',
      customerId: CUSTOMER_ID,
    });

    const lines = capturedEntries[0].lines;
    assertCustomerAr(findArLine(lines), CUSTOMER_ID, { credit: 5000 });
    assertBalanced(lines);
  });

  it('invoice payment (SSOT) — tags AR credit with customer entity', async () => {
    await recordCustomerPaymentToGL({
      paymentId: 'pay-ssot',
      paymentNumber: 'PMT-SSOT-001',
      paymentDate: '2026-03-15',
      amount: 7500,
      paymentMethod: 'CASH',
      customerId: CUSTOMER_ID,
      customerName: 'Henber Customer',
      reducesAR: true,
    });

    const lines = capturedEntries[0].lines;
    assertCustomerAr(findArLine(lines), CUSTOMER_ID, { credit: 7500 });
    assertBalanced(lines);
  });

  it('refund — tags AR credit when arCreditAmount > 0', async () => {
    await recordSaleRefundToGL({
      refundId: 'ref-1',
      refundNumber: 'REF-001',
      saleId: 'sale-1',
      saleNumber: 'SALE-001',
      refundDate: '2026-03-15',
      reason: 'Defective',
      totalAmount: 10000,
      totalCost: 0,
      paymentMethod: 'CREDIT',
      customerId: CUSTOMER_ID,
      arCreditAmount: 10000,
    });

    const lines = capturedEntries[0].lines;
    assertCustomerAr(findArLine(lines), CUSTOMER_ID, { credit: 10000 });
    assertBalanced(lines);
  });

  it('refund of fully paid invoice — credits cash only (no AR line)', async () => {
    await recordSaleRefundToGL({
      refundId: 'ref-2',
      refundNumber: 'REF-002',
      saleId: 'sale-2',
      saleNumber: 'SALE-002',
      refundDate: '2026-03-15',
      reason: 'Overpayment return',
      totalAmount: 52800,
      totalCost: 0,
      paymentMethod: 'CREDIT',
      customerId: CUSTOMER_ID,
      arCreditAmount: 0,
    });

    const lines = capturedEntries[0].lines;
    expect(findArLine(lines)).toBeUndefined();
    const cashLine = lines.find((l) => l.accountCode === AccountCodes.CASH);
    expect(cashLine?.creditAmount).toBe(52800);
    assertBalanced(lines);
  });

  it('refund of zero-balance invoice — no AR credit (RC-B guard)', async () => {
    await recordSaleRefundToGL({
      refundId: 'ref-3',
      refundNumber: 'REF-003',
      saleId: 'sale-3',
      saleNumber: 'SALE-003',
      refundDate: '2026-03-15',
      reason: 'Goodwill',
      totalAmount: 15000,
      totalCost: 0,
      paymentMethod: 'CREDIT',
      customerId: CUSTOMER_ID,
      arCreditAmount: 0,
    });

    const lines = capturedEntries[0].lines;
    expect(findArLine(lines)).toBeUndefined();
    assertBalanced(lines);
  });

  it('partial refund — splits AR credit and cash credit', async () => {
    await recordSaleRefundToGL({
      refundId: 'ref-4',
      refundNumber: 'REF-004',
      saleId: 'sale-4',
      saleNumber: 'SALE-004',
      refundDate: '2026-03-15',
      reason: 'Partial return',
      totalAmount: 10000,
      totalCost: 0,
      paymentMethod: 'CREDIT',
      customerId: CUSTOMER_ID,
      arCreditAmount: 3000,
    });

    const lines = capturedEntries[0].lines;
    assertCustomerAr(findArLine(lines), CUSTOMER_ID, { credit: 3000 });
    const cashLine = lines.find((l) => l.accountCode === AccountCodes.CASH);
    expect(cashLine?.creditAmount).toBe(7000);
    assertBalanced(lines);
  });

  it('deposit sale — tags AR debit with customer entity', async () => {
    await recordSaleToGL({
      saleId: 'sale-deposit',
      saleNumber: 'SALE-2026-0200',
      saleDate: '2026-03-15',
      totalAmount: 8000,
      costAmount: 5000,
      paymentMethod: 'DEPOSIT',
      customerId: CUSTOMER_ID,
      saleItems: [{ productType: 'inventory', totalPrice: 8000, unitCost: 5000, quantity: 1 }],
    });

    const lines = capturedEntries[0].lines;
    assertCustomerAr(findArLine(lines), CUSTOMER_ID, { debit: 8000 });
    assertBalanced(lines);
  });

  it('credit note — tags AR credit with customer entity', async () => {
    await recordCustomerCreditNoteToGL({
      noteId: 'cn-1',
      noteNumber: 'CN-001',
      noteDate: '2026-03-15',
      subtotal: 5000,
      taxAmount: 0,
      totalAmount: 5000,
      customerId: CUSTOMER_ID,
      customerName: 'Test Customer',
    });

    const lines = capturedEntries[0].lines;
    assertCustomerAr(findArLine(lines), CUSTOMER_ID, { credit: 5000 });
    assertBalanced(lines);
  });

  it('debit note — tags AR debit with customer entity', async () => {
    await recordCustomerDebitNoteToGL({
      noteId: 'dn-1',
      noteNumber: 'DN-001',
      noteDate: '2026-03-15',
      subtotal: 2000,
      taxAmount: 0,
      totalAmount: 2000,
      customerId: CUSTOMER_ID,
      customerName: 'Test Customer',
    });

    const lines = capturedEntries[0].lines;
    assertCustomerAr(findArLine(lines), CUSTOMER_ID, { debit: 2000 });
    assertBalanced(lines);
  });

  it('opening balance pattern — CUTOVER_OB with customer entity on AR', async () => {
    const { AccountingCore } = await import('./accountingCore.js');
    await AccountingCore.createJournalEntry({
      entryDate: '2026-01-01',
      description: 'Customer opening balance',
      referenceType: 'CUSTOMER_OPENING_BALANCE',
      referenceId: 'ob-inv-1',
      referenceNumber: 'OB-INV-001',
      lines: [
        {
          accountCode: AccountCodes.ACCOUNTS_RECEIVABLE,
          description: 'Opening AR',
          debitAmount: 50000,
          creditAmount: 0,
          entityType: 'customer',
          entityId: CUSTOMER_ID,
        },
        {
          accountCode: AccountCodes.OPENING_BALANCE_EQUITY,
          description: 'Opening equity',
          debitAmount: 0,
          creditAmount: 50000,
        },
      ],
      userId: 'user-1',
      idempotencyKey: 'CUSTOMER_OB-ob-inv-1',
      source: 'CUTOVER_OB',
    });

    const lines = capturedEntries[0].lines;
    assertCustomerAr(findArLine(lines), CUSTOMER_ID, { debit: 50000 });
    assertBalanced(lines);
  });

  it('deposit sale without customerId — rejects before GL post', async () => {
    await expect(
      recordSaleToGL({
        saleId: 'sale-bad',
        saleNumber: 'SALE-BAD',
        saleDate: '2026-03-15',
        totalAmount: 1000,
        costAmount: 500,
        paymentMethod: 'DEPOSIT',
        saleItems: [{ productType: 'inventory', totalPrice: 1000, unitCost: 500, quantity: 1 }],
      }),
    ).rejects.toThrow(/customer/i);
    expect(capturedEntries).toHaveLength(0);
  });
});
