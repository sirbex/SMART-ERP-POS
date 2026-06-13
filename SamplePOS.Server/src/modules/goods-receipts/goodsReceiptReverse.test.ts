/**
 * Uninvoiced goods receipt reversal — eligibility + orchestrator unit tests.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool, PoolClient } from 'pg';

type MockFn = jest.Mock<(...args: unknown[]) => unknown>;

const mockPool = {} as Pool;
const mockClient = {} as PoolClient;

const mockEligibility = {
    eligibilityReverseUninvoicedReceipt: jest.fn<MockFn>(),
};

const mockReturnGrnRepo = {
    getReturnableItems: jest.fn<MockFn>(),
};

const mockReturnGrnService = {
    create: jest.fn<MockFn>(),
    post: jest.fn<MockFn>(),
};

const mockGrRepo = {
    getGRById: jest.fn<MockFn>(),
    setReversalMetadata: jest.fn<MockFn>(),
};

jest.unstable_mockModule('../corrections/correctionEligibilityService.js', () => ({
    correctionEligibilityService: mockEligibility,
}));

jest.unstable_mockModule('../return-grn/returnGrnRepository.js', () => ({
    returnGrnRepository: mockReturnGrnRepo,
}));

jest.unstable_mockModule('../return-grn/returnGrnService.js', () => ({
    returnGrnService: mockReturnGrnService,
}));

jest.unstable_mockModule('./goodsReceiptRepository.js', () => ({
    goodsReceiptRepository: mockGrRepo,
}));

jest.unstable_mockModule('../../db/unitOfWork.js', () => ({
    UnitOfWork: {
        run: async (_pool: Pool, work: (client: PoolClient) => Promise<unknown>) => work(mockClient),
    },
}));

const { goodsReceiptService } = await import('./goodsReceiptService.js');

describe('goodsReceiptService.reverseUninvoicedReceipt', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockClient.query = jest.fn<MockFn>().mockResolvedValue({ rows: [{ id: 'gr-1' }] }) as PoolClient['query'];
    });

    it('delegates eligibility preview to correctionEligibilityService', async () => {
        mockEligibility.eligibilityReverseUninvoicedReceipt.mockResolvedValue({
            allowed: true,
            route: 'REVERSE_UNINVOICED_RECEIPT',
            blockers: [],
            warnings: [],
            suggestedActions: [],
            documentType: 'GOODS_RECEIPT',
            documentId: 'gr-1',
        });

        const result = await goodsReceiptService.getReverseUninvoicedEligibility(mockPool, 'gr-1');
        expect(mockEligibility.eligibilityReverseUninvoicedReceipt).toHaveBeenCalledWith(mockPool, 'gr-1');
        expect(result.route).toBe('REVERSE_UNINVOICED_RECEIPT');
    });

    it('blocks when eligibility fails', async () => {
        mockEligibility.eligibilityReverseUninvoicedReceipt.mockResolvedValue({
            allowed: false,
            route: 'BLOCKED',
            blockers: ['Supplier invoice exists for this receipt'],
            warnings: [],
            suggestedActions: [],
            documentType: 'GOODS_RECEIPT',
            documentId: 'gr-1',
        });

        await expect(
            goodsReceiptService.reverseUninvoicedReceipt(mockPool, 'gr-1', {
                reason: 'Wrong delivery',
                userId: 'user-1',
            }),
        ).rejects.toThrow(/Supplier invoice exists/);
    });

    it('orchestrates create + post + reversal metadata on success', async () => {
        mockEligibility.eligibilityReverseUninvoicedReceipt.mockResolvedValue({
            allowed: true,
            route: 'REVERSE_UNINVOICED_RECEIPT',
            blockers: [],
            warnings: [],
            suggestedActions: [],
            documentType: 'GOODS_RECEIPT',
            documentId: 'gr-1',
        });

        mockReturnGrnRepo.getReturnableItems.mockResolvedValue([
            {
                productId: 'prod-1',
                batchId: 'batch-1',
                uomId: 'uom-1',
                conversionFactor: 1,
                returnableQuantity: 10,
                unitCost: 5,
            },
        ]);

        mockReturnGrnService.create.mockResolvedValue({
            returnGrn: { id: 'rgrn-1', returnGrnNumber: 'RGRN-2026-0001', status: 'DRAFT' },
            lines: [],
        });

        mockReturnGrnService.post.mockResolvedValue({
            id: 'rgrn-1',
            returnGrnNumber: 'RGRN-2026-0001',
            status: 'POSTED',
        });

        mockGrRepo.getGRById.mockResolvedValue({
            gr: {
                id: 'gr-1',
                grNumber: 'GR-2026-0001',
                status: 'COMPLETED',
                isReversed: true,
                reversedByReturnGrnId: 'rgrn-1',
            },
            items: [],
        });

        const result = await goodsReceiptService.reverseUninvoicedReceipt(mockPool, 'gr-1', {
            reason: 'Wrong delivery',
            userId: 'user-1',
        });

        expect(mockReturnGrnService.create).toHaveBeenCalled();
        expect(mockReturnGrnService.post).toHaveBeenCalledWith(mockPool, 'rgrn-1', mockClient);
        expect(mockGrRepo.setReversalMetadata).toHaveBeenCalledWith(
            mockClient,
            'gr-1',
            expect.objectContaining({
                reversedByReturnGrnId: 'rgrn-1',
                reversalReason: 'Wrong delivery',
                reversedByUserId: 'user-1',
            }),
        );
        expect(result.returnGrn.returnGrnNumber).toBe('RGRN-2026-0001');
    });
});
