/**
 * Return GRN create/post flow — ensures draft validation matches posting.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool, PoolClient } from 'pg';
import { ValidationError } from '../../middleware/errorHandler.js';

type AnyMock = jest.Mock<(...args: unknown[]) => Promise<unknown>>;

const mockReturnableRowA = {
    grItemId: 'gri-1',
    productId: 'prod-1',
    productName: 'Widget',
    batchId: 'batch-early',
    batchNumber: 'BE',
    expiryDate: '2026-01-01',
    uomId: null,
    uomName: null,
    uomSymbol: null,
    conversionFactor: 1,
    receivedQuantity: 10,
    unitCost: 100,
    returnedQuantity: 0,
    documentReturnableQuantity: 10,
    onHandQuantity: 10,
    consumedQuantity: 0,
    returnableQuantity: 10,
    returnBlockReason: null,
};

const mockReturnableRowB = {
    ...mockReturnableRowA,
    batchId: 'batch-late',
    batchNumber: 'BL',
    expiryDate: '2027-06-01',
    returnableQuantity: 20,
    onHandQuantity: 20,
    documentReturnableQuantity: 20,
};

const mockRgrn = {
    id: 'rgrn-1',
    returnGrnNumber: 'RGRN-2026-0001',
    grnId: 'grn-1',
    supplierId: 'sup-1',
    supplierName: 'Supplier',
    grNumber: 'GR-1',
    returnDate: '2026-05-01',
    status: 'DRAFT' as const,
    reason: 'Damaged',
    createdBy: 'user-1',
    createdAt: '2026-05-01',
    updatedAt: '2026-05-01',
};

let storedLines: Array<{
    productId: string;
    batchId: string | null;
    baseQuantity: number;
    productName: string;
}>;

const mockCreateLine = jest.fn<AnyMock>(async (
    _client: unknown,
    data: { batchId: string | null; baseQuantity: number; quantity: number },
) => {
    storedLines.push({
        productId: 'prod-1',
        batchId: data.batchId,
        baseQuantity: data.baseQuantity,
        productName: 'Widget',
    });
    return {
        id: `line-${storedLines.length}`,
        rgrnId: 'rgrn-1',
        productId: 'prod-1',
        productName: 'Widget',
        batchId: data.batchId,
        batchNumber: null,
        uomId: null,
        uomName: null,
        uomSymbol: null,
        conversionFactor: 1,
        quantity: data.baseQuantity,
        baseQuantity: data.baseQuantity,
        unitCost: 100,
        lineTotal: data.baseQuantity * 100,
    };
});

jest.unstable_mockModule('./returnGrnRepository.js', () => ({
    returnGrnRepository: {
        create: jest.fn<AnyMock>().mockResolvedValue(mockRgrn),
        createLine: mockCreateLine,
        getReturnableItems: jest.fn<AnyMock>().mockResolvedValue([mockReturnableRowB, mockReturnableRowA]),
        getById: jest.fn<AnyMock>().mockResolvedValue(mockRgrn),
        getLines: jest.fn<AnyMock>().mockImplementation(async () =>
            storedLines.map((l, i) => ({
                id: `line-${i + 1}`,
                rgrnId: 'rgrn-1',
                productId: l.productId,
                productName: l.productName,
                batchId: l.batchId,
                batchNumber: null,
                uomId: null,
                uomName: null,
                uomSymbol: null,
                conversionFactor: 1,
                quantity: l.baseQuantity,
                baseQuantity: l.baseQuantity,
                unitCost: 100,
                lineTotal: l.baseQuantity * 100,
            })),
        ),
        post: jest.fn<AnyMock>().mockResolvedValue({ ...mockRgrn, status: 'POSTED' }),
    },
}));

jest.unstable_mockModule('../stock-movements/stockMovementRepository.js', () => ({
    recordMovement: jest.fn<AnyMock>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../services/costLayerService.js', () => ({
    deductFromCostLayers: jest.fn<AnyMock>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../document-flow/documentFlowService.js', () => ({
    linkDocuments: jest.fn<AnyMock>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../credit-debit-notes/creditDebitNoteService.js', () => ({
    supplierCreditDebitNoteService: {},
}));

jest.unstable_mockModule('../credit-debit-notes/creditDebitNoteRepository.js', () => ({
    supplierCreditDebitNoteRepository: {},
}));

jest.unstable_mockModule('../../services/glEntryService.js', () => ({
    recordReturnGrnToGL: jest.fn<AnyMock>().mockResolvedValue(undefined),
    recordSupplierCreditNoteToGL: jest.fn<AnyMock>().mockResolvedValue(undefined),
    recordCustomerCreditNoteToGL: jest.fn<AnyMock>().mockResolvedValue(undefined),
    AccountCodes: {},
}));

jest.unstable_mockModule('../../utils/inventorySync.js', () => ({
    syncProductQuantity: jest.fn<AnyMock>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../products/uomService.js', () => ({
    resolveCanonicalProductUom: jest.fn<AnyMock>().mockResolvedValue({ conversionFactor: 1 }),
}));

const mockClient = {
    query: jest.fn<(...args: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>>(),
} as unknown as PoolClient;

jest.unstable_mockModule('../../db/unitOfWork.js', () => ({
    UnitOfWork: {
        run: jest.fn(async (_pool: unknown, fn: (client: PoolClient) => Promise<unknown>) => fn(mockClient)),
    },
}));

const { returnGrnService } = await import('./returnGrnService.js');

describe('returnGrnService return flow', () => {
    const pool = {} as Pool;

    beforeEach(() => {
        storedLines = [];
        jest.clearAllMocks();
        (mockClient.query as jest.Mock).mockImplementation(async (sql: string) => {
            const s = String(sql);
            if (s.includes('FROM goods_receipts g')) {
                return {
                    rows: [{
                        id: 'grn-1',
                        status: 'COMPLETED',
                        supplierId: 'sup-1',
                    }],
                };
            }
            if (s.includes('FROM goods_receipt_items gri')) {
                return { rows: [{ uom_id: null, uom_name: null, product_name: 'Widget' }] };
            }
            if (s.includes('costing_method')) {
                return { rows: [{ costing_method: 'FIFO' }] };
            }
            if (s.includes('UPDATE inventory_batches')) {
                return { rows: [{ remaining_quantity: 0, cost_price: 100 }] };
            }
            if (s.includes('has_invoice')) {
                return { rows: [{ has_invoice: false }] };
            }
            if (s.includes('FROM goods_receipts g') && s.includes('supplier')) {
                return { rows: [{ supplier_id: 'sup-1', supplier_name: 'S', gr_number: 'GR-1' }] };
            }
            if (s.includes('"AccountCode" = \'1300\'')) {
                return { rows: [{ balance: '0' }] };
            }
            if (s.includes('inventory_batches') && s.includes('remaining_quantity * cost_price')) {
                return { rows: [{ total: '0' }] };
            }
            return { rows: [] };
        });
    });

    it('pins FIFO batch on create when batchId omitted (early expiry, not max qty)', async () => {
        await returnGrnService.create(pool, {
            grnId: 'grn-1',
            reason: 'Test',
            createdBy: 'user-1',
            lines: [{ productId: 'prod-1', quantity: 3, unitCost: 100 }],
        });

        expect(storedLines).toHaveLength(1);
        expect(storedLines[0].batchId).toBe('batch-early');
    });

    it('rejects create when quantity exceeds on-hand across two lines on same batch', async () => {
        await expect(
            returnGrnService.create(pool, {
                grnId: 'grn-1',
                reason: 'Test',
                createdBy: 'user-1',
                lines: [
                    { productId: 'prod-1', batchId: 'batch-early', quantity: 6, unitCost: 100 },
                    { productId: 'prod-1', batchId: 'batch-early', quantity: 6, unitCost: 100 },
                ],
            }),
        ).rejects.toThrow(/Maximum returnable now/);
    });

    it('post validates same lines saved on draft', async () => {
        await returnGrnService.create(pool, {
            grnId: 'grn-1',
            reason: 'Test',
            createdBy: 'user-1',
            lines: [{ productId: 'prod-1', batchId: 'batch-early', quantity: 2, unitCost: 100 }],
        });

        await expect(returnGrnService.post(pool, 'rgrn-1')).resolves.toBeDefined();
    });
});
