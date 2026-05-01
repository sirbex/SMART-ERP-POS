/**
 * Credit/Debit Note Service — Enterprise-Grade Unit Tests
 *
 * Verifies business rule enforcement, GL posting accuracy, invoice balance
 * adjustments, and cancellation flows for both customer and supplier sides.
 *
 * Test strategy:
 *  - All repository, GL, and AccountingCore calls are mocked.
 *  - UnitOfWork.run is mocked to pass a mock client through (no DB required).
 *  - Each test validates one specific business invariant or GL contract.
 *  - cancel tests verify GL is reversed AND invoice balance is restored.
 *
 * SAP/Odoo compliance checks:
 *  - FULL credit note must equal invoice total exactly
 *  - Cumulative credit notes ≤ invoice total (credit notes are capped)
 *  - Debit notes are uncapped (no cumulative check)
 *  - Only POSTED notes can be cancelled
 *  - Cancel reverses GL via AccountingCore.reverseTransaction
 *  - Returns-goods flag triggers inventory return GL (DR Inventory / CR COGS)
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool, PoolClient, QueryResult } from 'pg';

// ============================================================
// SHARED MOCK TYPES
// ============================================================

type MockFn = (...args: unknown[]) => Promise<unknown>;
type SyncMockFn = (...args: unknown[]) => unknown;

// ============================================================
// MOCK CLIENT & POOL
// ============================================================

const mockClientQuery = jest.fn<(...args: unknown[]) => Promise<QueryResult>>();
const mockClient = {
    query: mockClientQuery,
    release: jest.fn<SyncMockFn>(),
} as unknown as PoolClient;

const mockPoolQuery = jest.fn<(...args: unknown[]) => Promise<QueryResult>>();
const mockPool = {
    query: mockPoolQuery,
    connect: jest.fn<MockFn>().mockResolvedValue(mockClient),
} as unknown as Pool;

// ============================================================
// MODULE MOCKS (must appear before dynamic imports)
// ============================================================

// UnitOfWork — executes the callback directly with the mock client
jest.unstable_mockModule('../../db/unitOfWork.js', () => ({
    UnitOfWork: {
        run: jest.fn<MockFn>(async (_pool: unknown, fn: unknown) => {
            return (fn as (client: PoolClient) => Promise<unknown>)(mockClient);
        }),
    },
}));

// ── Customer-side repository ──────────────────────────────────
const mockCnRepo = {
    getInvoiceById: jest.fn<MockFn>(),
    getNotesForInvoice: jest.fn<MockFn>(),
    generateCreditNoteNumber: jest.fn<MockFn>(),
    generateDebitNoteNumber: jest.fn<MockFn>(),
    createNote: jest.fn<MockFn>(),
    createNoteLineItems: jest.fn<MockFn>(),
    postNote: jest.fn<MockFn>(),
    getNoteById: jest.fn<MockFn>(),
    cancelNote: jest.fn<MockFn>(),
    adjustOriginalInvoiceBalance: jest.fn<MockFn>(),
    getNoteLineItems: jest.fn<MockFn>(),
    listNotes: jest.fn<MockFn>(),
    getNoteWithLines: jest.fn<MockFn>(),
};

jest.unstable_mockModule('./creditDebitNoteRepository.js', () => ({
    creditDebitNoteRepository: mockCnRepo,
    supplierCreditDebitNoteRepository: mockSupplierRepo,
}));

// ── Supplier-side repository ──────────────────────────────────
const mockSupplierRepo = {
    getSupplierInvoiceById: jest.fn<MockFn>(),
    getNotesForSupplierInvoice: jest.fn<MockFn>(),
    generateSupplierCreditNoteNumber: jest.fn<MockFn>(),
    generateSupplierDebitNoteNumber: jest.fn<MockFn>(),
    createSupplierNote: jest.fn<MockFn>(),
    createSupplierNoteLineItems: jest.fn<MockFn>(),
    postSupplierNote: jest.fn<MockFn>(),
    getSupplierNoteById: jest.fn<MockFn>(),
    cancelSupplierNote: jest.fn<MockFn>(),
    adjustSupplierInvoiceBalance: jest.fn<MockFn>(),
    listSupplierNotes: jest.fn<MockFn>(),
};

// ── GL entry functions ────────────────────────────────────────
const mockRecordCustomerCreditNoteToGL = jest.fn<MockFn>().mockResolvedValue(undefined);
const mockRecordCustomerDebitNoteToGL = jest.fn<MockFn>().mockResolvedValue(undefined);
const mockRecordSupplierCreditNoteToGL = jest.fn<MockFn>().mockResolvedValue(undefined);
const mockRecordSupplierDebitNoteToGL = jest.fn<MockFn>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../services/glEntryService.js', () => ({
    recordCustomerCreditNoteToGL: mockRecordCustomerCreditNoteToGL,
    recordCustomerDebitNoteToGL: mockRecordCustomerDebitNoteToGL,
    recordSupplierCreditNoteToGL: mockRecordSupplierCreditNoteToGL,
    recordSupplierDebitNoteToGL: mockRecordSupplierDebitNoteToGL,
    AccountCodes: {
        ACCOUNTS_RECEIVABLE: '1200',
        ACCOUNTS_PAYABLE: '2100',
        SALES_RETURNS: '4010',
        SALES_REVENUE: '4000',
        COGS: '5000',
        INVENTORY: '1300',
        PURCHASE_RETURNS: '5010',
        GRIR_CLEARING: '2150',
        TAX_PAYABLE: '2300',
    },
}));

// ── AccountingCore ────────────────────────────────────────────
const mockCreateJournalEntry = jest.fn<MockFn>().mockResolvedValue({ transactionId: 'txn-1' });
const mockReverseTransaction = jest.fn<MockFn>().mockResolvedValue({ transactionId: 'txn-rev-1' });

jest.unstable_mockModule('../../services/accountingCore.js', () => ({
    AccountingCore: {
        createJournalEntry: mockCreateJournalEntry,
        reverseTransaction: mockReverseTransaction,
    },
    AccountingError: class extends Error {
        constructor(msg: string, public readonly code: string) {
            super(msg);
            this.name = 'AccountingError';
        }
    },
}));

// ── Document flow ─────────────────────────────────────────────
jest.unstable_mockModule('../document-flow/documentFlowService.js', () => ({
    linkDocuments: jest.fn<MockFn>().mockResolvedValue(undefined),
}));

// ── Stock movement ────────────────────────────────────────────
jest.unstable_mockModule('../stock-movements/stockMovementRepository.js', () => ({
    recordMovement: jest.fn<MockFn>().mockResolvedValue(undefined),
}));

// ── Inventory sync ────────────────────────────────────────────
jest.unstable_mockModule('../../utils/inventorySync.js', () => ({
    syncProductQuantity: jest.fn<MockFn>().mockResolvedValue(undefined),
}));

// ── Customer balance sync (dynamically imported inside service) ──
jest.unstable_mockModule('../../utils/customerBalanceSync.js', () => ({
    syncCustomerBalanceFromInvoices: jest.fn<MockFn>().mockResolvedValue(undefined),
}));

// ── Supplier repository (recalcSupplierBalance) ───────────────
const mockRecalcSupplierBalance = jest.fn<MockFn>().mockResolvedValue(undefined);
jest.unstable_mockModule('../suppliers/supplierRepository.js', () => ({
    recalculateOutstandingBalance: mockRecalcSupplierBalance,
}));

// ── Date utilities ────────────────────────────────────────────
jest.unstable_mockModule('../../utils/dateRange.js', () => ({
    getBusinessDate: jest.fn<SyncMockFn>().mockReturnValue('2026-05-01'),
}));

// ── Constants ─────────────────────────────────────────────────
jest.unstable_mockModule('../../utils/constants.js', () => ({
    SYSTEM_USER_ID: 'system-user-id',
}));

// ── Logger ───────────────────────────────────────────────────
jest.unstable_mockModule('../../utils/logger.js', () => ({
    default: {
        info: jest.fn<SyncMockFn>(),
        error: jest.fn<SyncMockFn>(),
        warn: jest.fn<SyncMockFn>(),
        debug: jest.fn<SyncMockFn>(),
    },
}));

// ============================================================
// DYNAMIC IMPORT (after all mocks are registered)
// ============================================================
const { creditDebitNoteService, supplierCreditDebitNoteService } =
    await import('./creditDebitNoteService.js');

// ============================================================
// SHARED TEST FIXTURES
// ============================================================

/** A valid customer invoice fixture */
const baseInvoice = {
    id: 'inv-001',
    documentType: 'INVOICE',
    status: 'Posted',
    totalAmount: 50000,
    customerId: 'cust-001',
    customerName: 'Test Customer',
    outstandingBalance: 50000,
};

