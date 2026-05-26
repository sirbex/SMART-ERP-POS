/**
 * Phase D — correction eligibility service unit tests
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';

type MockFn = jest.Mock<(...args: unknown[]) => unknown>;

const mockPool = {} as Pool;

const mockRepo = {
    getGrnHeader: jest.fn<MockFn>(),
    getSupplierInvoicesForGrn: jest.fn<MockFn>(),
    getConsumedBatchesForGrn: jest.fn<MockFn>(),
    getReturnGrnsForGrn: jest.fn<MockFn>(),
    getSupplierInvoiceHeader: jest.fn<MockFn>(),
    countSupplierPaymentAllocations: jest.fn<MockFn>(),
    getCustomerInvoiceHeader: jest.fn<MockFn>(),
    countActiveArAllocations: jest.fn<MockFn>(),
};

const mockReturnGrnRepo = {
    getReturnableItems: jest.fn<MockFn>(),
    getById: jest.fn<MockFn>(),
};

const mockSupplierAdjustment = {
    getInvoiceContext: jest.fn<MockFn>(),
};

const mockArPayment = {
    getPaymentWithAllocations: jest.fn<MockFn>(),
};

jest.unstable_mockModule('./correctionEligibilityRepository.js', () => ({
    correctionEligibilityRepository: mockRepo,
}));

jest.unstable_mockModule('../return-grn/returnGrnRepository.js', () => ({
    returnGrnRepository: mockReturnGrnRepo,
}));

jest.unstable_mockModule('../supplier-adjustments/supplierAdjustmentService.js', () => ({
    supplierAdjustmentService: mockSupplierAdjustment,
}));

jest.unstable_mockModule('../ar-payments/arPaymentService.js', () => ({
    getPaymentWithAllocations: mockArPayment.getPaymentWithAllocations,
}));

const { correctionEligibilityService } = await import('./correctionEligibilityService.js');

describe('correctionEligibilityService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GOODS_RECEIPT', () => {
        it('blocks DRAFT goods receipts', async () => {
            mockRepo.getGrnHeader.mockResolvedValue({
                id: 'gr-1',
                grNumber: 'GR-2026-0001',
                status: 'DRAFT',
                supplierId: 'sup-1',
                supplierName: 'Vendor',
                purchaseOrderId: 'po-1',
            });

            const r = await correctionEligibilityService.getEligibility(mockPool, 'GOODS_RECEIPT', 'gr-1');
            expect(r.allowed).toBe(false);
            expect(r.route).toBe('BLOCKED');
            expect(r.blockers[0]).toMatch(/DRAFT/i);
        });

        it('routes to RETURN_GRN when stock consumed but returnable qty remains', async () => {
            mockRepo.getGrnHeader.mockResolvedValue({
                id: 'gr-1',
                grNumber: 'GR-2026-0002',
                status: 'COMPLETED',
                supplierId: 'sup-1',
                supplierName: 'Vendor',
                purchaseOrderId: 'po-1',
            });
            mockRepo.getSupplierInvoicesForGrn.mockResolvedValue([]);
            mockRepo.getConsumedBatchesForGrn.mockResolvedValue([
                {
                    batchId: 'b-1',
                    batchNumber: 'B001',
                    productId: 'p-1',
                    productName: 'Widget',
                    receivedQty: 10,
                    remainingQty: 4,
                    consumedQty: 6,
                },
            ]);
            mockRepo.getReturnGrnsForGrn.mockResolvedValue([]);
            mockReturnGrnRepo.getReturnableItems.mockResolvedValue([
                { returnableQuantity: 4, productName: 'Widget' },
            ]);

            const r = await correctionEligibilityService.getEligibility(mockPool, 'GOODS_RECEIPT', 'gr-1');
            expect(r.allowed).toBe(true);
            expect(r.route).toBe('RETURN_GRN');
            expect(r.warnings.some((w) => w.includes('consumed'))).toBe(true);
        });

        it('blocks when supplier invoice is paid', async () => {
            mockRepo.getGrnHeader.mockResolvedValue({
                id: 'gr-1',
                grNumber: 'GR-2026-0003',
                status: 'COMPLETED',
                supplierId: 'sup-1',
                supplierName: 'Vendor',
                purchaseOrderId: 'po-1',
            });
            mockRepo.getSupplierInvoicesForGrn.mockResolvedValue([
                {
                    id: 'si-1',
                    invoiceNumber: 'SI-001',
                    status: 'PAID',
                    documentType: 'SUPPLIER_INVOICE',
                    totalAmount: 1000,
                    amountPaid: 1000,
                    outstandingBalance: 0,
                    isPostedToGl: true,
                },
            ]);
            mockRepo.getConsumedBatchesForGrn.mockResolvedValue([]);
            mockRepo.getReturnGrnsForGrn.mockResolvedValue([]);
            mockReturnGrnRepo.getReturnableItems.mockResolvedValue([
                { returnableQuantity: 10, productName: 'Widget' },
            ]);

            const r = await correctionEligibilityService.getEligibility(mockPool, 'GOODS_RECEIPT', 'gr-1');
            expect(r.allowed).toBe(false);
            expect(r.route).toBe('BLOCKED');
            expect(r.blockers.some((b) => b.includes('payments'))).toBe(true);
        });
    });

    describe('previewCorrection', () => {
        it('blocks REVERSE kind in v1', async () => {
            mockRepo.getGrnHeader.mockResolvedValue({
                id: 'gr-1',
                grNumber: 'GR-2026-0004',
                status: 'COMPLETED',
                supplierId: null,
                supplierName: null,
                purchaseOrderId: null,
            });
            mockRepo.getSupplierInvoicesForGrn.mockResolvedValue([]);
            mockRepo.getConsumedBatchesForGrn.mockResolvedValue([]);
            mockRepo.getReturnGrnsForGrn.mockResolvedValue([]);
            mockReturnGrnRepo.getReturnableItems.mockResolvedValue([]);

            const r = await correctionEligibilityService.previewCorrection(
                mockPool,
                'GOODS_RECEIPT',
                'gr-1',
                'REVERSE',
            );
            expect(r.correctionKind).toBe('REVERSE');
            expect(r.allowed).toBe(false);
            expect(r.blockers.some((b) => b.includes('v1'))).toBe(true);
        });

        it('sets PRODUCT_SWAP route when eligible', async () => {
            mockRepo.getGrnHeader.mockResolvedValue({
                id: 'gr-1',
                grNumber: 'GR-2026-0005',
                status: 'COMPLETED',
                supplierId: null,
                supplierName: null,
                purchaseOrderId: null,
            });
            mockRepo.getSupplierInvoicesForGrn.mockResolvedValue([]);
            mockRepo.getConsumedBatchesForGrn.mockResolvedValue([]);
            mockRepo.getReturnGrnsForGrn.mockResolvedValue([]);
            mockReturnGrnRepo.getReturnableItems.mockResolvedValue([
                { returnableQuantity: 5, productName: 'A' },
            ]);

            const r = await correctionEligibilityService.previewCorrection(
                mockPool,
                'GOODS_RECEIPT',
                'gr-1',
                'PRODUCT_SWAP',
            );
            expect(r.route).toBe('PRODUCT_SWAP');
            expect(r.allowed).toBe(true);
        });
    });

    describe('AR_PAYMENT', () => {
        it('blocks when active allocations exist', async () => {
            mockArPayment.getPaymentWithAllocations.mockResolvedValue({
                payment: { id: 'pay-1', payment_number: 'CRP-0001' },
                allocations: [{ status: 'ACTIVE' }, { status: 'ACTIVE' }],
            });

            const r = await correctionEligibilityService.getEligibility(mockPool, 'AR_PAYMENT', 'pay-1');
            expect(r.route).toBe('BLOCKED');
            expect(r.warnings.some((w) => w.includes('2 active'))).toBe(true);
        });
    });

    describe('RETURN_GRN', () => {
        it('blocks posted return with credit note', async () => {
            mockReturnGrnRepo.getById.mockResolvedValue({
                id: 'rgrn-1',
                returnGrnNumber: 'RGRN-2026-0001',
                grnId: 'gr-1',
                grNumber: 'GR-2026-0001',
                status: 'POSTED',
                hasCreditNote: true,
            });

            const r = await correctionEligibilityService.getEligibility(mockPool, 'RETURN_GRN', 'rgrn-1');
            expect(r.allowed).toBe(false);
            expect(r.blockers.some((b) => b.includes('credit note'))).toBe(true);
        });
    });
});
