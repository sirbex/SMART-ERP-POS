/**
 * Credit/Debit Note Service
 * 
 * Business logic for creating, posting, and managing credit/debit notes.
 * Handles both customer (AR) and supplier (AP) sides.
 * 
 * WORKFLOW:
 * 1. Create note (DRAFT) → validates original invoice, calculates totals
 * 2. Post note (DRAFT → POSTED) → creates GL entries, adjusts balances
 */

import type { Pool, PoolClient } from 'pg';
import { UnitOfWork } from '../../db/unitOfWork.js';
import {
    creditDebitNoteRepository,
    supplierCreditDebitNoteRepository,
    type CreditDebitNoteRecord,
    type SupplierCreditDebitNoteRecord,
    type NoteLineItemRecord,
} from './creditDebitNoteRepository.js';
import {
    recordCustomerCreditNoteToGL,
    recordCustomerDebitNoteToGL,
    recordSupplierCreditNoteToGL,
    recordSupplierDebitNoteToGL,
} from '../../services/glEntryService.js';
import { AccountingCore, AccountingError } from '../../services/accountingCore.js';
import { Money } from '../../utils/money.js';
import logger from '../../utils/logger.js';
import { SYSTEM_USER_ID } from '../../utils/constants.js';
import * as documentFlowService from '../document-flow/documentFlowService.js';
import { recordMovement } from '../stock-movements/stockMovementRepository.js';
import type {
    CreateCustomerCreditNote,
    CreateCustomerDebitNote,
    CreateSupplierCreditNote,
    CreateSupplierDebitNote,
} from '../../../../shared/zod/creditDebitNote.js';
import { getBusinessDate } from '../../utils/dateRange.js';
import { syncProductQuantity } from '../../utils/inventorySync.js';
import { recalculateOutstandingBalance as recalcSupplierBalance } from '../suppliers/supplierRepository.js';

// ============================================================
// CUSTOMER SIDE
// ============================================================