/** A valid supplier invoice fixture */
const baseSupplierInvoice = {
    id: 'sinv-001',
    documentType: 'SUPPLIER_INVOICE',
    status: 'POSTED',
    totalAmount: 80000,
    supplierId: 'sup-001',
    supplierName: 'Acme Supplies',
    outstandingBalance: 80000,
};

/** Minimal line item for note creation */
const singleLine = [
    {
        productId: 'prod-001',
        productName: 'Widget A',
        quantity: 10,
        unitPrice: 5000,
        taxRate: 0,
    },
];

/** Single line yielding 5000 subtotal + 18% tax */
const taxedLine = [
    {
        productId: 'prod-002',
        productName: 'Widget B',
        quantity: 1,
        unitPrice: 50000,
        taxRate: 18,
    },
];

// ============================================================
// HELPERS
// ============================================================

/** Reset all mocks between tests */
function resetAll() {
    jest.clearAllMocks();
    mockClientQuery.mockReset();
    mockPoolQuery.mockReset();
    // Restore default no-op implementations
    mockRecordCustomerCreditNoteToGL.mockResolvedValue(undefined);
    mockRecordCustomerDebitNoteToGL.mockResolvedValue(undefined);
    mockRecordSupplierCreditNoteToGL.mockResolvedValue(undefined);
    mockRecordSupplierDebitNoteToGL.mockResolvedValue(undefined);
    mockCreateJournalEntry.mockResolvedValue({ transactionId: 'txn-1' });
    mockReverseTransaction.mockResolvedValue({ transactionId: 'txn-rev-1' });
    mockRecalcSupplierBalance.mockResolvedValue(undefined);
    // Pool query: default to no GL transaction found (cancel path)
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);
}

// ============================================================
// ╔══════════════════════════════════════════════════════════╗
// ║  PART 1: CUSTOMER CREDIT NOTE                           ║
// ╚══════════════════════════════════════════════════════════╝
// ============================================================

