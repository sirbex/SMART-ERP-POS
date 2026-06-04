/**
 * Proof: RGRN → SCN requires supplier bill first (ERR_RETURN_GRN_001).
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool, PoolClient } from 'pg';

type AnyMock = jest.Mock<(...args: unknown[]) => Promise<unknown>>;

const mockRgrn = {
    id: 'rgrn-uuid',
    returnGrnNumber: 'RGRN-2026-0099',
    grnId: 'grn-uuid',
    supplierId: 'sup-1',
    supplierName: 'Test Supplier',
    grNumber: 'GR-2026-0001',
    returnDate: '2026-06-01',
    status: 'POSTED' as const,
    reason: 'Damaged',
    createdBy: 'user-1',
    createdAt: '2026-06-01',
    updatedAt: '2026-06-01',
};

const mockLines = [{
    id: 'line-1',
    rgrnId: 'rgrn-uuid',
    productId: 'prod-1',
    productName: 'Item',
    batchId: null,
    batchNumber: null,
    uomId: null,
    uomName: null,
    uomSymbol: null,
    conversionFactor: 1,
    quantity: 2,
    baseQuantity: 2,
    unitCost: 1000,
    lineTotal: 2000,
}];

const mockClientQuery = jest.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>();

jest.unstable_mockModule('../../db/unitOfWork.js', () => ({
    UnitOfWork: {
        run: jest.fn(async (_pool: unknown, fn: (client: PoolClient) => Promise<unknown>) =>
            fn({ query: mockClientQuery } as unknown as PoolClient),
        ),
    },
}));

jest.unstable_mockModule('./returnGrnRepository.js', () => ({
    returnGrnRepository: {
        getById: jest.fn<AnyMock>().mockResolvedValue(mockRgrn),
        getLines: jest.fn<AnyMock>().mockResolvedValue(mockLines),
    },
}));

jest.unstable_mockModule('../credit-debit-notes/creditDebitNoteRepository.js', () => ({
    supplierCreditDebitNoteRepository: {},
}));

jest.unstable_mockModule('../credit-debit-notes/creditDebitNoteService.js', () => ({
    supplierCreditDebitNoteService: {},
}));

jest.unstable_mockModule('../document-flow/documentFlowService.js', () => ({
    linkDocuments: jest.fn<AnyMock>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../services/glEntryService.js', () => ({
    recordSupplierCreditNoteToGL: jest.fn<AnyMock>(),
    AccountCodes: { GRIR_CLEARING: '2150' },
}));

const { returnGrnService } = await import('./returnGrnService.js');
const { BusinessError } = await import('../../middleware/errorHandler.js');
const {
    SUPPLIER_BILL_REQUIRED_FOR_SCN_CODE,
    SUPPLIER_BILL_REQUIRED_FOR_SCN_MESSAGE,
} = await import('./returnGrnMessages.js');

describe('returnGrnService — SCN requires supplier bill', () => {
    const pool = {} as Pool;

    beforeEach(() => {
        jest.clearAllMocks();
        mockClientQuery.mockImplementation(async (sql: unknown) => {
            const s = String(sql);
            if (s.includes('return_grn_id = $1') && s.includes('SUPPLIER_CREDIT_NOTE')) {
                return { rows: [] };
            }
            if (s.includes('FROM goods_receipts g') && s.includes('supplier')) {
                return { rows: [{ supplier_id: 'sup-1', supplier_name: 'Test Supplier' }] };
            }
            if (s.includes('document_type = \'SUPPLIER_INVOICE\'')) {
                return { rows: [] };
            }
            return { rows: [] };
        });
    });

    it('throws BusinessError ERR_RETURN_GRN_001 when GR has no supplier bill', async () => {
        await expect(
            returnGrnService.createCreditNoteFromReturn(pool, 'rgrn-uuid'),
        ).rejects.toMatchObject({
            errorCode: SUPPLIER_BILL_REQUIRED_FOR_SCN_CODE,
            message: SUPPLIER_BILL_REQUIRED_FOR_SCN_MESSAGE,
        });

        await expect(
            returnGrnService.createCreditNoteFromReturn(pool, 'rgrn-uuid'),
        ).rejects.toBeInstanceOf(BusinessError);
    });
});