export const creditDebitNoteService = {

    /**
     * Create a customer credit note (DRAFT).
     * Validates the original invoice exists, is INVOICE type, and cumulative notes
     * don't exceed the original invoice total.
     */
    async createCreditNote(
        pool: Pool,
        input: CreateCustomerCreditNote,
    ): Promise<{ note: CreditDebitNoteRecord; lineItems: NoteLineItemRecord[] }> {

        return UnitOfWork.run(pool, async (client) => {
            // 1. Validate original invoice
            const invoice = await creditDebitNoteRepository.getInvoiceById(client, input.invoiceId);
            if (!invoice) throw new Error('Original invoice not found');
            if (invoice.documentType !== 'INVOICE') throw new Error('Cannot create a note against another note');
            if (invoice.status === 'Cancelled' || invoice.status === 'CANCELLED') throw new Error('Cannot create a note against a cancelled invoice');

            // 2. Calculate note totals from lines
            let subtotal = Money.zero();
            let taxTotal = Money.zero();
            for (const line of input.lines) {
                const lineAmount = Money.multiply(Money.parseDb(line.quantity), Money.parseDb(line.unitPrice));
                const lineTax = Money.multiply(lineAmount, Money.divide(Money.parseDb(line.taxRate ?? 0), Money.parseDb(100)));
                subtotal = Money.add(subtotal, lineAmount);
                taxTotal = Money.add(taxTotal, lineTax);
            }
            const totalAmount = Money.add(subtotal, taxTotal);
            const total = Money.toNumber(totalAmount);

            // 3. Enforce noteType business rules (SAP/Odoo compliance)
            if (input.noteType === 'FULL' && total !== invoice.totalAmount) {
                throw new Error(
                    `FULL credit note must equal invoice total (${invoice.totalAmount}), got ${total}`,
                );
            }

            // 4. Validate cumulative posted credit notes don't exceed invoice total
            const existingNotes = await creditDebitNoteRepository.getNotesForInvoice(client, input.invoiceId, 'CREDIT_NOTE');
            const postedNotes = existingNotes.filter((n) => String(n.status).toUpperCase() === 'POSTED');
            const existingTotalDec = postedNotes.reduce((sum, n) => Money.add(sum, Money.parseDb(n.totalAmount)), Money.zero());
            const cumulativeDec = Money.add(existingTotalDec, totalAmount);
            if (Money.toNumber(cumulativeDec) > invoice.totalAmount + 0.009) {
                const headroom = Math.max(0, invoice.totalAmount - Money.toNumber(existingTotalDec));
                throw new Error(
                    `Credit note total (${total}) plus existing posted notes (${Money.toNumber(existingTotalDec)}) would exceed invoice total (${invoice.totalAmount}). Maximum additional credit: ${headroom.toFixed(2)}`,
                );
            }

            // 4. Generate number and create note
            const noteNumber = await creditDebitNoteRepository.generateCreditNoteNumber(client);

            const note = await creditDebitNoteRepository.createNote(client, {
                invoiceNumber: noteNumber,
                documentType: 'CREDIT_NOTE',
                referenceInvoiceId: input.invoiceId,
                customerId: invoice.customerId,
                customerName: invoice.customerName,
                issueDate: input.issueDate || getBusinessDate(),
                subtotal: Money.toNumber(subtotal),
                taxAmount: Money.toNumber(taxTotal),
                totalAmount: total,
                reason: input.reason,
                notes: input.notes || null,
                returnsGoods: input.returnsGoods ?? false,
            });

            // 5. Create line items
            const lineItems = await creditDebitNoteRepository.createNoteLineItems(
                client,
                note.id,
                input.lines.map(l => ({
                    productId: l.productId || '',
                    productName: l.productName,
                    description: l.description || null,
                    quantity: l.quantity,
                    unitPrice: l.unitPrice,
                    taxRate: l.taxRate ?? 0,
                })),
            );

            // Document Flow: Invoice → Credit Note
            await documentFlowService.linkDocuments(client, 'INVOICE', input.invoiceId, 'CREDIT_NOTE', note.id, 'ADJUSTS');

            logger.info('Credit note draft created', { noteId: note.id, noteNumber: note.invoiceNumber });
            return { note, lineItems };
        });
    },

    /**
     * Create a customer debit note (DRAFT).
     */
    async createDebitNote(
        pool: Pool,
        input: CreateCustomerDebitNote,
    ): Promise<{ note: CreditDebitNoteRecord; lineItems: NoteLineItemRecord[] }> {

        return UnitOfWork.run(pool, async (client) => {
            const invoice = await creditDebitNoteRepository.getInvoiceById(client, input.invoiceId);
            if (!invoice) throw new Error('Original invoice not found');
            if (invoice.documentType !== 'INVOICE') throw new Error('Cannot create a note against another note');
            if (invoice.status === 'Cancelled' || invoice.status === 'CANCELLED') throw new Error('Cannot create a note against a cancelled invoice');

            let subtotal = Money.zero();
            let taxTotal = Money.zero();
            for (const line of input.lines) {
                const lineAmount = Money.multiply(Money.parseDb(line.quantity), Money.parseDb(line.unitPrice));
                const lineTax = Money.multiply(lineAmount, Money.divide(Money.parseDb(line.taxRate ?? 0), Money.parseDb(100)));
                subtotal = Money.add(subtotal, lineAmount);
                taxTotal = Money.add(taxTotal, lineTax);
            }
            const totalAmount = Money.add(subtotal, taxTotal);
            const total = Money.toNumber(totalAmount);

            // Debit notes ADD charges to a customer (undercharge correction, late fees, etc.)
            // Unlike credit notes, they are NOT capped at the original invoice total.
            // SAP/Odoo: credit notes ≤ invoice total, debit notes are uncapped.

            const noteNumber = await creditDebitNoteRepository.generateDebitNoteNumber(client);

            const note = await creditDebitNoteRepository.createNote(client, {
                invoiceNumber: noteNumber,
                documentType: 'DEBIT_NOTE',
                referenceInvoiceId: input.invoiceId,
                customerId: invoice.customerId,
                customerName: invoice.customerName,
                issueDate: input.issueDate || getBusinessDate(),
                subtotal: Money.toNumber(subtotal),
                taxAmount: Money.toNumber(taxTotal),
                totalAmount: Money.toNumber(totalAmount),
                reason: input.reason,
                notes: input.notes || null,
            });

            const lineItems = await creditDebitNoteRepository.createNoteLineItems(
                client,
                note.id,
                input.lines.map(l => ({
                    productId: l.productId || '',
                    productName: l.productName,
                    description: l.description || null,
                    quantity: l.quantity,
                    unitPrice: l.unitPrice,
                    taxRate: l.taxRate ?? 0,
                })),
            );

            // Document Flow: Invoice → Debit Note
            await documentFlowService.linkDocuments(client, 'INVOICE', input.invoiceId, 'DEBIT_NOTE', note.id, 'ADJUSTS');

            logger.info('Debit note draft created', { noteId: note.id, noteNumber: note.invoiceNumber });
            return { note, lineItems };
        });
    },

    /**
     * Post a customer credit/debit note (DRAFT → POSTED).
     * Creates GL entries and adjusts original invoice balance for credit notes.
     */
    async postNote(
        pool: Pool,
        noteId: string,
    ): Promise<CreditDebitNoteRecord> {

        return UnitOfWork.run(pool, async (client) => {
            // 1. Post (update status)
            const note = await creditDebitNoteRepository.postNote(client, noteId);
            if (!note) throw new Error('Note not found or cannot be posted (must be in Draft status)');

            const parentInvoice = note.referenceInvoiceId
                ? await creditDebitNoteRepository.getInvoiceById(client, note.referenceInvoiceId)
                : null;
            let saleNumber: string | undefined;
            if (parentInvoice?.saleId) {
                const saleRes = await client.query(
                    `SELECT sale_number FROM sales WHERE id = $1`,
                    [parentInvoice.saleId],
                );
                saleNumber = saleRes.rows[0]?.sale_number as string | undefined;
            }

            // 2. GL entries
            const glData = {
                noteId: note.id,
                noteNumber: note.invoiceNumber,
                noteDate: typeof note.issueDate === 'string'
                    ? note.issueDate.split('T')[0]
                    : getBusinessDate(),
                subtotal: note.subtotal,
                taxAmount: note.taxAmount,
                totalAmount: note.totalAmount,
                customerId: note.customerId,
                customerName: note.customerName,
                referenceInvoiceNumber: parentInvoice?.invoiceNumber,
                saleNumber,
            };

            if (note.documentType === 'CREDIT_NOTE') {
                await recordCustomerCreditNoteToGL(glData, pool, client);

                // 4. SAP: Inventory return — if returnsGoods flag is set, increase stock
                //    Creates RETURN stock movements, updates batches + product_inventory,
                //    and posts additional GL: DR Inventory (1300) / CR COGS (5000)
                if (note.returnsGoods) {
                    const lineItems = await creditDebitNoteRepository.getNoteLineItems(client, note.id);
                    const productLines = lineItems.filter(li => li.productId && li.productId !== '');
                    let inventoryCostTotal = Money.zero();

                    for (const line of productLines) {
                        // Find the most recent active batch for this product (FEFO order)
                        const batchRes = await client.query(
                            `SELECT id, cost_price, remaining_quantity
                             FROM inventory_batches
                             WHERE product_id = $1 AND status = 'ACTIVE'
                             ORDER BY expiry_date ASC NULLS LAST, received_date DESC
                             LIMIT 1`,
                            [line.productId]
                        );
                        const batch = batchRes.rows[0] as { id: string; cost_price: string; remaining_quantity: string } | undefined;
                        const unitCost = batch
                            ? Money.toNumber(Money.parseDb(batch.cost_price))
                            : line.unitPrice; // fallback: use note line price as cost proxy

                        // Create RETURN stock movement (positive qty = goods IN)
                        await recordMovement(client, {
                            productId: line.productId,
                            batchId: batch?.id ?? null,
                            movementType: 'RETURN',
                            quantity: line.quantity,
                            unitCost,
                            referenceType: 'CREDIT_NOTE',
                            referenceId: note.id,
                            notes: `Customer return: ${note.invoiceNumber} — ${line.productName} × ${line.quantity}`,
                        });

                        // Increase batch remaining_quantity (if batch found)
                        if (batch) {
                            await client.query(
                                `UPDATE inventory_batches
                                 SET remaining_quantity = remaining_quantity + $1,
                                     status = CASE WHEN remaining_quantity + $1 > 0 THEN 'ACTIVE' ELSE status END,
                                     updated_at = CURRENT_TIMESTAMP
                                 WHERE id = $2`,
                                [line.quantity, batch.id]
                            );
                        }

                        // Recalculate product quantities from batches
                        await syncProductQuantity(client, line.productId);

                        // Accumulate cost for inventory GL reversal
                        inventoryCostTotal = Money.add(
                            inventoryCostTotal,
                            Money.multiply(Money.parseDb(line.quantity), Money.parseDb(unitCost)),
                        );
                    }

                    // Post inventory reversal GL: DR Inventory (1300) / CR COGS (5000)
                    const costAmount = Money.toNumber(inventoryCostTotal);
                    if (costAmount > 0) {
                        await AccountingCore.createJournalEntry({
                            entryDate: glData.noteDate,
                            description: `Inventory return — customer CN ${note.invoiceNumber}`,
                            referenceType: 'CREDIT_NOTE_RETURN',
                            referenceId: note.id,
                            referenceNumber: note.invoiceNumber,
                            lines: [
                                {
                                    accountCode: '1300',
                                    description: `Inventory increase — goods returned: ${note.invoiceNumber}`,
                                    debitAmount: costAmount,
                                    creditAmount: 0,
                                },
                                {
                                    accountCode: '5000',
                                    description: `COGS reversal — customer return: ${note.invoiceNumber}`,
                                    debitAmount: 0,
                                    creditAmount: costAmount,
                                },
                            ],
                            userId: SYSTEM_USER_ID,
                            idempotencyKey: `CREDIT_NOTE_RETURN-${note.id}`,
                            // SAP governance (migration 013): account 1300 requires INVENTORY_MOVE.
                            source: 'INVENTORY_MOVE' as const,
                        }, undefined, client);
                    }

                    logger.info('Customer return inventory processed', {
                        noteId: note.id,
                        noteNumber: note.invoiceNumber,
                        linesReturned: productLines.length,
                        inventoryCost: costAmount,
                    });
                }
            } else {
                await recordCustomerDebitNoteToGL(glData, pool, client);
            }

            // Recalculate original invoice (payments + posted notes) then customer AR
            const { invoiceRepository } = await import('../invoices/invoiceRepository.js');
            await invoiceRepository.recalcInvoice(client, note.referenceInvoiceId);

            if (note.customerId) {
                const { syncCustomerBalanceFromInvoices } = await import('../../utils/customerBalanceSync.js');
                await syncCustomerBalanceFromInvoices(client, note.customerId, 'CREDIT_DEBIT_NOTE');
            }

            logger.info('Note posted', { noteId: note.id, noteNumber: note.invoiceNumber, type: note.documentType });
            return note;
        });
    },

    /**
     * Cancel a posted customer note (POSTED → CANCELLED).
     * Reverses the GL journal entry and restores original invoice balance.
     * SAP/Odoo compliance: posted documents are cancelled via reversal, never deleted.
     */
    async cancelNote(
        pool: Pool,
        noteId: string,
        reason: string,
    ): Promise<CreditDebitNoteRecord> {

        return UnitOfWork.run(pool, async (client) => {
            // 1. Get the note to validate it
            const noteData = await creditDebitNoteRepository.getNoteById(client, noteId);
            if (!noteData) throw new Error('Note not found');
            // Customer invoices table uses mixed-case statuses (Draft/Posted/Cancelled)
            if (noteData.status.toUpperCase() !== 'POSTED') throw new Error('Only posted notes can be cancelled');

            // 2. Cancel the note record
            const cancelled = await creditDebitNoteRepository.cancelNote(client, noteId);
            if (!cancelled) throw new Error('Failed to cancel note');

            // 3. Reverse the GL journal entry
            const refType = noteData.documentType === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : 'DEBIT_NOTE';
            const glTxn = await pool.query(
                `SELECT "Id" FROM ledger_transactions
         WHERE "ReferenceType" = $1 AND "ReferenceId" = $2
           AND "IsReversed" = FALSE
         LIMIT 1`,
                [refType, noteId]
            );

            const reverseGlTxn = async (
                referenceType: string,
                idempotencySuffix: string,
            ) => {
                const txnRes = await pool.query(
                    `SELECT "Id" FROM ledger_transactions
                     WHERE "ReferenceType" = $1 AND "ReferenceId" = $2
                       AND "IsReversed" = FALSE
                     LIMIT 1`,
                    [referenceType, noteId],
                );
                if (txnRes.rows.length === 0) return;
                try {
                    await AccountingCore.reverseTransaction({
                        originalTransactionId: txnRes.rows[0].Id,
                        reversalDate: getBusinessDate(),
                        reason: `CANCEL: ${noteData.invoiceNumber} — ${reason}`,
                        userId: SYSTEM_USER_ID,
                        idempotencyKey: `${idempotencySuffix}_CANCEL-${noteId}`,
                    }, pool);
                } catch (error: unknown) {
                    if (error instanceof AccountingError && error.code === 'ALREADY_REVERSED') {
                        logger.info('Note GL already reversed (idempotent)', { noteId, referenceType });
                    } else {
                        throw error;
                    }
                }
            };

            await reverseGlTxn(refType, refType);
            if (noteData.returnsGoods) {
                await reverseGlTxn('CREDIT_NOTE_RETURN', 'CREDIT_NOTE_RETURN');
            }

            const { invoiceRepository } = await import('../invoices/invoiceRepository.js');
            await invoiceRepository.recalcInvoice(client, noteData.referenceInvoiceId);

            if (noteData.customerId) {
                const { syncCustomerBalanceFromInvoices } = await import('../../utils/customerBalanceSync.js');
                await syncCustomerBalanceFromInvoices(client, noteData.customerId, 'NOTE_CANCELLATION');
            }

            logger.info('Note cancelled with GL reversal', {
                noteId: cancelled.id,
                noteNumber: cancelled.invoiceNumber,
                type: cancelled.documentType,
                reason,
            });
            return cancelled;
        });
    },

    /**
     * List customer credit/debit notes with pagination.
     */
    async listNotes(
        pool: Pool,
        options: {
            documentType?: 'CREDIT_NOTE' | 'DEBIT_NOTE';
            customerId?: string;
            referenceInvoiceId?: string;
            status?: string;
            page: number;
            limit: number;
        },
    ) {
        return creditDebitNoteRepository.listNotes(pool, {
            ...options,
            documentType: options.documentType || undefined,
        });
    },

    /**
     * Get a single note with its line items.
     */
    async getNoteById(
        pool: Pool,
        noteId: string,
    ): Promise<{ note: CreditDebitNoteRecord; lineItems: NoteLineItemRecord[] } | null> {
        const note = await creditDebitNoteRepository.getNoteById(pool, noteId);
        if (!note) return null;
        const lineItems = await creditDebitNoteRepository.getNoteLineItems(pool, noteId);
        return { note, lineItems };
    },

    /**
     * Get all notes linked to a specific invoice.
     */
    async getNotesForInvoice(
        pool: Pool,
        invoiceId: string,
    ) {
        const creditNotes = await creditDebitNoteRepository.getNotesForInvoice(pool, invoiceId, 'CREDIT_NOTE');
        const debitNotes = await creditDebitNoteRepository.getNotesForInvoice(pool, invoiceId, 'DEBIT_NOTE');
        return { creditNotes, debitNotes };
    },
};