describe('creditDebitNoteService — Customer Credit Note', () => {
    beforeEach(resetAll);

    // ── Create: Validation Guards ─────────────────────────────

    describe('createCreditNote — validation guards', () => {
        it('throws when original invoice does not exist', async () => {
            mockCnRepo.getInvoiceById.mockResolvedValue(null);

            await expect(
                creditDebitNoteService.createCreditNote(mockPool, {
                    invoiceId: 'inv-999',
                    reason: 'Price error',
                    lines: singleLine,
                }),
            ).rejects.toThrow('Original invoice not found');
        });

        it('throws when document is not INVOICE type (note-against-note guard)', async () => {
            mockCnRepo.getInvoiceById.mockResolvedValue({
                ...baseInvoice,
                documentType: 'CREDIT_NOTE', // cannot create note against a note
            });

            await expect(
                creditDebitNoteService.createCreditNote(mockPool, {
                    invoiceId: 'cn-001',
                    reason: 'Error',
                    lines: singleLine,
                }),
            ).rejects.toThrow('Cannot create a note against another note');
        });

        it('throws when invoice is cancelled', async () => {
            mockCnRepo.getInvoiceById.mockResolvedValue({
                ...baseInvoice,
                status: 'Cancelled',
            });

            await expect(
                creditDebitNoteService.createCreditNote(mockPool, {
                    invoiceId: 'inv-001',
                    reason: 'Cancelled invoice',
                    lines: singleLine,
                }),
            ).rejects.toThrow('Cannot create a note against a cancelled invoice');
        });

        it('throws when FULL noteType does not equal invoice total', async () => {
            // Invoice total = 50000, line total = 10 × 5000 = 50000 → OK
            // But if line produces 30000 with noteType=FULL → reject
            mockCnRepo.getInvoiceById.mockResolvedValue(baseInvoice); // total = 50000
            mockCnRepo.getNotesForInvoice.mockResolvedValue([]);

            await expect(
                creditDebitNoteService.createCreditNote(mockPool, {
                    invoiceId: 'inv-001',
                    noteType: 'FULL',
                    reason: 'Full credit',
                    lines: [{ productId: 'p1', productName: 'X', quantity: 3, unitPrice: 10000, taxRate: 0 }],
                    // total = 30000 ≠ 50000 → must throw
                }),
            ).rejects.toThrow(/FULL credit note must equal invoice total/);
        });

        it('throws when cumulative credit notes would exceed invoice total', async () => {
            // Invoice total = 50000. Existing notes = 40000. New attempt = 20000 → 60000 > 50000.
            mockCnRepo.getInvoiceById.mockResolvedValue(baseInvoice); // total = 50000
            mockCnRepo.getNotesForInvoice.mockResolvedValue([
                { totalAmount: '40000' }, // existing CN already covers 40k
            ]);

            await expect(
                creditDebitNoteService.createCreditNote(mockPool, {
                    invoiceId: 'inv-001',
                    reason: 'Partial correction',
                    lines: [{ productId: 'p1', productName: 'X', quantity: 4, unitPrice: 5000, taxRate: 0 }],
                    // new total = 20000 → 40000 + 20000 = 60000 > 50000
                }),
            ).rejects.toThrow(/would exceed invoice total/);
        });
    });

    // ── Create: Happy Path ────────────────────────────────────

    describe('createCreditNote — happy path', () => {
        it('creates a DRAFT credit note with correct totals', async () => {
            mockCnRepo.getInvoiceById.mockResolvedValue(baseInvoice);
            mockCnRepo.getNotesForInvoice.mockResolvedValue([]);
            mockCnRepo.generateCreditNoteNumber.mockResolvedValue('CN-2026-0001');
            const noteRecord = {
                id: 'cn-uuid-1',
                invoiceNumber: 'CN-2026-0001',
                documentType: 'CREDIT_NOTE',
                status: 'Draft',
                subtotal: 50000,
                taxAmount: 0,
                totalAmount: 50000,
                customerId: 'cust-001',
                customerName: 'Test Customer',
                referenceInvoiceId: 'inv-001',
                issueDate: '2026-05-01',
                returnsGoods: false,
            };
            mockCnRepo.createNote.mockResolvedValue(noteRecord);
            mockCnRepo.createNoteLineItems.mockResolvedValue([]);

            const result = await creditDebitNoteService.createCreditNote(mockPool, {
                invoiceId: 'inv-001',
                reason: 'Price correction',
                lines: singleLine, // 10 × 5000 = 50000
            });

            expect(result.note.documentType).toBe('CREDIT_NOTE');
            expect(result.note.status).toBe('Draft');
            expect(result.note.totalAmount).toBe(50000);
            // Repository must have been called with correct amounts
            const createArgs = mockCnRepo.createNote.mock.calls[0][1] as Record<string, unknown>;
            expect(createArgs.subtotal).toBe(50000);
            expect(createArgs.taxAmount).toBe(0);
            expect(createArgs.totalAmount).toBe(50000);
        });

        it('correctly calculates tax-inclusive totals (18% VAT)', async () => {
            // taxedLine: qty=1, unitPrice=50000, taxRate=18% → subtotal=50000, tax=9000, total=59000
            mockCnRepo.getInvoiceById.mockResolvedValue({ ...baseInvoice, totalAmount: 59000 });
            mockCnRepo.getNotesForInvoice.mockResolvedValue([]);
            mockCnRepo.generateCreditNoteNumber.mockResolvedValue('CN-2026-0002');
            mockCnRepo.createNote.mockResolvedValue({ id: 'cn-2', invoiceNumber: 'CN-2026-0002', documentType: 'CREDIT_NOTE', status: 'Draft', subtotal: 50000, taxAmount: 9000, totalAmount: 59000, customerId: 'cust-001', customerName: 'Test Customer', referenceInvoiceId: 'inv-001', issueDate: '2026-05-01', returnsGoods: false });
            mockCnRepo.createNoteLineItems.mockResolvedValue([]);

            await creditDebitNoteService.createCreditNote(mockPool, {
                invoiceId: 'inv-001',
                reason: 'Tax correction',
                lines: taxedLine,
            });

            const createArgs = mockCnRepo.createNote.mock.calls[0][1] as Record<string, unknown>;
            expect(createArgs.subtotal).toBe(50000);
            expect(createArgs.taxAmount).toBe(9000);
            expect(createArgs.totalAmount).toBe(59000);
        });
    });

    // ── Post: GL & Balance ────────────────────────────────────

    describe('postNote (CREDIT_NOTE) — GL posting and invoice balance adjustment', () => {
        const draftNote = {
            id: 'cn-uuid-1',
            invoiceNumber: 'CN-2026-0001',
            documentType: 'CREDIT_NOTE',
            status: 'Draft',
            subtotal: 50000,
            taxAmount: 0,
            totalAmount: 50000,
            customerId: 'cust-001',
            customerName: 'Test Customer',
            referenceInvoiceId: 'inv-001',
            issueDate: '2026-05-01',
            returnsGoods: false,
        };

        it('calls recordCustomerCreditNoteToGL with correct data', async () => {
            mockCnRepo.postNote.mockResolvedValue(draftNote);

            await creditDebitNoteService.postNote(mockPool, 'cn-uuid-1');

            expect(mockRecordCustomerCreditNoteToGL).toHaveBeenCalledTimes(1);
            const glCall = mockRecordCustomerCreditNoteToGL.mock.calls[0][0] as Record<string, unknown>;
            expect(glCall.noteId).toBe('cn-uuid-1');
            expect(glCall.noteNumber).toBe('CN-2026-0001');
            expect(glCall.subtotal).toBe(50000);
            expect(glCall.totalAmount).toBe(50000);
            expect(glCall.customerId).toBe('cust-001');
        });

        it('calls adjustOriginalInvoiceBalance with CREDIT direction', async () => {
            mockCnRepo.postNote.mockResolvedValue(draftNote);

            await creditDebitNoteService.postNote(mockPool, 'cn-uuid-1');

            expect(mockCnRepo.adjustOriginalInvoiceBalance).toHaveBeenCalledWith(
                mockClient,
                'inv-001',
                50000,
                'CREDIT',
            );
        });

        it('does NOT call recordCustomerDebitNoteToGL (correct branch selection)', async () => {
            mockCnRepo.postNote.mockResolvedValue(draftNote);

            await creditDebitNoteService.postNote(mockPool, 'cn-uuid-1');

            expect(mockRecordCustomerDebitNoteToGL).not.toHaveBeenCalled();
        });

        it('throws when note is not found or not in Draft status', async () => {
            mockCnRepo.postNote.mockResolvedValue(null);

            await expect(
                creditDebitNoteService.postNote(mockPool, 'non-existent'),
            ).rejects.toThrow(/not found or cannot be posted/);
        });
    });

    // ── Cancel: GL Reversal & Balance Restoration ─────────────

    describe('cancelNote (CREDIT_NOTE) — GL reversal and balance restoration', () => {
        const postedCreditNote = {
            id: 'cn-uuid-1',
            invoiceNumber: 'CN-2026-0001',
            documentType: 'CREDIT_NOTE',
            status: 'Posted',
            totalAmount: 50000,
            customerId: 'cust-001',
            referenceInvoiceId: 'inv-001',
            issueDate: '2026-05-01',
        };

        it('throws when note is in Draft status (only POSTED can be cancelled)', async () => {
            mockCnRepo.getNoteById.mockResolvedValue({ ...postedCreditNote, status: 'Draft' });

            await expect(
                creditDebitNoteService.cancelNote(mockPool, 'cn-uuid-1', 'wrong status'),
            ).rejects.toThrow('Only posted notes can be cancelled');
        });

        it('reverses invoice balance in DEBIT direction (undo the CREDIT that was applied on post)', async () => {
            mockCnRepo.getNoteById.mockResolvedValue(postedCreditNote);
            mockCnRepo.cancelNote.mockResolvedValue({ ...postedCreditNote, status: 'Cancelled' });
            // No GL transaction found → skip reverseTransaction call
            mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);

            await creditDebitNoteService.cancelNote(mockPool, 'cn-uuid-1', 'Customer request');

            // CN was CREDIT on post → cancel must DEBIT back to restore original balance
            expect(mockCnRepo.adjustOriginalInvoiceBalance).toHaveBeenCalledWith(
                mockClient,
                'inv-001',
                50000,
                'DEBIT',
            );
        });

        it('calls AccountingCore.reverseTransaction when GL transaction exists', async () => {
            mockCnRepo.getNoteById.mockResolvedValue(postedCreditNote);
            mockCnRepo.cancelNote.mockResolvedValue({ ...postedCreditNote, status: 'Cancelled' });
            // Simulate GL transaction exists
            mockPoolQuery.mockResolvedValue({
                rows: [{ Id: 'gl-txn-id-1' }],
                rowCount: 1,
            } as unknown as QueryResult);

            await creditDebitNoteService.cancelNote(mockPool, 'cn-uuid-1', 'Error correction');

            expect(mockReverseTransaction).toHaveBeenCalledTimes(1);
            const reverseArgs = mockReverseTransaction.mock.calls[0][0] as Record<string, unknown>;
            expect(reverseArgs.originalTransactionId).toBe('gl-txn-id-1');
            expect(String(reverseArgs.reason)).toContain('CN-2026-0001');
        });

        it('does NOT call reverseTransaction when no GL transaction found (idempotent guard)', async () => {
            mockCnRepo.getNoteById.mockResolvedValue(postedCreditNote);
            mockCnRepo.cancelNote.mockResolvedValue({ ...postedCreditNote, status: 'Cancelled' });
            mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);

            await creditDebitNoteService.cancelNote(mockPool, 'cn-uuid-1', 'Test');

            expect(mockReverseTransaction).not.toHaveBeenCalled();
        });
    });
});

