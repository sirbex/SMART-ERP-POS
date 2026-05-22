/**
 * Customer Invoice Adjustment Service — unit tests
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool } from 'pg';

type MockFn = jest.Mock<(...args: unknown[]) => unknown>;

const mockPool = {} as Pool;

const mockCnRepo = {
    getInvoiceById: jest.fn<MockFn>(),
    getNotesForInvoice: jest.fn<MockFn>(),
};

const mockInvoiceRepo = {
    getInvoiceById: jest.fn<MockFn>(),
    getInvoiceSettlement: jest.fn<MockFn>(),
};

const mockSalesRepo = {
    getSaleById: jest.fn<MockFn>(),
};

const mockCnService = {
    createCreditNote: jest.fn<MockFn>(),
    postNote: jest.fn<MockFn>(),
};

const mockGetFinalPrice = jest.fn<MockFn>();
const mockGetPricingMode = jest.fn<MockFn>();

jest.unstable_mockModule('../credit-debit-notes/creditDebitNoteRepository.js', () => ({
    creditDebitNoteRepository: mockCnRepo,
}));

jest.unstable_mockModule('../invoices/invoiceRepository.js', () => ({
    invoiceRepository: mockInvoiceRepo,
}));

jest.unstable_mockModule('../sales/salesRepository.js', () => ({
    salesRepository: mockSalesRepo,
}));

jest.unstable_mockModule('../credit-debit-notes/creditDebitNoteService.js', () => ({
    creditDebitNoteService: mockCnService,
}));

jest.unstable_mockModule('../pricing/pricingEngineService.js', () => ({
    getFinalPrice: mockGetFinalPrice,
}));

jest.unstable_mockModule('../pricing/pricingRepository.js', () => ({
    getCustomerPricingMode: mockGetPricingMode,
}));

const { customerInvoiceAdjustmentService } = await import('./customerInvoiceAdjustmentService.js');

const baseInvoice = {
    id: 'inv-1',
    invoiceNumber: 'INV-2026-0001',
    customerId: 'cust-1',
    customerName: 'BOU',
    subtotal: 100000,
    taxAmount: 0,
    totalAmount: 100000,
    amountPaid: 0,
    outstandingBalance: 100000,
    status: 'UNPAID',
    documentType: 'INVOICE',
    issueDate: '2026-05-01',
};

describe('customerInvoiceAdjustmentService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCnRepo.getInvoiceById.mockResolvedValue(baseInvoice);
        mockCnRepo.getNotesForInvoice.mockResolvedValue([]);
        mockInvoiceRepo.getInvoiceById.mockResolvedValue({ sale_id: 'sale-1' });
        mockInvoiceRepo.getInvoiceSettlement.mockResolvedValue({
            totalAmount: 100000,
            amountPaid: 0,
            amountDue: 100000,
        });
        mockGetPricingMode.mockResolvedValue('AT_COST');
    });

    describe('getInvoiceContext', () => {
        it('detects overcharged sale lines vs pricing engine', async () => {
            mockSalesRepo.getSaleById.mockResolvedValue({
                sale: { status: 'COMPLETED', sale_number: 'SALE-1' },
                items: [
                    {
                        id: 'si-1',
                        product_id: 'prod-1',
                        product_name: 'Widget',
                        quantity: 2,
                        unit_price: 5000,
                        unit_cost: 3000,
                    },
                ],
            });
            mockGetFinalPrice.mockResolvedValue({
                finalPrice: 3000,
                appliedRule: { scope: 'at_cost' },
            });

            const ctx = await customerInvoiceAdjustmentService.getInvoiceContext(mockPool, 'inv-1');

            expect(ctx.overchargeLines).toHaveLength(1);
            expect(ctx.overchargeLines[0].suggestedCreditPerUnit).toBe(2000);
            expect(ctx.overchargeLines[0].suggestedLineCredit).toBe(4000);
            expect(ctx.suggestedIntent).toBe('PRICE_CORRECTION');
        });

        it('rejects fully settled invoices with no correctable lines', async () => {
            mockInvoiceRepo.getInvoiceSettlement.mockResolvedValue({
                totalAmount: 40000,
                amountPaid: 40000,
                amountDue: 0,
            });
            mockCnRepo.getInvoiceById.mockResolvedValue({
                ...baseInvoice,
                amountPaid: 40000,
                outstandingBalance: 0,
                status: 'PAID',
            });
            mockSalesRepo.getSaleById.mockResolvedValue({
                sale: { status: 'COMPLETED', sale_number: 'SALE-1' },
                items: [],
            });

            await expect(
                customerInvoiceAdjustmentService.getInvoiceContext(mockPool, 'inv-1'),
            ).rejects.toMatchObject({ error_code: 'ADJUST_INVOICE_SETTLED' });
        });

        it('rejects when credit notes already cover full overcharge', async () => {
            mockCnRepo.getNotesForInvoice.mockResolvedValue([
                { totalAmount: 4000, status: 'POSTED' },
            ]);
            mockSalesRepo.getSaleById.mockResolvedValue({
                sale: { status: 'COMPLETED', sale_number: 'SALE-1' },
                items: [
                    {
                        id: 'si-1',
                        product_id: 'prod-1',
                        product_name: 'Widget',
                        quantity: 1,
                        unit_price: 5000,
                        unit_cost: 3000,
                    },
                ],
            });
            mockGetFinalPrice.mockResolvedValue({ finalPrice: 3000, appliedRule: { scope: 'at_cost' } });

            await expect(
                customerInvoiceAdjustmentService.getInvoiceContext(mockPool, 'inv-1'),
            ).rejects.toMatchObject({ error_code: 'ADJUST_ALREADY_CREDITED' });
        });

        it('rejects void linked sales', async () => {
            mockSalesRepo.getSaleById.mockResolvedValue({
                sale: { status: 'VOID', sale_number: 'SALE-VOID' },
                items: [],
            });

            await expect(
                customerInvoiceAdjustmentService.getInvoiceContext(mockPool, 'inv-1'),
            ).rejects.toMatchObject({ error_code: 'ADJUST_SALE_VOID' });
        });
    });

    describe('adjust PRICE_CORRECTION', () => {
        it('creates and posts a credit note for selected lines', async () => {
            mockSalesRepo.getSaleById.mockResolvedValue({
                sale: { status: 'COMPLETED', sale_number: 'SALE-1' },
                items: [
                    {
                        id: 'si-1',
                        product_id: 'prod-1',
                        product_name: 'Widget',
                        quantity: 1,
                        unit_price: 5000,
                        unit_cost: 3000,
                    },
                ],
            });
            mockGetFinalPrice.mockResolvedValue({ finalPrice: 3000, appliedRule: { scope: 'at_cost' } });
            mockCnService.createCreditNote.mockResolvedValue({
                note: { id: 'cn-1', invoiceNumber: 'CN-2026-0001' },
                lineItems: [],
            });
            mockCnService.postNote.mockResolvedValue({
                id: 'cn-1',
                invoiceNumber: 'CN-2026-0001',
            });

            const result = await customerInvoiceAdjustmentService.adjust(
                mockPool,
                {
                    intent: 'PRICE_CORRECTION',
                    invoiceId: 'inv-1',
                    reason: 'AT_COST correction',
                    lines: [{ saleItemId: 'si-1' }],
                },
                'user-1',
            );

            expect(result.creditNoteNumber).toBe('CN-2026-0001');
            expect(result.totalCredit).toBe(2000);
            expect(mockCnService.createCreditNote).toHaveBeenCalledWith(
                mockPool,
                expect.objectContaining({
                    noteType: 'PRICE_CORRECTION',
                    returnsGoods: false,
                    lines: expect.arrayContaining([
                        expect.objectContaining({ unitPrice: 2000, quantity: 1 }),
                    ]),
                }),
            );
            expect(mockCnService.postNote).toHaveBeenCalledWith(mockPool, 'cn-1');
        });
    });
});
