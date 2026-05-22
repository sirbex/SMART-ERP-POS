/**
 * Customer Invoice Adjustment Service
 *
 * Orchestrates SAP/Odoo-style customer invoice corrections:
 *   PRICE_CORRECTION — line-level credit note (no stock), posted atomically
 *   RETURN_GOODS     — credit note with returnsGoods + inventory RETURN
 *
 * Delegates GL and balance sync to creditDebitNoteService.
 */

import type { Pool } from 'pg';
import type { AdjustCustomerInvoice } from '../../../../shared/zod/customerInvoiceAdjustment.js';
import { creditDebitNoteRepository } from '../credit-debit-notes/creditDebitNoteRepository.js';
import { creditDebitNoteService } from '../credit-debit-notes/creditDebitNoteService.js';
import { invoiceRepository } from '../invoices/invoiceRepository.js';
import { salesRepository } from '../sales/salesRepository.js';
import { getFinalPrice } from '../pricing/pricingEngineService.js';
import * as pricingRepo from '../pricing/pricingRepository.js';
import { BusinessRuleException } from '../../errors/BusinessRuleException.js';
import { NotFoundError } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';
import { Money } from '../../utils/money.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OverchargeLine {
    saleItemId: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPriceCharged: number;
    batchUnitCost: number;
    suggestedCorrectUnitPrice: number;
    suggestedCreditPerUnit: number;
    suggestedLineCredit: number;
    pricingScope: string | null;
}

export interface ReturnableSaleLine {
    saleItemId: string;
    productId: string;
    productName: string;
    quantity: number;
    returnableQuantity: number;
    unitPrice: number;
}

export interface AdjustmentContext {
    invoice: {
        id: string;
        invoiceNumber: string;
        customerId: string;
        customerName: string;
        totalAmount: number;
        amountPaid: number;
        outstandingBalance: number;
        status: string;
        saleId: string | null;
        saleNumber: string | null;
        saleStatus: string | null;
    };
    customerPricingMode: 'STANDARD' | 'AT_COST';
    overchargeLines: OverchargeLine[];
    returnableLines: ReturnableSaleLine[];
    existingCreditNoteTotal: number;
    suggestedIntent: 'PRICE_CORRECTION' | 'RETURN_GOODS' | 'NONE';
}