// ============================================================
// ╔══════════════════════════════════════════════════════════╗
// ║  PART 2: CUSTOMER DEBIT NOTE                            ║
// ╚══════════════════════════════════════════════════════════╝
// ============================================================

describe('creditDebitNoteService — Customer Debit Note', () => {
    beforeEach(resetAll);

    describe('createDebitNote — validation guards', () => {
        it('throws when invoice does not exist', async () => {
            mockCnRepo.getInvoiceById.mockResolvedValue(null);

            await expect(
                creditDebitNoteService.createDebitNote(mockPool, {
                    invoiceId: 'inv-999',
                    reason: 'Undercharge',
                    lines: singleLine,
                }),
            ).rejects.toThrow('Original invoice not found');
        });

        it('throws for note-against-note (debit note document type guard)', async () => {
            mockCnRepo.getInvoiceById.mockResolvedValue({
                ...baseInvoice,
                documentType: 'DEBIT_NOTE',
            });

            await expect(
                creditDebitNoteService.createDebitNote(mockPool, {
                    invoiceId: 'dn-001',
                    reason: 'Error',
                    lines: singleLine,
                }),
            ).rejects.toThrow('Cannot create a note against another note');
        });
    });

    describe('createDebitNote — no cumulative cap (debit notes are uncapped)', () => {
        it('does NOT check cumulative total — allows debit note > invoice total', async () => {
            // Debit notes can exceed original invoice total (SAP/Odoo: uncapped)
            // getNotesForInvoice should NOT be called for debit notes
            mockCnRepo.getInvoiceById.mockResolvedValue(baseInvoice); // total = 50000
            mockCnRepo.generateDebitNoteNumber.mockResolvedValue('DN-2026-0001');
            mockCnRepo.createNote.mockResolvedValue({
                id: 'dn-uuid-1',
                invoiceNumber: 'DN-2026-0001',
                documentType: 'DEBIT_NOTE',
                status: 'Draft',
                subtotal: 60000, // > invoice total
                taxAmount: 0,
                totalAmount: 60000,
                customerId: 'cust-001',
                customerName: 'Test Customer',
                referenceInvoiceId: 'inv-001',
                issueDate: '2026-05-01',
            });
            mockCnRepo.createNoteLineItems.mockResolvedValue([]);

            // Should NOT throw even though 60000 > 50000 (original invoice total)
            await expect(
                creditDebitNoteService.createDebitNote(mockPool, {
                    invoiceId: 'inv-001',
                    reason: 'Additional charges',
                    lines: [{ productId: 'p1', productName: 'X', quantity: 12, unitPrice: 5000, taxRate: 0 }],
                }),
            ).resolves.toBeDefined();

            // Must NOT call getNotesForInvoice (cumulative check not done for debit notes)
            expect(mockCnRepo.getNotesForInvoice).not.toHaveBeenCalled();
        });
    });

    describe('postNote (DEBIT_NOTE) — GL posting and invoice balance adjustment', () => {
        const draftDebitNote = {
            id: 'dn-uuid-1',
            invoiceNumber: 'DN-2026-0001',
            documentType: 'DEBIT_NOTE',
            status: 'Draft',
            subtotal: 20000,
            taxAmount: 0,
            totalAmount: 20000,
            customerId: 'cust-001',
            customerName: 'Test Customer',
            referenceInvoiceId: 'inv-001',
            issueDate: '2026-05-01',
        };

        it('calls recordCustomerDebitNoteToGL (not credit note GL)', async () => {
            mockCnRepo.postNote.mockResolvedValue(draftDebitNote);

            await creditDebitNoteService.postNote(mockPool, 'dn-uuid-1');

            expect(mockRecordCustomerDebitNoteToGL).toHaveBeenCalledTimes(1);
            expect(mockRecordCustomerCreditNoteToGL).not.toHaveBeenCalled();
        });

        it('calls adjustOriginalInvoiceBalance with DEBIT direction', async () => {
            mockCnRepo.postNote.mockResolvedValue(draftDebitNote);

            await creditDebitNoteService.postNote(mockPool, 'dn-uuid-1');

            expect(mockCnRepo.adjustOriginalInvoiceBalance).toHaveBeenCalledWith(
                mockClient,
                'inv-001',
                20000,
                'DEBIT',
            );
        });
    });

    describe('cancelNote (DEBIT_NOTE) — balance restoration', () => {
        const postedDebitNote = {
            id: 'dn-uuid-1',
            invoiceNumber: 'DN-2026-0001',
            documentType: 'DEBIT_NOTE',
            status: 'Posted',
            totalAmount: 20000,
            customerId: 'cust-001',
            referenceInvoiceId: 'inv-001',
            issueDate: '2026-05-01',
        };

        it('reverses invoice balance in CREDIT direction (undo the DEBIT applied on post)', async () => {
            mockCnRepo.getNoteById.mockResolvedValue(postedDebitNote);
            mockCnRepo.cancelNote.mockResolvedValue({ ...postedDebitNote, status: 'Cancelled' });
            mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);

            await creditDebitNoteService.cancelNote(mockPool, 'dn-uuid-1', 'Error');

            // DN was DEBIT on post → cancel must CREDIT back
            expect(mockCnRepo.adjustOriginalInvoiceBalance).toHaveBeenCalledWith(
                mockClient,
                'inv-001',
                20000,
                'CREDIT',
            );
        });
    });
});

// ============================================================
// ╔══════════════════════════════════════════════════════════╗
// ║  PART 3: SUPPLIER CREDIT NOTE                           ║
// ╚══════════════════════════════════════════════════════════╝
// ============================================================

