/**
 * Phase F — supplier reassignment unit tests
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';

type MockFn = jest.Mock<(...args: unknown[]) => unknown>;

const mockPool = {} as Pool;

const mockEligibility = {
    previewCorrection: jest.fn<MockFn>(),
};

const mockCorrectionRepo = {
    getGrnHeader: jest.fn<MockFn>(),
    getSupplierInvoicesForGrn: jest.fn<MockFn>(),
};

const mockReassignRepo = {
    getGrTotalValue: jest.fn<MockFn>(),
    getOpenGrirForGrn: jest.fn<MockFn>(),
    insertEvent: jest.fn<MockFn>(),
};

const mockAccountingCore = {
    createJournalEntry: jest.fn<MockFn>(),
};

const mockRecalcSupplier = jest.fn<MockFn>();

jest.unstable_mockModule('./correctionEligibilityService.js', () => ({
    correctionEligibilityService: mockEligibility,
}));

jest.unstable_mockModule('./correctionEligibilityRepository.js', () => ({
    correctionEligibilityRepository: mockCorrectionRepo,
}));

jest.unstable_mockModule('./supplierReassignmentRepository.js', () => ({
    supplierReassignmentRepository: mockReassignRepo,
}));

jest.unstable_mockModule('../../services/accountingCore.js', () => ({
    AccountingCore: mockAccountingCore,
    AccountingError: class AccountingError extends Error {
        code = 'TEST';
    },
}));

jest.unstable_mockModule('../../services/glEntryService.js', () => ({
    AccountCodes: { GRIR_CLEARING: '2150', ACCOUNTS_PAYABLE: '2100' },
}));

jest.unstable_mockModule('../suppliers/supplierRepository.js', () => ({
    recalculateOutstandingBalance: mockRecalcSupplier,
}));

jest.unstable_mockModule('../../db/unitOfWork.js', () => ({
    UnitOfWork: {
        run: async (_pool: unknown, fn: (client: unknown) => Promise<unknown>) => fn(mockPool),
    },
}));

jest.unstable_mockModule('../../utils/periodGuard.js', () => ({
    checkAccountingPeriodOpen: jest.fn<MockFn>().mockResolvedValue(undefined),
}));

const { supplierReassignmentService } = await import('./supplierReassignmentService.js');

const baseInput = {
    grnId: 'gr-1',
    fromSupplierId: 'sup-a',
    toSupplierId: 'sup-b',
    reason: 'Invoice belongs to other vendor',
};

describe('supplierReassignmentService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCorrectionRepo.getGrnHeader.mockResolvedValue({
            id: 'gr-1',
            grNumber: 'GR-2026-0100',
            status: 'COMPLETED',
            supplierId: 'sup-a',
            supplierName: 'Vendor A',
            purchaseOrderId: 'po-1',
        });
        mockCorrectionRepo.getSupplierInvoicesForGrn.mockResolvedValue([]);
        mockReassignRepo.getGrTotalValue.mockResolvedValue(5000);
        mockReassignRepo.getOpenGrirForGrn.mockResolvedValue(5000);
        mockEligibility.previewCorrection.mockResolvedValue({
            allowed: true,
            route: 'AP_RECLASS',
            blockers: [],
            warnings: [],
        });
        mockPool.query = jest.fn<MockFn>().mockResolvedValue({
            rows: [
                { id: 'sup-a', name: 'Vendor A' },
                { id: 'sup-b', name: 'Vendor B' },
            ],
        }) as unknown as Pool['query'];
    });

    describe('preview', () => {
        it('returns GR/IR journal preview lines', async () => {
            const preview = await supplierReassignmentService.preview(mockPool, baseInput);
            expect(preview.amount).toBe(5000);
            expect(preview.journalLines).toHaveLength(2);
            expect(preview.blockers).toHaveLength(0);
        });

        it('blocks paid supplier invoices', async () => {
            mockCorrectionRepo.getSupplierInvoicesForGrn.mockResolvedValue([
                {
                    id: 'si-1',
                    invoiceNumber: 'SI-1',
                    amountPaid: 100,
                    outstandingBalance: 0,
                },
            ]);
            const preview = await supplierReassignmentService.preview(mockPool, baseInput);
            expect(preview.blockers.some((b) => b.includes('payments'))).toBe(true);
        });
    });

    describe('execute', () => {
        it('posts SYSTEM_CORRECTION journal and audit row', async () => {
            mockAccountingCore.createJournalEntry.mockResolvedValue({
                transactionId: 'txn-1',
                transactionNumber: 'JE-1',
            });
            mockReassignRepo.insertEvent.mockResolvedValue('evt-1');

            const result = await supplierReassignmentService.execute(mockPool, baseInput, 'user-1');
            expect(mockAccountingCore.createJournalEntry).toHaveBeenCalled();
            expect(mockReassignRepo.insertEvent).toHaveBeenCalled();
            expect(result.glTransactionId).toBe('txn-1');
            expect(mockRecalcSupplier).toHaveBeenCalledTimes(2);
        });
    });
});