// ============================================================
// SUPPLIER SIDE
// ============================================================

export const supplierCreditDebitNoteService = {

    async createCreditNote(
        pool: Pool,
        input: CreateSupplierCreditNote,
    ): Promise<{ note: SupplierCreditDebitNoteRecord; lineItems: unknown[] }> {

        return UnitOfWork.run(pool, async (client) => {
            const invoice = await supplierCreditDebitNoteRepository.getSupplierInvoiceById(client, input.invoiceId);
            if (!invoice) throw new Error('Supplier invoice not found');
            if (invoice.documentType !== 'SUPPLIER_INVOICE') throw new Error('Cannot create a note against another note');
            if (invoice.status === 'CANCELLED' || invoice.status === 'Cancelled') throw new Error('Cannot create a note against a cancelled invoice');

            // Synthesize a single line for PRICE_CORRECTION when no line items are provided (amount-only path)
            const effectiveCreditLines = (input.lines && input.lines.length > 0)
                ? input.lines
                : [{ productName: 'Price Correction', quantity: 1, unitCost: input.amount as number, taxRate: 0 }];

            let subtotal = Money.zero();
            let taxTotal = Money.zero();
            for (const line of effectiveCreditLines) {
                const lineAmount = Money.multiply(Money.parseDb(line.quantity), Money.parseDb(line.unitCost));
                const lineTax = Money.multiply(lineAmount, Money.divide(Money.parseDb(line.taxRate ?? 0), Money.parseDb(100)));
                subtotal = Money.add(subtotal, lineAmount);
                taxTotal = Money.add(taxTotal, lineTax);
            }
            const totalAmount = Money.add(subtotal, taxTotal);
            const total = Money.toNumber(totalAmount);

            // Enforce FULL noteType (SAP/Odoo compliance)
            if (input.noteType === 'FULL' && total !== invoice.totalAmount) {
                throw new Error(
                    `FULL credit note must equal invoice total (${invoice.totalAmount}), got ${total}`,
                );
            }

            // Validate cumulative
            const existing = await supplierCreditDebitNoteRepository.getNotesForSupplierInvoice(
                client, input.invoiceId, 'SUPPLIER_CREDIT_NOTE',
            );
            const existingTotalDec = existing.reduce((sum, n) => Money.add(sum, Money.parseDb(n.totalAmount)), Money.zero());
            const cumulativeDec = Money.add(existingTotalDec, totalAmount);
            if (Money.toNumber(cumulativeDec) > invoice.totalAmount) {
                throw new Error(
                    `Credit note total (${total}) plus existing notes (${Money.toNumber(existingTotalDec)}) would exceed invoice total (${invoice.totalAmount})`,
                );
            }

            // Returned Goods validation: if reason indicates goods return, require POSTED Return GRN
            const reasonLower = input.reason.toLowerCase();
            if (reasonLower.includes('returned goods') || reasonLower.includes('goods return') || reasonLower.includes('return to supplier')) {
                if (!input.returnGrnId) {
                    throw new Error('Supplier credit note for returned goods requires a posted Return GRN reference');
                }
                // Validate the Return GRN exists and is POSTED
                const rgrnCheck = await client.query(
                    `SELECT id, status FROM return_grn WHERE id = $1`,
                    [input.returnGrnId]
                );
                if (rgrnCheck.rows.length === 0) throw new Error('Referenced Return GRN not found');
                if (rgrnCheck.rows[0].status !== 'POSTED') throw new Error('Referenced Return GRN must be POSTED');
            }

            const noteNumber = await supplierCreditDebitNoteRepository.generateSupplierCreditNoteNumber(client);

            const note = await supplierCreditDebitNoteRepository.createSupplierNote(client, {
                invoiceNumber: noteNumber,
                documentType: 'SUPPLIER_CREDIT_NOTE',
                referenceInvoiceId: input.invoiceId,
                supplierId: invoice.supplierId,
                issueDate: input.issueDate || getBusinessDate(),
                subtotal: Money.toNumber(subtotal),
                taxAmount: Money.toNumber(taxTotal),
                totalAmount: total,
                reason: input.reason,
                notes: input.notes || null,
                returnGrnId: input.returnGrnId || null,
            });

            const lineItems = await supplierCreditDebitNoteRepository.createSupplierNoteLineItems(
                client,
                note.id,
                effectiveCreditLines.map(l => ({
                    productId: (l as { productId?: string }).productId || '',
                    productName: l.productName,
                    description: (l as { description?: string }).description || null,
                    quantity: l.quantity,
                    unitCost: l.unitCost,
                    taxRate: l.taxRate ?? 0,
                })),
            );

            logger.info('Supplier credit note draft created', { noteId: note.id, noteNumber: note.invoiceNumber });
            return { note, lineItems };
        });
    },

    async createDebitNote(
        pool: Pool,
        input: CreateSupplierDebitNote,
    ): Promise<{ note: SupplierCreditDebitNoteRecord; lineItems: unknown[] }> {

        return UnitOfWork.run(pool, async (client) => {
            const invoice = await supplierCreditDebitNoteRepository.getSupplierInvoiceById(client, input.invoiceId);
            if (!invoice) throw new Error('Supplier invoice not found');
            if (invoice.documentType !== 'SUPPLIER_INVOICE') throw new Error('Cannot create a note against another note');
            if (invoice.status === 'CANCELLED' || invoice.status === 'Cancelled') throw new Error('Cannot create a note against a cancelled invoice');

            // Synthesize a single line when no line items are provided (amount-only path)
            const effectiveDebitLines = (input.lines && input.lines.length > 0)
                ? input.lines
                : [{ productName: 'Additional Charge', quantity: 1, unitCost: input.amount as number, taxRate: 0 }];

            let subtotal = Money.zero();
            let taxTotal = Money.zero();
            for (const line of effectiveDebitLines) {
                const lineAmount = Money.multiply(Money.parseDb(line.quantity), Money.parseDb(line.unitCost));
                const lineTax = Money.multiply(lineAmount, Money.divide(Money.parseDb(line.taxRate ?? 0), Money.parseDb(100)));
                subtotal = Money.add(subtotal, lineAmount);
                taxTotal = Money.add(taxTotal, lineTax);
            }
            const totalAmount = Money.add(subtotal, taxTotal);
            const total = Money.toNumber(totalAmount);

            // Supplier debit notes ADD charges to the supplier (damaged goods, shortages, etc.)
            // Unlike credit notes, they are NOT capped at the original invoice total.
            // SAP/Odoo: credit notes ≤ invoice total, debit notes are uncapped.

            const noteNumber = await supplierCreditDebitNoteRepository.generateSupplierDebitNoteNumber(client);

            const note = await supplierCreditDebitNoteRepository.createSupplierNote(client, {
                invoiceNumber: noteNumber,
                documentType: 'SUPPLIER_DEBIT_NOTE',
                referenceInvoiceId: input.invoiceId,
                supplierId: invoice.supplierId,
                issueDate: input.issueDate || getBusinessDate(),
                subtotal: Money.toNumber(subtotal),
                taxAmount: Money.toNumber(taxTotal),
                totalAmount: Money.toNumber(totalAmount),
                reason: input.reason,
                notes: input.notes || null,
            });

            const lineItems = await supplierCreditDebitNoteRepository.createSupplierNoteLineItems(
                client,
                note.id,
                effectiveDebitLines.map(l => ({
                    productId: (l as { productId?: string }).productId || '',
                    productName: l.productName,
                    description: (l as { description?: string }).description || null,
                    quantity: l.quantity,
                    unitCost: l.unitCost,
                    taxRate: l.taxRate ?? 0,
                })),
            );

            logger.info('Supplier debit note draft created', { noteId: note.id, noteNumber: note.invoiceNumber });
            return { note, lineItems };
        });
    },

    async postNote(
        pool: Pool,
        noteId: string,
    ): Promise<SupplierCreditDebitNoteRecord> {

        return UnitOfWork.run(pool, async (client) => {
            const note = await supplierCreditDebitNoteRepository.postSupplierNote(client, noteId);
            if (!note) throw new Error('Supplier note not found or cannot be posted (must be in DRAFT status)');

            const glData = {
                noteId: note.id,
                noteNumber: note.invoiceNumber,
                noteDate: typeof note.issueDate === 'string'
                    ? note.issueDate.split('T')[0]
                    : getBusinessDate(),
                subtotal: note.subtotal,
                taxAmount: note.taxAmount,
                totalAmount: note.totalAmount,
                supplierId: note.supplierId,
                supplierName: note.supplierName,
            };

            if (note.documentType === 'SUPPLIER_CREDIT_NOTE') {
                await recordSupplierCreditNoteToGL(glData, pool);

                // SAP/Odoo hybrid model:
                //  • If the CN points at a specific bill (referenceInvoiceId is
                //    set — typical for RGRN-derived or user-targeted CNs), apply
                //    immediately to that bill. No floating credit.
                //  • If the CN is standalone (no reference), leave it as
                //    on-account credit (Status='POSTED', OB=full). The user can
                //    later click "Apply to Open Bills" to auto-FIFO it.
                if (note.referenceInvoiceId) {
                    await this.applySupplierCreditNote(client, note.id, {
                        primaryBillId: note.referenceInvoiceId,
                        allowFIFO: false,
                    });
                }
            } else {
                await recordSupplierDebitNoteToGL(glData, pool);
                // Debit notes track their additional AP obligation via the note's own
                // OutstandingBalance in recalcSupplierBalance. Do NOT adjust the reference
                // invoice's AmountPaid — that mechanism relies on AmountPaid > 0, and
                // silently fails for unpaid invoices (clamped to 0), causing cancel to
                // incorrectly reduce invoice OB. The note's OB in recalcSupplierBalance
                // is the authoritative signal for this additional obligation.
            }

            // Recalculate supplier outstanding balance from sub-ledger (SSOT).
            // adjustSupplierInvoiceBalance only updates supplier_invoices; without this
            // call, suppliers."OutstandingBalance" stays stale after note posting.
            if (note.supplierId) {
                await recalcSupplierBalance(client, note.supplierId);
            }

            logger.info('Supplier note posted', {
                noteId: note.id, noteNumber: note.invoiceNumber, type: note.documentType,
            });
            return note;
        });
    },

    /**
     * Cancel a posted supplier note (POSTED → CANCELLED).
     * Reverses the GL journal entry and restores original invoice balance.
     * SAP/Odoo compliance: posted documents are cancelled via reversal, never deleted.
     */
    async cancelNote(
        pool: Pool,
        noteId: string,
        reason: string,
    ): Promise<SupplierCreditDebitNoteRecord> {

        return UnitOfWork.run(pool, async (client) => {
            // 1. Get the note to validate it
            const noteData = await supplierCreditDebitNoteRepository.getSupplierNoteById(client, noteId);
            if (!noteData) throw new Error('Supplier note not found');
            // Allow cancelling POSTED notes and APPLIED notes (CNs applied to a bill via applySupplierCreditNote)
            if (noteData.status !== 'POSTED' && noteData.status !== 'APPLIED') throw new Error('Only posted notes can be cancelled');

            // 2. Cancel the note record
            const cancelled = await supplierCreditDebitNoteRepository.cancelSupplierNote(client, noteId);
            if (!cancelled) throw new Error('Failed to cancel supplier note');

            // 3. Reverse the GL journal entry
            const refType = noteData.documentType === 'SUPPLIER_CREDIT_NOTE' ? 'SUPPLIER_CREDIT_NOTE' : 'SUPPLIER_DEBIT_NOTE';
            const glTxn = await pool.query(
                `SELECT "Id" FROM ledger_transactions
         WHERE "ReferenceType" = $1 AND "ReferenceId" = $2
           AND "IsReversed" = FALSE
         LIMIT 1`,
                [refType, noteId]
            );

            if (glTxn.rows.length > 0) {
                try {
                    await AccountingCore.reverseTransaction({
                        originalTransactionId: glTxn.rows[0].Id,
                        reversalDate: getBusinessDate(),
                        reason: `CANCEL: ${noteData.invoiceNumber} — ${reason}`,
                        userId: SYSTEM_USER_ID,
                        idempotencyKey: `${refType}_CANCEL-${noteId}`,
                    }, pool);
                } catch (error: unknown) {
                    if (error instanceof AccountingError && error.code === 'ALREADY_REVERSED') {
                        logger.info('Supplier note GL already reversed (idempotent)', { noteId });
                    } else {
                        throw error;
                    }
                }
            }

            // 4. Reverse the balance adjustment on the original supplier invoice
            if (noteData.documentType === 'SUPPLIER_CREDIT_NOTE') {
                // Credit note reduced AP → reverse by increasing AP (debit direction)
                await supplierCreditDebitNoteRepository.adjustSupplierInvoiceBalance(
                    client,
                    noteData.referenceInvoiceId,
                    noteData.totalAmount,
                    'DEBIT',
                );
            } else {
                // Debit note: no invoice balance was adjusted during post (see postNote),
                // so no reversal is needed here. The note's CANCELLED status is sufficient
                // for recalcSupplierBalance to exclude it from the total.
            }

            // Recalculate supplier outstanding balance from sub-ledger (SSOT).
            // adjustSupplierInvoiceBalance only updates supplier_invoices; without this
            // call, suppliers."OutstandingBalance" stays stale after note cancellation.
            if (noteData.supplierId) {
                await recalcSupplierBalance(client, noteData.supplierId);
            }

            logger.info('Supplier note cancelled with GL reversal', {
                noteId: cancelled.id,
                noteNumber: cancelled.invoiceNumber,
                type: cancelled.documentType,
                reason,
            });
            return cancelled;
        });
    },

    async listNotes(
        pool: Pool,
        options: {
            documentType?: 'SUPPLIER_CREDIT_NOTE' | 'SUPPLIER_DEBIT_NOTE';
            supplierId?: string;
            referenceInvoiceId?: string;
            status?: string;
            page: number;
            limit: number;
        },
    ) {
        return supplierCreditDebitNoteRepository.listSupplierNotes(pool, {
            ...options,
            documentType: options.documentType || undefined,
        });
    },

    async getNoteById(
        pool: Pool,
        noteId: string,
    ): Promise<{ note: SupplierCreditDebitNoteRecord; lineItems: unknown[] } | null> {
        const note = await supplierCreditDebitNoteRepository.getSupplierNoteById(pool, noteId);
        if (!note) return null;
        const lineItems = await supplierCreditDebitNoteRepository.getSupplierInvoiceLineItems(pool, noteId);
        return { note, lineItems };
    },

    /**
     * Get all notes linked to a specific supplier invoice.
     */
    async getNotesForInvoice(
        pool: Pool,
        invoiceId: string,
    ) {
        const creditNotes = await supplierCreditDebitNoteRepository.getNotesForSupplierInvoice(pool, invoiceId, 'SUPPLIER_CREDIT_NOTE');
        const debitNotes = await supplierCreditDebitNoteRepository.getNotesForSupplierInvoice(pool, invoiceId, 'SUPPLIER_DEBIT_NOTE');
        return { creditNotes, debitNotes };
    },

    /**
     * Apply a posted Supplier Credit Note's residual balance against open
     * bills. Used by:
     *  - postNote() for RGRN-derived / referenced CNs (allowFIFO=false,
     *    primaryBillId=referenceInvoiceId) — guaranteed-correct allocation.
     *  - returnGrnService for RGRN flows (same).
     *  - The "Apply to Open Bills" manual button for standalone CNs
     *    (allowFIFO=true, no primary).
     *
     * Returns the per-bill allocation summary so callers / UI can display it.
     * Idempotent: re-running on a fully-applied CN is a no-op.
     */
    async applySupplierCreditNote(
        clientOrPool: Pool | PoolClient,
        creditNoteId: string,
        options: { primaryBillId?: string | null; allowFIFO: boolean },
    ): Promise<{
        creditNoteId: string;
        totalApplied: number;
        residual: number;
        status: string;
        allocations: Array<{ billId: string; amount: number }>;
    }> {
        const note = await supplierCreditDebitNoteRepository.getSupplierNoteById(clientOrPool, creditNoteId);
        if (!note) throw new Error('Supplier credit note not found');
        if (note.documentType !== 'SUPPLIER_CREDIT_NOTE') {
            throw new Error('Only supplier credit notes can be applied');
        }
        if (note.status !== 'POSTED') {
            // APPLIED / CANCELLED / DRAFT — nothing to apply
            return {
                creditNoteId,
                totalApplied: 0,
                residual: 0,
                status: note.status,
                allocations: [],
            };
        }

        // Compute current residual from the row itself (may be partially applied
        // already). Total - AmountPaid is the live remaining amount.
        const noteRow = await clientOrPool.query(
            `SELECT "TotalAmount", COALESCE("AmountPaid", 0) AS "AmountPaid", "SupplierId"
             FROM supplier_invoices WHERE "Id" = $1`,
            [creditNoteId],
        );
        if (!noteRow.rows[0]) throw new Error('Supplier credit note not found');
        const total = Number(noteRow.rows[0].TotalAmount);
        const alreadyApplied = Number(noteRow.rows[0].AmountPaid);
        const supplierId = noteRow.rows[0].SupplierId as string;
        let remaining = Math.max(total - alreadyApplied, 0);
        if (remaining <= 0) {
            return { creditNoteId, totalApplied: 0, residual: 0, status: 'APPLIED', allocations: [] };
        }

        const allocations: Array<{ billId: string; amount: number }> = [];

        // 1) Primary bill first (RGRN flow / referenceInvoiceId).
        if (options.primaryBillId) {
            const r = await supplierCreditDebitNoteRepository.applyAmountToSupplierBill(
                clientOrPool, options.primaryBillId, remaining,
            );
            if (r.applied > 0) {
                allocations.push({ billId: options.primaryBillId, amount: r.applied });
                remaining -= r.applied;
            }
        }

        // 2) FIFO fallback for residual (only when explicitly allowed).
        if (options.allowFIFO && remaining > 0) {
            const openBills = await supplierCreditDebitNoteRepository.getOpenBillsForSupplierFIFO(
                clientOrPool, supplierId, options.primaryBillId ?? null,
            );
            for (const bill of openBills) {
                if (remaining <= 0) break;
                const r = await supplierCreditDebitNoteRepository.applyAmountToSupplierBill(
                    clientOrPool, bill.id, remaining,
                );
                if (r.applied > 0) {
                    allocations.push({ billId: bill.id, amount: r.applied });
                    remaining -= r.applied;
                }
            }
        }

        // 3) Close out the CN itself (mark APPLIED if fully consumed).
        const totalApplied = allocations.reduce((s, a) => s + a.amount, 0);
        let status = note.status;
        if (totalApplied > 0) {
            const closed = await supplierCreditDebitNoteRepository.closeAppliedCreditNote(
                clientOrPool, creditNoteId, totalApplied,
            );
            status = closed.status;
        }

        // 4) Recalculate the supplier's cached outstanding (live derivation
        //    elsewhere is correct, but the cache should be in sync for
        //    legacy reads).
        if (supplierId) {
            await recalcSupplierBalance(clientOrPool as PoolClient, supplierId);
        }

        logger.info('Supplier credit note applied', {
            creditNoteId, totalApplied, residual: remaining, allocations: allocations.length, status,
        });

        return {
            creditNoteId,
            totalApplied,
            residual: Math.max(remaining, 0),
            status,
            allocations,
        };
    },

    /**
     * Public entry point for the "Apply to Open Bills" manual button.
     * Wraps applySupplierCreditNote in a transaction with allowFIFO=true.
     */
    async applyCreditNoteToOpenBillsFIFO(
        pool: Pool,
        creditNoteId: string,
    ) {
        return UnitOfWork.run(pool, async (client) => {
            return this.applySupplierCreditNote(client, creditNoteId, {
                primaryBillId: null,
                allowFIFO: true,
            });
        });
    },
};