describe('supplierCreditDebitNoteService — Supplier Credit Note', () => {
    beforeEach(resetAll);

    describe('createCreditNote — validation guards', () => {
        it('throws when supplier invoice does not exist', async () => {
            mockSupplierRepo.getSupplierInvoiceById.mockResolvedValue(null);

            await expect(
                supplierCreditDebitNoteService.createCreditNote(mockPool, {
                    invoiceId: 'sinv-999',
                    reason: 'Overcharge',
                    lines: [{ productId: 'p1', productName: 'X', quantity: 1, unitCost: 10000, taxRate: 0 }],
                }),
            ).rejects.toThrow('Supplier invoice not found');
        });

        it('throws for note-against-note', async () => {
            mockSupplierRepo.getSupplierInvoiceById.mockResolvedValue({
                ...baseSupplierInvoice,
                documentType: 'SUPPLIER_CREDIT_NOTE',
            });

            await expect(
                supplierCreditDebitNoteService.createCreditNote(mockPool, {
                    invoiceId: 'scn-001',
                    reason: 'Error',
                    lines: [{ productId: 'p1', productName: 'X', quantity: 1, unitCost: 10000, taxRate: 0 }],
                }),
            ).rejects.toThrow('Cannot create a note against another note');
        });

        it('throws when supplier invoice is cancelled', async () => {
            mockSupplierRepo.getSupplierInvoiceById.mockResolvedValue({
                ...baseSupplierInvoice,
                status: 'CANCELLED',
            });

            await expect(
                supplierCreditDebitNoteService.createCreditNote(mockPool, {
                    invoiceId: 'sinv-001',
                    reason: 'Cancelled invoice',
                    lines: [{ productId: 'p1', productName: 'X', quantity: 1, unitCost: 10000, taxRate: 0 }],
                }),
            ).rejects.toThrow('Cannot create a note against a cancelled invoice');
        });

        it('throws when FULL noteType does not equal invoice total', async () => {
            mockSupplierRepo.getSupplierInvoiceById.mockResolvedValue(baseSupplierInvoice); // total = 80000
            mockSupplierRepo.getNotesForSupplierInvoice.mockResolvedValue([]);

            await expect(
                supplierCreditDebitNoteService.createCreditNote(mockPool, {
                    invoiceId: 'sinv-001',
                    noteType: 'FULL',
                    reason: 'Full reversal',
                    lines: [{ productId: 'p1', productName: 'X', quantity: 1, unitCost: 30000, taxRate: 0 }],
                    // total = 30000 ≠ 80000 → must throw
                }),
            ).rejects.toThrow(/FULL credit note must equal invoice total/);
        });

        it('throws when cumulative credit notes would exceed supplier invoice total', async () => {
            mockSupplierRepo.getSupplierInvoiceById.mockResolvedValue(baseSupplierInvoice); // total = 80000
            mockSupplierRepo.getNotesForSupplierInvoice.mockResolvedValue([
                { totalAmount: '70000' },
            ]);

            await expect(
                supplierCreditDebitNoteService.createCreditNote(mockPool, {
                    invoiceId: 'sinv-001',
                    reason: 'Overcharge',
                    lines: [{ productId: 'p1', productName: 'X', quantity: 1, unitCost: 20000, taxRate: 0 }],
                    // 70000 + 20000 = 90000 > 80000 → must throw
                }),
            ).rejects.toThrow(/would exceed invoice total/);
        });

        it('throws when reason mentions "returned goods" but no returnGrnId provided', async () => {
            mockSupplierRepo.getSupplierInvoiceById.mockResolvedValue(baseSupplierInvoice);
            mockSupplierRepo.getNotesForSupplierInvoice.mockResolvedValue([]);

            await expect(
                supplierCreditDebitNoteService.createCreditNote(mockPool, {
                    invoiceId: 'sinv-001',
                    reason: 'Goods return to supplier',
                    lines: [{ productId: 'p1', productName: 'X', quantity: 5, unitCost: 16000, taxRate: 0 }],
                    // returnGrnId intentionally omitted
                }),
            ).rejects.toThrow('Supplier credit note for returned goods requires a posted Return GRN reference');
        });
    });

    describe('postNote (SUPPLIER_CREDIT_NOTE) — GL posting and AP balance adjustment', () => {
        const draftSupplierCN = {
            id: 'scn-uuid-1',
            invoiceNumber: 'SCN-2026-0001',
            documentType: 'SUPPLIER_CREDIT_NOTE',
            status: 'DRAFT',
            subtotal: 40000,
            taxAmount: 0,
            totalAmount: 40000,
            supplierId: 'sup-001',
            supplierName: 'Acme Supplies',
            referenceInvoiceId: 'sinv-001',
            issueDate: '2026-05-01',
        };

        it('calls recordSupplierCreditNoteToGL with correct supplier data', async () => {
            mockSupplierRepo.postSupplierNote.mockResolvedValue(draftSupplierCN);

            await supplierCreditDebitNoteService.postNote(mockPool, 'scn-uuid-1');

            expect(mockRecordSupplierCreditNoteToGL).toHaveBeenCalledTimes(1);
            const glCall = mockRecordSupplierCreditNoteToGL.mock.calls[0][0] as Record<string, unknown>;
            expect(glCall.noteId).toBe('scn-uuid-1');
            expect(glCall.supplierId).toBe('sup-001');
            expect(glCall.totalAmount).toBe(40000);
        });

        it('calls adjustSupplierInvoiceBalance with CREDIT direction', async () => {
            mockSupplierRepo.postSupplierNote.mockResolvedValue(draftSupplierCN);

            await supplierCreditDebitNoteService.postNote(mockPool, 'scn-uuid-1');

            expect(mockSupplierRepo.adjustSupplierInvoiceBalance).toHaveBeenCalledWith(
                mockClient,
                'sinv-001',
                40000,
                'CREDIT',
            );
        });

        it('calls recalcSupplierBalance after posting (SSOT enforcement)', async () => {
            mockSupplierRepo.postSupplierNote.mockResolvedValue(draftSupplierCN);

            await supplierCreditDebitNoteService.postNote(mockPool, 'scn-uuid-1');

            expect(mockRecalcSupplierBalance).toHaveBeenCalledWith(mockClient, 'sup-001');
        });

        it('does NOT call recordSupplierDebitNoteToGL (correct branch selection)', async () => {
            mockSupplierRepo.postSupplierNote.mockResolvedValue(draftSupplierCN);

            await supplierCreditDebitNoteService.postNote(mockPool, 'scn-uuid-1');

            expect(mockRecordSupplierDebitNoteToGL).not.toHaveBeenCalled();
        });

        it('throws when note not found or not in DRAFT status', async () => {
            mockSupplierRepo.postSupplierNote.mockResolvedValue(null);

            await expect(
                supplierCreditDebitNoteService.postNote(mockPool, 'non-existent'),
            ).rejects.toThrow(/not found or cannot be posted/);
        });
    });

    describe('cancelNote (SUPPLIER_CREDIT_NOTE) — GL reversal and AP restoration', () => {
        const postedSupplierCN = {
            id: 'scn-uuid-1',
            invoiceNumber: 'SCN-2026-0001',
            documentType: 'SUPPLIER_CREDIT_NOTE',
            status: 'POSTED',
            totalAmount: 40000,
            supplierId: 'sup-001',
            referenceInvoiceId: 'sinv-001',
            issueDate: '2026-05-01',
        };

        it('throws when supplier note is not in POSTED status', async () => {
            mockSupplierRepo.getSupplierNoteById.mockResolvedValue({
                ...postedSupplierCN,
                status: 'DRAFT',
            });

            await expect(
                supplierCreditDebitNoteService.cancelNote(mockPool, 'scn-uuid-1', 'Wrong status'),
            ).rejects.toThrow('Only posted notes can be cancelled');
        });

        it('reverses AP balance in DEBIT direction (undo the CREDIT applied on post)', async () => {
            mockSupplierRepo.getSupplierNoteById.mockResolvedValue(postedSupplierCN);
            mockSupplierRepo.cancelSupplierNote.mockResolvedValue({ ...postedSupplierCN, status: 'CANCELLED' });
            mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);

            await supplierCreditDebitNoteService.cancelNote(mockPool, 'scn-uuid-1', 'Data entry error');

            // SCN was CREDIT direction on post → cancel reverses with DEBIT
            expect(mockSupplierRepo.adjustSupplierInvoiceBalance).toHaveBeenCalledWith(
                mockClient,
                'sinv-001',
                40000,
                'DEBIT',
            );
        });

        it('calls recalcSupplierBalance after cancellation', async () => {
            mockSupplierRepo.getSupplierNoteById.mockResolvedValue(postedSupplierCN);
            mockSupplierRepo.cancelSupplierNote.mockResolvedValue({ ...postedSupplierCN, status: 'CANCELLED' });
            mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);

            await supplierCreditDebitNoteService.cancelNote(mockPool, 'scn-uuid-1', 'Test');

            expect(mockRecalcSupplierBalance).toHaveBeenCalledWith(mockClient, 'sup-001');
        });

        it('calls AccountingCore.reverseTransaction when GL record exists', async () => {
            mockSupplierRepo.getSupplierNoteById.mockResolvedValue(postedSupplierCN);
            mockSupplierRepo.cancelSupplierNote.mockResolvedValue({ ...postedSupplierCN, status: 'CANCELLED' });
            mockPoolQuery.mockResolvedValue({
                rows: [{ Id: 'gl-txn-supp-1' }],
                rowCount: 1,
            } as unknown as QueryResult);

            await supplierCreditDebitNoteService.cancelNote(mockPool, 'scn-uuid-1', 'Cancel reason');

            expect(mockReverseTransaction).toHaveBeenCalledTimes(1);
            const reverseArgs = mockReverseTransaction.mock.calls[0][0] as Record<string, unknown>;
            expect(reverseArgs.originalTransactionId).toBe('gl-txn-supp-1');
        });
    });

    // ── Create: amount-only path (PRICE_CORRECTION without lines) ─

    describe('createCreditNote — amount-only (PRICE_CORRECTION, no line items)', () => {
        it('synthesizes a single "Price Correction" line with qty=1 and unitCost=amount', async () => {
            mockSupplierRepo.getSupplierInvoiceById.mockResolvedValue(baseSupplierInvoice); // total=80000
            mockSupplierRepo.getNotesForSupplierInvoice.mockResolvedValue([]);
            mockSupplierRepo.generateSupplierCreditNoteNumber.mockResolvedValue('SCN-2026-0020');
            mockSupplierRepo.createSupplierNote.mockResolvedValue({
                id: 'scn-amount-1',
                invoiceNumber: 'SCN-2026-0020',
                documentType: 'SUPPLIER_CREDIT_NOTE',
                status: 'DRAFT',
                subtotal: 5000,
                taxAmount: 0,
                totalAmount: 5000,
                supplierId: 'sup-001',
                referenceInvoiceId: 'sinv-001',
                issueDate: '2026-05-01',
            });
            mockSupplierRepo.createSupplierNoteLineItems.mockResolvedValue([]);

            const result = await supplierCreditDebitNoteService.createCreditNote(mockPool, {
                invoiceId: 'sinv-001',
                reason: 'Supplier overcharged — unit price correction',
                noteType: 'PRICE_CORRECTION',
                amount: 5000,   // no `lines` provided
            });

            expect(result.note.documentType).toBe('SUPPLIER_CREDIT_NOTE');
            expect(result.note.status).toBe('DRAFT');

            // createSupplierNote must have been called with correct totals derived from amount
            const createArgs = mockSupplierRepo.createSupplierNote.mock.calls[0][1] as Record<string, unknown>;
            expect(createArgs.subtotal).toBe(5000);
            expect(createArgs.taxAmount).toBe(0);
            expect(createArgs.totalAmount).toBe(5000);

            // createSupplierNoteLineItems must receive the synthesized "Price Correction" line
            const lineArgs = mockSupplierRepo.createSupplierNoteLineItems.mock.calls[0][2] as Array<Record<string, unknown>>;
            expect(lineArgs).toHaveLength(1);
            expect(lineArgs[0].productName).toBe('Price Correction');
            expect(lineArgs[0].quantity).toBe(1);
            expect(lineArgs[0].unitCost).toBe(5000);
            expect(lineArgs[0].taxRate).toBe(0);
        });

        it('correctly calculates totals when amount-only path has tax (taxRate defaults to 0 for synthetic line)', async () => {
            // The synthetic line created by the service always has taxRate:0.
            // Tax is only applied when explicit lines carry taxRate > 0.
            mockSupplierRepo.getSupplierInvoiceById.mockResolvedValue(baseSupplierInvoice);
            mockSupplierRepo.getNotesForSupplierInvoice.mockResolvedValue([]);
            mockSupplierRepo.generateSupplierCreditNoteNumber.mockResolvedValue('SCN-2026-0021');
            mockSupplierRepo.createSupplierNote.mockResolvedValue({
                id: 'scn-amount-2', invoiceNumber: 'SCN-2026-0021', documentType: 'SUPPLIER_CREDIT_NOTE',
                status: 'DRAFT', subtotal: 10000, taxAmount: 0, totalAmount: 10000,
                supplierId: 'sup-001', referenceInvoiceId: 'sinv-001', issueDate: '2026-05-01',
            });
            mockSupplierRepo.createSupplierNoteLineItems.mockResolvedValue([]);

            await supplierCreditDebitNoteService.createCreditNote(mockPool, {
                invoiceId: 'sinv-001',
                reason: 'Price correction allowance',
                noteType: 'PRICE_CORRECTION',
                amount: 10000,
            });

            const createArgs = mockSupplierRepo.createSupplierNote.mock.calls[0][1] as Record<string, unknown>;
            // Synthetic line taxRate=0 → taxAmount must be 0, total = subtotal
            expect(createArgs.taxAmount).toBe(0);
            expect(createArgs.totalAmount).toBe(Number(createArgs.subtotal));
        });

        it('cumulative check applies to amount-only credit notes (prevents exceeding invoice total)', async () => {
            // Invoice total=80000, existing=75000, amount=10000 → 85000 > 80000 → throw
            mockSupplierRepo.getSupplierInvoiceById.mockResolvedValue(baseSupplierInvoice);
            mockSupplierRepo.getNotesForSupplierInvoice.mockResolvedValue([
                { totalAmount: '75000' },
            ]);

            await expect(
                supplierCreditDebitNoteService.createCreditNote(mockPool, {
                    invoiceId: 'sinv-001',
                    reason: 'Should fail cumulative check',
                    noteType: 'PRICE_CORRECTION',
                    amount: 10000,  // 75000 + 10000 = 85000 > 80000
                }),
            ).rejects.toThrow(/would exceed invoice total/);
        });
    });
});

