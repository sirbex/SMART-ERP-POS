/**
 * Behavioral unit tests — sale customer reassignment (accounts + tax integrity).
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';

type MockFn = jest.Mock<(...args: unknown[]) => unknown>;

const mockPool = {} as Pool;

const mockRepo = {
  getSale: jest.fn<MockFn>(),
  getCustomerActive: jest.fn<MockFn>(),
  getLinkedInvoices: jest.fn<MockFn>(),
  getOpenArForSale: jest.fn<MockFn>(),
  updateSaleCustomer: jest.fn<MockFn>(),
  updateInvoiceCustomers: jest.fn<MockFn>(),
  insertEvent: jest.fn<MockFn>(),
};

const mockAccountingCore = {
  createJournalEntry: jest.fn<MockFn>(),
};

const mockSyncBalance = jest.fn<MockFn>();

jest.unstable_mockModule('./saleCustomerReassignmentRepository.js', () => ({
  saleCustomerReassignmentRepository: mockRepo,
}));

jest.unstable_mockModule('../../services/accountingCore.js', () => ({
  AccountingCore: mockAccountingCore,
  AccountingError: class AccountingError extends Error {
    code = 'TEST';
  },
}));

jest.unstable_mockModule('../../services/glEntryService.js', () => ({
  AccountCodes: { ACCOUNTS_RECEIVABLE: '1200' },
}));

jest.unstable_mockModule('../../utils/customerBalanceSync.js', () => ({
  syncCustomerBalanceFromInvoices: mockSyncBalance,
}));

jest.unstable_mockModule('../../db/unitOfWork.js', () => ({
  UnitOfWork: {
    run: async (_pool: unknown, fn: (client: unknown) => Promise<unknown>) => fn(mockPool),
  },
}));

jest.unstable_mockModule('../../utils/periodGuard.js', () => ({
  checkAccountingPeriodOpen: jest.fn<MockFn>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../utils/dateRange.js', () => ({
  getBusinessDate: () => '2026-08-06',
}));

const { saleCustomerReassignmentService } = await import('./saleCustomerReassignmentService.js');

const CUST_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CUST_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SALE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const baseInput = {
  saleId: SALE_ID,
  fromCustomerId: CUST_A,
  toCustomerId: CUST_B,
  reason: 'Wrong customer — rebill to correct account',
};

function customerRow(
  id: string,
  name: string,
  extra: Partial<{
    isActive: boolean;
    vatRegistered: boolean;
    taxExempt: boolean;
    taxProfile: string;
  }> = {},
) {
  return {
    id,
    name,
    isActive: extra.isActive ?? true,
    vatRegistered: extra.vatRegistered ?? false,
    taxExempt: extra.taxExempt ?? false,
    taxProfile: extra.taxProfile ?? 'STANDARD',
  };
}

function seedHappyPath(opts: { glAr?: number; invoiceOpen?: number; status?: string } = {}) {
  const glAr = opts.glAr ?? 0;
  const invoiceOpen = opts.invoiceOpen ?? 0;
  mockRepo.getSale.mockResolvedValue({
    id: SALE_ID,
    saleNumber: 'SALE-2026-1001',
    status: opts.status ?? 'COMPLETED',
    customerId: CUST_A,
    customerName: 'Customer A',
    totalAmount: 11800,
    amountPaid: invoiceOpen > 0 ? 0 : 11800,
    saleDate: '2026-08-01',
  });
  mockRepo.getCustomerActive.mockImplementation(async (_p: unknown, id: string) => {
    if (id === CUST_A) return customerRow(CUST_A, 'Customer A');
    if (id === CUST_B) return customerRow(CUST_B, 'Customer B', { taxExempt: true });
    return null;
  });
  mockRepo.getLinkedInvoices.mockResolvedValue(
    invoiceOpen > 0 || glAr > 0
      ? [
          {
            id: 'inv-1',
            invoiceNumber: 'INV-1',
            status: 'POSTED',
            customerId: CUST_A,
            totalAmount: 11800,
            amountPaid: 11800 - invoiceOpen,
            outstandingBalance: invoiceOpen,
          },
        ]
      : [
          {
            id: 'inv-1',
            invoiceNumber: 'INV-1',
            status: 'PAID',
            customerId: CUST_A,
            totalAmount: 11800,
            amountPaid: 11800,
            outstandingBalance: 0,
          },
        ],
  );
  mockRepo.getOpenArForSale.mockResolvedValue(glAr);
}

describe('saleCustomerReassignmentService — accounts + tax integrity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.updateSaleCustomer.mockResolvedValue(true);
    mockRepo.updateInvoiceCustomers.mockResolvedValue(1);
    mockRepo.insertEvent.mockResolvedValue('evt-1');
    mockSyncBalance.mockResolvedValue({ oldBalance: 0, newBalance: 0 });
    mockAccountingCore.createJournalEntry.mockResolvedValue({
      transactionId: 'txn-ar-1',
      transactionNumber: 'JE-AR-1',
    });
  });

  describe('preview', () => {
    it('blocks void/refunded and status not COMPLETED', async () => {
      seedHappyPath({ status: 'REFUNDED' });
      const preview = await saleCustomerReassignmentService.preview(mockPool, baseInput);
      expect(preview.blockers.some((b) => b.includes('REFUNDED'))).toBe(true);
    });

    it('blocks same customer and from-customer mismatch', async () => {
      seedHappyPath();
      const same = await saleCustomerReassignmentService.preview(mockPool, {
        ...baseInput,
        toCustomerId: CUST_A,
      });
      expect(same.blockers.some((b) => b.includes('different'))).toBe(true);

      mockRepo.getSale.mockResolvedValue({
        id: SALE_ID,
        saleNumber: 'SALE-1',
        status: 'COMPLETED',
        customerId: CUST_B,
        customerName: 'B',
        totalAmount: 1,
        amountPaid: 1,
        saleDate: '2026-08-01',
      });
      const mismatch = await saleCustomerReassignmentService.preview(mockPool, baseInput);
      expect(mismatch.blockers.some((b) => b.includes('does not match'))).toBe(true);
    });

    it('never invents 1200 JE from invoice residual alone', async () => {
      seedHappyPath({ glAr: 0, invoiceOpen: 5000 });
      const preview = await saleCustomerReassignmentService.preview(mockPool, baseInput);
      expect(preview.openArAmount).toBe(0);
      expect(preview.invoiceOutstandingAmount).toBe(5000);
      expect(preview.journalLines).toHaveLength(0);
      expect(preview.accountScope).toBe('NONE');
      expect(preview.wizardSteps.some((s) => s.code === 'RECLASS_AR')).toBe(false);
      expect(preview.warnings.some((w) => w.includes('no 1200 GL reclass'))).toBe(true);
    });

    it('builds balanced same-account 1200 reclass from GL AR only', async () => {
      seedHappyPath({ glAr: 2500, invoiceOpen: 2500 });
      const preview = await saleCustomerReassignmentService.preview(mockPool, baseInput);
      expect(preview.blockers).toHaveLength(0);
      expect(preview.openArAmount).toBe(2500);
      expect(preview.journalLines).toHaveLength(2);
      const dr = preview.journalLines.reduce((s, l) => s + l.debit, 0);
      const cr = preview.journalLines.reduce((s, l) => s + l.credit, 0);
      expect(Math.abs(dr - cr)).toBeLessThan(0.001);
      expect(preview.journalLines.every((l) => l.accountCode === '1200')).toBe(true);
      expect(preview.journalLines.find((l) => l.entityId === CUST_A)?.credit).toBe(2500);
      expect(preview.journalLines.find((l) => l.entityId === CUST_B)?.debit).toBe(2500);
      expect(preview.accountScope).toBe('AR');
      expect(preview.documentTaxImmutable).toBe(true);
    });

    it('stamps document tax immutability and tax-profile warning', async () => {
      seedHappyPath({ glAr: 0, invoiceOpen: 0 });
      const preview = await saleCustomerReassignmentService.preview(mockPool, baseInput);
      expect(preview.documentTaxImmutable).toBe(true);
      expect(preview.warnings.some((w) => /immutable/i.test(w))).toBe(true);
      expect(preview.warnings.some((w) => /tax profiles differ|tax_exempt/i.test(w))).toBe(true);
    });

    it('walk-in source: never reclasses 1200', async () => {
      mockRepo.getSale.mockResolvedValue({
        id: SALE_ID,
        saleNumber: 'SALE-W',
        status: 'COMPLETED',
        customerId: null,
        customerName: null,
        totalAmount: 100,
        amountPaid: 100,
        saleDate: '2026-08-01',
      });
      mockRepo.getCustomerActive.mockResolvedValue(customerRow(CUST_B, 'Customer B'));
      mockRepo.getLinkedInvoices.mockResolvedValue([]);
      mockRepo.getOpenArForSale.mockResolvedValue(0);

      const preview = await saleCustomerReassignmentService.preview(mockPool, {
        saleId: SALE_ID,
        fromCustomerId: null,
        toCustomerId: CUST_B,
        reason: 'Assign walk-in sale to customer B',
      });
      expect(preview.blockers).toHaveLength(0);
      expect(preview.journalLines).toHaveLength(0);
      expect(mockRepo.getOpenArForSale).not.toHaveBeenCalled();
    });
  });

  describe('execute', () => {
    it('posts balanced SYSTEM_CORRECTION AR reclass, moves invoices, syncs balances', async () => {
      seedHappyPath({ glAr: 2500, invoiceOpen: 2500 });

      const result = await saleCustomerReassignmentService.execute(mockPool, baseInput, 'user-1');

      expect(mockRepo.updateSaleCustomer).toHaveBeenCalledWith(mockPool, SALE_ID, CUST_B);
      expect(mockRepo.updateInvoiceCustomers).toHaveBeenCalledWith(
        mockPool,
        SALE_ID,
        CUST_B,
        'Customer B',
      );
      expect(mockAccountingCore.createJournalEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceType: 'CORRECTION',
          source: 'SYSTEM_CORRECTION',
          idempotencyKey: `SALE_CUSTOMER_REASSIGN-${SALE_ID}-${CUST_B}`,
          lines: expect.arrayContaining([
            expect.objectContaining({
              accountCode: '1200',
              creditAmount: 2500,
              entityType: 'customer',
              entityId: CUST_A,
            }),
            expect.objectContaining({
              accountCode: '1200',
              debitAmount: 2500,
              entityType: 'customer',
              entityId: CUST_B,
            }),
          ]),
        }),
        mockPool,
        mockPool,
      );
      expect(mockRepo.insertEvent).toHaveBeenCalled();
      expect(mockSyncBalance).toHaveBeenCalledWith(mockPool, CUST_A, 'SALE_CUSTOMER_REASSIGN_FROM');
      expect(mockSyncBalance).toHaveBeenCalledWith(mockPool, CUST_B, 'SALE_CUSTOMER_REASSIGN_TO');
      expect(result.openArReclassed).toBe(2500);
      expect(result.glTransactionId).toBe('txn-ar-1');
      expect(result.invoicesMoved).toBe(1);
    });

    it('cash/paid sale: no JE, still updates sale + invoices + audit', async () => {
      seedHappyPath({ glAr: 0, invoiceOpen: 0 });

      const result = await saleCustomerReassignmentService.execute(mockPool, baseInput, 'user-1');

      expect(mockAccountingCore.createJournalEntry).not.toHaveBeenCalled();
      expect(mockRepo.updateSaleCustomer).toHaveBeenCalled();
      expect(mockRepo.insertEvent).toHaveBeenCalledWith(
        mockPool,
        expect.objectContaining({
          accountScope: 'NONE',
          amount: 0,
          glTransactionId: null,
        }),
      );
      expect(result.openArReclassed).toBe(0);
    });

    it('refuses execute when blockers present', async () => {
      seedHappyPath({ status: 'VOID' });
      await expect(
        saleCustomerReassignmentService.execute(mockPool, baseInput, 'user-1'),
      ).rejects.toThrow(/VOID|Cannot reassign/i);
      expect(mockRepo.updateSaleCustomer).not.toHaveBeenCalled();
      expect(mockAccountingCore.createJournalEntry).not.toHaveBeenCalled();
    });
  });
});