export interface AdjustmentResult {
    intent: 'PRICE_CORRECTION' | 'RETURN_GOODS';
    creditNoteId: string;
    creditNoteNumber: string;
    totalCredit: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function saleItemFromRow(row: Record<string, unknown>) {
    const id = String(row.id ?? '');
    const productId = String(row.product_id ?? row.productId ?? '');
    const productName = String(row.product_name ?? row.productName ?? 'Item');
    const quantity = Money.toNumber(Money.parseDb(row.quantity ?? 0));
    const unitPrice = Money.toNumber(Money.parseDb(row.unit_price ?? row.unitPrice ?? 0));
    const unitCost = Money.toNumber(Money.parseDb(row.unit_cost ?? row.unitCost ?? row.cost_price ?? 0));
    return { id, productId, productName, quantity, unitPrice, unitCost };
}

const VOID_SALE_STATUSES = new Set(['VOID', 'VOIDED', 'VOIDED_BY_RETURN', 'CANCELLED']);

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const customerInvoiceAdjustmentService = {

    async getInvoiceContext(pool: Pool, invoiceId: string): Promise<AdjustmentContext> {
        const invoice = await creditDebitNoteRepository.getInvoiceById(pool, invoiceId);
        if (!invoice) throw new NotFoundError('Customer invoice');
        if (invoice.documentType !== 'INVOICE') {
            throw new BusinessRuleException(
                'Only standard customer invoices can be adjusted',
                'ADJUST_NOT_INVOICE',
            );
        }
        if (['CANCELLED', 'Cancelled', 'VOIDED', 'VOID'].includes(invoice.status)) {
            throw new BusinessRuleException(
                'Cannot adjust a cancelled or voided invoice',
                'ADJUST_INVOICE_CANCELLED',
            );
        }

        const invRow = await invoiceRepository.getInvoiceById(pool, invoiceId);
        const saleId = invRow?.sale_id ?? null;

        let saleNumber: string | null = null;
        let saleStatus: string | null = null;
        const overchargeLines: OverchargeLine[] = [];
        const returnableLines: ReturnableSaleLine[] = [];

        const pricingMode = invoice.customerId
            ? await pricingRepo.getCustomerPricingMode(pool, invoice.customerId)
            : 'STANDARD';

        if (saleId) {
            const saleData = await salesRepository.getSaleById(pool, saleId);
            if (!saleData) {
                throw new BusinessRuleException(
                    'Linked sale not found — cannot build adjustment lines',
                    'ADJUST_SALE_MISSING',
                );
            }
            const sale = saleData.sale as Record<string, unknown>;
            saleNumber = String(sale.sale_number ?? sale.saleNumber ?? '');
            saleStatus = String(sale.status ?? '');
            if (VOID_SALE_STATUSES.has(saleStatus)) {
                throw new BusinessRuleException(
                    `Linked sale ${saleNumber} is void — use a different correction path`,
                    'ADJUST_SALE_VOID',
                );
            }

            for (const raw of saleData.items as Record<string, unknown>[]) {
                const item = saleItemFromRow(raw);
                if (!item.productId) continue;

                returnableLines.push({
                    saleItemId: item.id,
                    productId: item.productId,
                    productName: item.productName,
                    quantity: item.quantity,
                    returnableQuantity: item.quantity,
                    unitPrice: item.unitPrice,
                });

                const resolved = await getFinalPrice(
                    item.productId,
                    invoice.customerId,
                    undefined,
                    item.quantity,
                    pool,
                );
                const correct = Money.toNumber(Money.parseDb(resolved.finalPrice));
                const creditPerUnit = Money.toNumber(
                    Money.subtract(Money.parseDb(item.unitPrice), Money.parseDb(correct)),
                );
                if (creditPerUnit > 0.009) {
                    const lineCredit = Money.toNumber(
                        Money.multiply(Money.parseDb(item.quantity), Money.parseDb(creditPerUnit)),
                    );
                    overchargeLines.push({
                        saleItemId: item.id,
                        productId: item.productId,
                        productName: item.productName,
                        quantity: item.quantity,
                        unitPriceCharged: item.unitPrice,
                        batchUnitCost: item.unitCost,
                        suggestedCorrectUnitPrice: correct,
                        suggestedCreditPerUnit: creditPerUnit,
                        suggestedLineCredit: lineCredit,
                        pricingScope: resolved.appliedRule?.scope ?? null,
                    });
                }
            }
        }

        const settlement = await invoiceRepository.getInvoiceSettlement(pool, invoiceId);
        const outstandingBalance = settlement?.amountDue ?? invoice.outstandingBalance;
        const amountPaid = settlement?.amountPaid ?? invoice.amountPaid;

        const existingNotes = await creditDebitNoteRepository.getNotesForInvoice(
            pool,
            invoiceId,
            'CREDIT_NOTE',
        );
        const existingCreditNoteTotal = existingNotes.reduce(
            (sum, n) => sum + n.totalAmount,
            0,
        );

        const totalSuggestedCredit = overchargeLines.reduce(
            (sum, l) => sum + l.suggestedLineCredit,
            0,
        );
        const remainingCorrectable = Math.max(0, totalSuggestedCredit - existingCreditNoteTotal);

        if (outstandingBalance <= 0.009 && overchargeLines.length === 0) {
            throw new BusinessRuleException(
                'This invoice is fully settled and has no lines eligible for price correction or return.',
                'ADJUST_INVOICE_SETTLED',
            );
        }
        if (overchargeLines.length > 0 && remainingCorrectable <= 0.009) {
            throw new BusinessRuleException(
                'Credit notes already cover the full overcharge on this invoice. No further adjustment is allowed.',
                'ADJUST_ALREADY_CREDITED',
            );
        }
        if (outstandingBalance <= 0.009 && remainingCorrectable <= 0.009) {
            throw new BusinessRuleException(
                'Cannot adjust a fully paid invoice with no remaining correctable amount.',
                'ADJUST_INVOICE_SETTLED',
            );
        }

        let suggestedIntent: AdjustmentContext['suggestedIntent'] = 'NONE';
        if (overchargeLines.length > 0) suggestedIntent = 'PRICE_CORRECTION';
        else if (returnableLines.length > 0) suggestedIntent = 'RETURN_GOODS';

        return {
            invoice: {
                id: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                customerId: invoice.customerId,
                customerName: invoice.customerName,
                totalAmount: invoice.totalAmount,
                amountPaid,
                outstandingBalance,
                status: invoice.status,
                saleId,
                saleNumber,
                saleStatus,
            },
            customerPricingMode: pricingMode,
            overchargeLines,
            returnableLines,
            existingCreditNoteTotal,
            suggestedIntent,
        };
    },

    async adjust(
        pool: Pool,
        input: AdjustCustomerInvoice,
        userId: string,
    ): Promise<AdjustmentResult> {
        const context = await this.getInvoiceContext(pool, input.invoiceId);

        if (input.intent === 'PRICE_CORRECTION') {
            return this.adjustPriceCorrection(pool, input, context, userId);
        }
        return this.adjustReturnGoods(pool, input, context, userId);
    },

    async adjustPriceCorrection(
        pool: Pool,
        input: Extract<AdjustCustomerInvoice, { intent: 'PRICE_CORRECTION' }>,
        context: AdjustmentContext,
        userId: string,
    ): Promise<AdjustmentResult> {
        const bySaleItem = new Map(context.overchargeLines.map((l) => [l.saleItemId, l]));
        const cnLines: Array<{
            productId: string;
            productName: string;
            description: string;
            quantity: number;
            unitPrice: number;
            taxRate: number;
        }> = [];

        for (const sel of input.lines) {
            const line = bySaleItem.get(sel.saleItemId);
            if (!line) {
                throw new BusinessRuleException(
                    `Line ${sel.saleItemId} is not eligible for price correction on this invoice`,
                    'ADJUST_LINE_NOT_ELIGIBLE',
                    { saleItemId: sel.saleItemId },
                );
            }
            cnLines.push({
                productId: line.productId,
                productName: line.productName,
                description: `sale_item:${line.saleItemId}|charged:${line.unitPriceCharged}|correct:${line.suggestedCorrectUnitPrice}`,
                quantity: line.quantity,
                unitPrice: line.suggestedCreditPerUnit,
                taxRate: 0,
            });
        }

        const totalCredit = cnLines.reduce(
            (sum, l) => sum + l.quantity * l.unitPrice,
            0,
        );
        if (totalCredit <= 0) {
            throw new BusinessRuleException(
                'Total credit must be greater than zero',
                'ADJUST_ZERO_CREDIT',
            );
        }

        logger.info('Customer adjustment: PRICE_CORRECTION', {
            invoiceId: input.invoiceId,
            lineCount: cnLines.length,
            totalCredit,
            userId,
        });

        const { note } = await creditDebitNoteService.createCreditNote(pool, {
            invoiceId: input.invoiceId,
            noteType: 'PRICE_CORRECTION',
            reason: input.reason,
            notes: input.notes,
            returnsGoods: false,
            lines: cnLines,
        });

        const posted = await creditDebitNoteService.postNote(pool, note.id);

        return {
            intent: 'PRICE_CORRECTION',
            creditNoteId: posted.id,
            creditNoteNumber: posted.invoiceNumber,
            totalCredit,
        };
    },

    async adjustReturnGoods(
        pool: Pool,
        input: Extract<AdjustCustomerInvoice, { intent: 'RETURN_GOODS' }>,
        context: AdjustmentContext,
        userId: string,
    ): Promise<AdjustmentResult> {
        const bySaleItem = new Map(context.returnableLines.map((l) => [l.saleItemId, l]));
        const cnLines: Array<{
            productId: string;
            productName: string;
            description: string;
            quantity: number;
            unitPrice: number;
            taxRate: number;
        }> = [];

        for (const sel of input.lines) {
            const line = bySaleItem.get(sel.saleItemId);
            if (!line) {
                throw new BusinessRuleException(
                    `Line ${sel.saleItemId} is not returnable on this invoice`,
                    'ADJUST_RETURN_LINE_INVALID',
                    { saleItemId: sel.saleItemId },
                );
            }
            if (sel.quantity > line.returnableQuantity + 0.0001) {
                throw new BusinessRuleException(
                    `Return quantity exceeds sale quantity for ${line.productName}`,
                    'ADJUST_RETURN_QTY_EXCEEDED',
                    { saleItemId: sel.saleItemId, max: line.returnableQuantity },
                );
            }
            cnLines.push({
                productId: line.productId,
                productName: line.productName,
                description: `sale_item:${line.saleItemId}|return`,
                quantity: sel.quantity,
                unitPrice: line.unitPrice,
                taxRate: 0,
            });
        }

        const totalCredit = cnLines.reduce(
            (sum, l) => sum + l.quantity * l.unitPrice,
            0,
        );

        logger.info('Customer adjustment: RETURN_GOODS', {
            invoiceId: input.invoiceId,
            lineCount: cnLines.length,
            totalCredit,
            userId,
        });

        const { note } = await creditDebitNoteService.createCreditNote(pool, {
            invoiceId: input.invoiceId,
            noteType: 'PARTIAL',
            reason: input.reason,
            notes: input.notes,
            returnsGoods: true,
            lines: cnLines,
        });

        const posted = await creditDebitNoteService.postNote(pool, note.id);

        return {
            intent: 'RETURN_GOODS',
            creditNoteId: posted.id,
            creditNoteNumber: posted.invoiceNumber,
            totalCredit,
        };
    },
};