// ============================================================
// ╔══════════════════════════════════════════════════════════╗
// ║  PART 4: SUPPLIER DEBIT NOTE                            ║
// ╚══════════════════════════════════════════════════════════╝
// ============================================================

describe('supplierCreditDebitNoteService — Supplier Debit Note', () => {
    beforeEach(resetAll);

    // ── Create: amount-only path ──────────────────────────────

    describe('createDebitNote — amount-only (no line items)', () => {
        it('synthesizes a single "Additional Charge" line with qty=1 and unitCost=amount', async () => {
            mockSupplierRepo.getSupplierInvoiceById.mockResolvedValue(baseSupplierInvoice);
            mockSupplierRepo.generateSupplierDebitNoteNumber.mockResolvedValue('SDN-2026-0020');
            mockSupplierRepo.createSupplierNote.mockResolvedValue({
                id: 'sdn-amount-1',
                invoiceNumber: 'SDN-2026-0020',
                documentType: 'SUPPLIER_DEBIT_NOTE',
                status: 'DRAFT',
                subtotal: 3000,
                taxAmount: 0,
                totalAmount: 3000,
                supplierId: 'sup-001',
                referenceInvoiceId: 'sinv-001',
                issueDate: '2026-05-01',
            });
            mockSupplierRepo.createSupplierNoteLineItems.mockResolvedValue([]);

            const result = await supplierCreditDebitNoteService.createDebitNote(mockPool, {
                invoiceId: 'sinv-001',
                reason: 'Additional handling fee',
                amount: 3000,   // no `lines` provided
            });

            expect(result.note.documentType).toBe('SUPPLIER_DEBIT_NOTE');

            // Repository called with correct totals
            const createArgs = mockSupplierRepo.createSupplierNote.mock.calls[0][1] as Record<string, unknown>;
            expect(createArgs.subtotal).toBe(3000);
            expect(createArgs.taxAmount).toBe(0);
            expect(createArgs.totalAmount).toBe(3000);

            // Synthesized "Additional Charge" line
            const lineArgs = mockSupplierRepo.createSupplierNoteLineItems.mock.calls[0][2] as Array<Record<string, unknown>>;
            expect(lineArgs).toHaveLength(1);
            expect(lineArgs[0].productName).toBe('Additional Charge');
            expect(lineArgs[0].quantity).toBe(1);
            expect(lineArgs[0].unitCost).toBe(3000);
            expect(lineArgs[0].taxRate).toBe(0);
        });

        it('amount-only debit note is uncapped (can exceed original invoice total)', async () => {
            // Invoice total=80000, amount=100000 → allowed (debit notes are uncapped)
            mockSupplierRepo.getSupplierInvoiceById.mockResolvedValue(baseSupplierInvoice);
            mockSupplierRepo.generateSupplierDebitNoteNumber.mockResolvedValue('SDN-2026-0021');
            mockSupplierRepo.createSupplierNote.mockResolvedValue({
                id: 'sdn-amount-2', invoiceNumber: 'SDN-2026-0021', documentType: 'SUPPLIER_DEBIT_NOTE',
                status: 'DRAFT', subtotal: 100000, taxAmount: 0, totalAmount: 100000,
                supplierId: 'sup-001', referenceInvoiceId: 'sinv-001', issueDate: '2026-05-01',
            });
            mockSupplierRepo.createSupplierNoteLineItems.mockResolvedValue([]);

            await expect(
                supplierCreditDebitNoteService.createDebitNote(mockPool, {
                    invoiceId: 'sinv-001',
                    reason: 'Large penalty charge',
                    amount: 100000, // > 80000 original invoice — must be allowed
                }),
            ).resolves.toBeDefined();

            // Cumulative check must NOT be called for debit notes
            expect(mockSupplierRepo.getNotesForSupplierInvoice).not.toHaveBeenCalled();
        });
    });

    describe('createDebitNote — no cumulative cap', () => {
        it('does NOT check cumulative total for supplier debit notes', async () => {
            mockSupplierRepo.getSupplierInvoiceById.mockResolvedValue(baseSupplierInvoice); // total = 80000
            mockSupplierRepo.generateSupplierDebitNoteNumber.mockResolvedValue('SDN-2026-0001');
            mockSupplierRepo.createSupplierNote.mockResolvedValue({
                id: 'sdn-uuid-1',
                invoiceNumber: 'SDN-2026-0001',
                documentType: 'SUPPLIER_DEBIT_NOTE',
                status: 'DRAFT',
                subtotal: 100000,
                taxAmount: 0,
                totalAmount: 100000,
                supplierId: 'sup-001',
                referenceInvoiceId: 'sinv-001',
                issueDate: '2026-05-01',
            });
            mockSupplierRepo.createSupplierNoteLineItems.mockResolvedValue([]);

            // 100000 > 80000 (original invoice), but debit notes are uncapped
            await expect(
                supplierCreditDebitNoteService.createDebitNote(mockPool, {
                    invoiceId: 'sinv-001',
                    reason: 'Additional charges for damages',
                    lines: [{ productId: 'p1', productName: 'X', quantity: 10, unitCost: 10000, taxRate: 0 }],
                }),
            ).resolves.toBeDefined();

            // Cumulative check (getNotesForSupplierInvoice) must NOT be called
            expect(mockSupplierRepo.getNotesForSupplierInvoice).not.toHaveBeenCalled();
        });
    });

    describe('postNote (SUPPLIER_DEBIT_NOTE) — GL posting and AP balance adjustment', () => {
        const draftSupplierDN = {
            id: 'sdn-uuid-1',
            invoiceNumber: 'SDN-2026-0001',
            documentType: 'SUPPLIER_DEBIT_NOTE',
            status: 'DRAFT',
            subtotal: 15000,
            taxAmount: 2700,
            totalAmount: 17700,
            supplierId: 'sup-001',
            supplierName: 'Acme Supplies',
            referenceInvoiceId: 'sinv-001',
            issueDate: '2026-05-01',
        };

        it('calls recordSupplierDebitNoteToGL (not credit note GL)', async () => {
            mockSupplierRepo.postSupplierNote.mockResolvedValue(draftSupplierDN);

            await supplierCreditDebitNoteService.postNote(mockPool, 'sdn-uuid-1');

            expect(mockRecordSupplierDebitNoteToGL).toHaveBeenCalledTimes(1);
            expect(mockRecordSupplierCreditNoteToGL).not.toHaveBeenCalled();
        });

        it('does NOT call adjustSupplierInvoiceBalance (SDN tracks balance via recalc, not invoice adjustment)', async () => {
            mockSupplierRepo.postSupplierNote.mockResolvedValue(draftSupplierDN);

            await supplierCreditDebitNoteService.postNote(mockPool, 'sdn-uuid-1');

            // SDN does not adjust the reference invoice's AmountPaid/OutstandingBalance.
            // The SDN's own OutstandingBalance is included in recalcSupplierBalance's SUM.
            // Invoice adjustment for SDN was removed to prevent silent no-ops on unpaid invoices
            // causing asymmetric cancel behavior (cancel CREDIT would inflate AmountPaid from 0).
            expect(mockSupplierRepo.adjustSupplierInvoiceBalance).not.toHaveBeenCalled();
        });

        it('calls recalcSupplierBalance after posting', async () => {
            mockSupplierRepo.postSupplierNote.mockResolvedValue(draftSupplierDN);

            await supplierCreditDebitNoteService.postNote(mockPool, 'sdn-uuid-1');

            expect(mockRecalcSupplierBalance).toHaveBeenCalledWith(mockClient, 'sup-001');
        });
    });

    describe('cancelNote (SUPPLIER_DEBIT_NOTE) — balance restoration', () => {
        const postedSupplierDN = {
            id: 'sdn-uuid-1',
            invoiceNumber: 'SDN-2026-0001',
            documentType: 'SUPPLIER_DEBIT_NOTE',
            status: 'POSTED',
            totalAmount: 17700,
            supplierId: 'sup-001',
            referenceInvoiceId: 'sinv-001',
            issueDate: '2026-05-01',
        };

        it('does NOT call adjustSupplierInvoiceBalance on cancel (SDN balance restored via recalc)', async () => {
            mockSupplierRepo.getSupplierNoteById.mockResolvedValue(postedSupplierDN);
            mockSupplierRepo.cancelSupplierNote.mockResolvedValue({ ...postedSupplierDN, status: 'CANCELLED' });
            mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);

            await supplierCreditDebitNoteService.cancelNote(mockPool, 'sdn-uuid-1', 'Incorrect charge');

            // SDN cancel does not adjust the reference invoice's AmountPaid/OutstandingBalance.
            // The cancelled SDN is excluded from recalcSupplierBalance's SUM (Status='CANCELLED').
            expect(mockSupplierRepo.adjustSupplierInvoiceBalance).not.toHaveBeenCalled();
        });

        it('calls recalcSupplierBalance after cancellation', async () => {
            mockSupplierRepo.getSupplierNoteById.mockResolvedValue(postedSupplierDN);
            mockSupplierRepo.cancelSupplierNote.mockResolvedValue({ ...postedSupplierDN, status: 'CANCELLED' });
            mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);

            await supplierCreditDebitNoteService.cancelNote(mockPool, 'sdn-uuid-1', 'Test');

            expect(mockRecalcSupplierBalance).toHaveBeenCalledWith(mockClient, 'sup-001');
        });
    });
});

