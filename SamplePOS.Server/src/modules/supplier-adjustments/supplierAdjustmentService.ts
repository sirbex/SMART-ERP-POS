/**
 * Supplier Adjustment Service
 *
 * Unified orchestration layer for two adjustment paths:
 *   1. RETURN   — Creates Return GRN + Supplier Credit Note
 *                 GL net: DR AP (2100) / CR Inventory (1300)
 *   2. PRICE_CORRECTION — Creates + posts Supplier Credit Note directly
 *                 GL: DR AP (2100) / CR GRN/IR Clearing (2150)
 *
 * This service contains ZERO GL logic — it delegates to:
 *   - returnGrnService (for RETURN path)
 *   - supplierCreditDebitNoteService (for PRICE_CORRECTION path)
 */

import type { Pool } from 'pg';
import type { AdjustSupplierInvoice } from '../../../../shared/zod/supplierAdjustment.js';
import { returnGrnService } from '../return-grn/returnGrnService.js';
import { returnGrnRepository } from '../return-grn/returnGrnRepository.js';
import { supplierCreditDebitNoteService } from '../credit-debit-notes/creditDebitNoteService.js';
import { findInvoiceById } from '../supplier-payments/supplierPaymentRepository.js';
import logger from '../../utils/logger.js';
import { Money } from '../../utils/money.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReturnableItem {
    grItemId: string;
    grnId: string;
    grnNumber: string;
    productId: string;
    productName: string;
    batchId: string | null;
    batchNumber: string | null;
    expiryDate: string | null;
    uomId: string | null;
    uomName: string | null;
    uomSymbol: string | null;
    receivedQuantity: number;
    returnedQuantity: number;
    returnableQuantity: number;
    unitCost: number;
}

export interface AdjustmentContext {
    invoice: {
        id: string;
        invoiceNumber: string;
        supplierName: string;
        totalAmount: number;
        amountPaid: number;
        outstandingBalance: number;
        status: string;
    };
    returnableItems: ReturnableItem[];
    suggestedIntent: 'RETURN' | 'PRICE_CORRECTION';
}

export interface AdjustmentResult {
    intent: 'RETURN' | 'PRICE_CORRECTION';
    creditNoteId: string;
    creditNoteNumber: string;
    returnGrnId?: string;
    returnGrnNumber?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const supplierAdjustmentService = {

    /**
     * Returns invoice details + linked GRN lines with returnable quantities.
     * Used by the frontend to populate the adjustment modal.
     */
    async getInvoiceContext(
        pool: Pool,
        invoiceId: string,
    ): Promise<AdjustmentContext> {
        const invoice = await findInvoiceById(pool, invoiceId);
        if (!invoice) throw new Error('Supplier invoice not found');
        if (invoice.status === 'Cancelled' || invoice.status === 'CANCELLED') {
            throw new Error('Cannot adjust a cancelled invoice');
        }
        if (Number(invoice.outstandingBalance) <= 0) {
            throw new Error('Invoice is fully paid — no outstanding balance to adjust');
        }

        // Find GRNs linked to this invoice via the PO chain (invoice → PO → GRNs)
        const grnResult = await pool.query(
            `SELECT gr.id, gr.receipt_number AS "receiptNumber"
             FROM goods_receipts gr
             WHERE gr.purchase_order_id = (
                 SELECT "PurchaseOrderId" FROM supplier_invoices WHERE "Id" = $1
             )
             AND gr.status = 'COMPLETED'`,
            [invoiceId],
        );

        // Gather returnable items from each linked GRN
        const returnableItems: ReturnableItem[] = [];
        for (const grn of grnResult.rows) {
            const items = await returnGrnRepository.getReturnableItems(pool, grn.id as string);
            for (const item of items) {
                if (item.returnableQuantity > 0) {
                    returnableItems.push({
                        ...item,
                        grnId: grn.id as string,
                        grnNumber: grn.receiptNumber as string,
                    });
                }
            }
        }

        const suggestedIntent: 'RETURN' | 'PRICE_CORRECTION' =
            returnableItems.length > 0 ? 'RETURN' : 'PRICE_CORRECTION';

        return {
            invoice: {
                id: invoice.id as string,
                invoiceNumber: (invoice.invoiceNumber ?? invoice.supplierInvoiceNumber ?? '') as string,
                supplierName: (invoice.supplierName ?? '') as string,
                totalAmount: Money.toNumber(Money.parseDb(String(invoice.totalAmount))),
                amountPaid: Money.toNumber(Money.parseDb(String(invoice.amountPaid ?? 0))),
                outstandingBalance: Money.toNumber(Money.parseDb(String(invoice.outstandingBalance ?? 0))),
                status: invoice.status as string,
            },
            returnableItems,
            suggestedIntent,
        };
    },

    /**
     * Execute the adjustment.
     * RETURN path:    RGRN (draft→post) + SCN from return (atomic)
     * PRICE_CORRECTION path: SCN create + post (atomic)
     */
    async adjust(
        pool: Pool,
        input: AdjustSupplierInvoice,
        userId: string,
    ): Promise<AdjustmentResult> {

        if (input.intent === 'RETURN') {
            logger.info('Supplier adjustment: RETURN path', {
                invoiceId: input.invoiceId,
                grnId: input.grnId,
                userId,
            });

            // 1. Create DRAFT Return GRN
            const { returnGrn } = await returnGrnService.create(pool, {
                grnId: input.grnId,
                reason: input.reason,
                createdBy: userId,
                lines: input.lines.map(l => ({
                    productId: l.productId,
                    batchId: l.batchId ?? null,
                    uomId: l.uomId ?? null,
                    quantity: l.quantity,
                    unitCost: l.unitCost,
                })),
            });

            // 2. Post Return GRN — deducts stock + GL: DR GRN/IR Clearing / CR Inventory
            await returnGrnService.post(pool, returnGrn.id);

            // 3. Create Supplier Credit Note from Return — GL: DR AP / CR GRN/IR Clearing
            // Pass invoiceId directly so no PO-chain lookup is needed
            const { creditNoteId, creditNoteNumber } =
                await returnGrnService.createCreditNoteFromReturn(pool, returnGrn.id, input.invoiceId);

            logger.info('Supplier adjustment RETURN completed', {
                returnGrnId: returnGrn.id,
                returnGrnNumber: returnGrn.returnGrnNumber,
                creditNoteId,
                creditNoteNumber,
            });

            return {
                intent: 'RETURN',
                creditNoteId,
                creditNoteNumber,
                returnGrnId: returnGrn.id,
                returnGrnNumber: returnGrn.returnGrnNumber,
            };
        }

        // PRICE_CORRECTION path
        logger.info('Supplier adjustment: PRICE_CORRECTION path', {
            invoiceId: input.invoiceId,
            amount: input.amount,
            userId,
        });

        const { note } = await supplierCreditDebitNoteService.createCreditNote(pool, {
            invoiceId: input.invoiceId,
            noteType: 'PRICE_CORRECTION',
            reason: input.reason,
            notes: input.notes,
            amount: input.amount,
        });

        const posted = await supplierCreditDebitNoteService.postNote(pool, note.id);

        logger.info('Supplier adjustment PRICE_CORRECTION completed', {
            creditNoteId: posted.id,
            creditNoteNumber: posted.invoiceNumber,
        });

        return {
            intent: 'PRICE_CORRECTION',
            creditNoteId: posted.id,
            creditNoteNumber: posted.invoiceNumber,
        };
    },
};