// ============================================================
// ╔══════════════════════════════════════════════════════════╗
// ║  PART 5: BALANCE INVARIANTS (cross-cutting)             ║
// ╚══════════════════════════════════════════════════════════╝
// ============================================================

describe('Credit/Debit Note — balance direction invariants', () => {
    beforeEach(resetAll);

    /**
     * Invariant: Post + Cancel always returns to original state.
     * CN post: CREDIT invoice balance
     * CN cancel: DEBIT invoice balance (net = 0, original balance restored)
     */
    it('Customer CN: post direction is CREDIT, cancel direction is DEBIT (net-zero invariant)', async () => {
        const noteId = 'cn-inv-1';
        const postedNote = {
            id: noteId, invoiceNumber: 'CN-2026-0099', documentType: 'CREDIT_NOTE',
            status: 'Posted', subtotal: 10000, taxAmount: 0, totalAmount: 10000,
            customerId: 'cust-1', customerName: 'C', referenceInvoiceId: 'inv-x',
            issueDate: '2026-05-01', returnsGoods: false,
        };

        // Simulate post
        mockCnRepo.postNote.mockResolvedValue(postedNote);
        await creditDebitNoteService.postNote(mockPool, noteId);
        const postCall = mockCnRepo.adjustOriginalInvoiceBalance.mock.calls[0] as unknown[];
        expect(postCall[3]).toBe('CREDIT');

        // Simulate cancel
        jest.clearAllMocks();
        mockCnRepo.getNoteById.mockResolvedValue(postedNote);
        mockCnRepo.cancelNote.mockResolvedValue({ ...postedNote, status: 'Cancelled' });
        mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);
        await creditDebitNoteService.cancelNote(mockPool, noteId, 'Test');
        const cancelCall = mockCnRepo.adjustOriginalInvoiceBalance.mock.calls[0] as unknown[];
        expect(cancelCall[3]).toBe('DEBIT');
    });

    /**
     * Invariant: DN post is DEBIT, DN cancel is CREDIT.
     */
    it('Customer DN: post direction is DEBIT, cancel direction is CREDIT (net-zero invariant)', async () => {
        const noteId = 'dn-inv-1';
        const postedNote = {
            id: noteId, invoiceNumber: 'DN-2026-0099', documentType: 'DEBIT_NOTE',
            status: 'Posted', subtotal: 10000, taxAmount: 0, totalAmount: 10000,
            customerId: 'cust-1', customerName: 'C', referenceInvoiceId: 'inv-x',
            issueDate: '2026-05-01',
        };

        // Simulate post
        mockCnRepo.postNote.mockResolvedValue(postedNote);
        await creditDebitNoteService.postNote(mockPool, noteId);
        const postCall = mockCnRepo.adjustOriginalInvoiceBalance.mock.calls[0] as unknown[];
        expect(postCall[3]).toBe('DEBIT');

        // Simulate cancel
        jest.clearAllMocks();
        mockCnRepo.getNoteById.mockResolvedValue(postedNote);
        mockCnRepo.cancelNote.mockResolvedValue({ ...postedNote, status: 'Cancelled' });
        mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);
        await creditDebitNoteService.cancelNote(mockPool, noteId, 'Test');
        const cancelCall = mockCnRepo.adjustOriginalInvoiceBalance.mock.calls[0] as unknown[];
        expect(cancelCall[3]).toBe('CREDIT');
    });

    /**
     * Supplier CN post is CREDIT, cancel is DEBIT.
     */
    it('Supplier CN: post direction is CREDIT, cancel direction is DEBIT (net-zero invariant)', async () => {
        const noteId = 'scn-inv-1';
        const postedNote = {
            id: noteId, invoiceNumber: 'SCN-2026-0099', documentType: 'SUPPLIER_CREDIT_NOTE',
            status: 'POSTED', subtotal: 25000, taxAmount: 0, totalAmount: 25000,
            supplierId: 'sup-1', supplierName: 'S', referenceInvoiceId: 'sinv-x',
            issueDate: '2026-05-01',
        };

        mockSupplierRepo.postSupplierNote.mockResolvedValue(postedNote);
        await supplierCreditDebitNoteService.postNote(mockPool, noteId);
        const postCall = mockSupplierRepo.adjustSupplierInvoiceBalance.mock.calls[0] as unknown[];
        expect(postCall[3]).toBe('CREDIT');

        jest.clearAllMocks();
        mockSupplierRepo.getSupplierNoteById.mockResolvedValue(postedNote);
        mockSupplierRepo.cancelSupplierNote.mockResolvedValue({ ...postedNote, status: 'CANCELLED' });
        mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);
        await supplierCreditDebitNoteService.cancelNote(mockPool, noteId, 'Test');
        const cancelCall = mockSupplierRepo.adjustSupplierInvoiceBalance.mock.calls[0] as unknown[];
        expect(cancelCall[3]).toBe('DEBIT');
    });

    /**
     * Supplier DN: does NOT use adjustSupplierInvoiceBalance (balance tracked via recalcSupplierBalance).
     * Net-zero invariant: SDN included in recalc sum when POSTED, excluded when CANCELLED.
     */
    it('Supplier DN: does NOT call adjustSupplierInvoiceBalance on post or cancel', async () => {
        const noteId = 'sdn-inv-1';
        const postedNote = {
            id: noteId, invoiceNumber: 'SDN-2026-0099', documentType: 'SUPPLIER_DEBIT_NOTE',
            status: 'POSTED', subtotal: 8000, taxAmount: 0, totalAmount: 8000,
            supplierId: 'sup-1', supplierName: 'S', referenceInvoiceId: 'sinv-x',
            issueDate: '2026-05-01',
        };

        mockSupplierRepo.postSupplierNote.mockResolvedValue(postedNote);
        await supplierCreditDebitNoteService.postNote(mockPool, noteId);
        // SDN balance tracked via recalcSupplierBalance, not invoice adjustment
        expect(mockSupplierRepo.adjustSupplierInvoiceBalance).not.toHaveBeenCalled();

        jest.clearAllMocks();
        mockSupplierRepo.getSupplierNoteById.mockResolvedValue(postedNote);
        mockSupplierRepo.cancelSupplierNote.mockResolvedValue({ ...postedNote, status: 'CANCELLED' });
        mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);
        await supplierCreditDebitNoteService.cancelNote(mockPool, noteId, 'Test');
        // SDN cancel: CANCELLED status excluded from recalc sum — no invoice adjustment needed
        expect(mockSupplierRepo.adjustSupplierInvoiceBalance).not.toHaveBeenCalled();
    });
});
