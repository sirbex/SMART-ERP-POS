/**
 * Phase D — reversal / correction dependency orchestrator (preview v1).
 *
 * Answers what correction path is allowed before any inventory/AP/AR mutation.
 * Does not execute corrections — routes to existing modules.
 */

import type { Pool, PoolClient } from 'pg';
import { returnGrnRepository } from '../return-grn/returnGrnRepository.js';
import { supplierAdjustmentService } from '../supplier-adjustments/supplierAdjustmentService.js';
import { getPaymentWithAllocations } from '../ar-payments/arPaymentService.js';
import { correctionEligibilityRepository } from './correctionEligibilityRepository.js';
import type {
    CorrectionDocumentType,
    CorrectionEligibilityResult,
    CorrectionKind,
    CorrectionRoute,
} from './correctionEligibilityTypes.js';
import { isGoodsReceiptPosted } from '@shared/domain/pgDomainEnums.js';
import { planSupplierBillsForGrFullReverse } from '@shared/domain/grFullReverseSsot.js';

function result(
    base: Pick<CorrectionEligibilityResult, 'documentType' | 'documentId' | 'documentNumber'>,
    partial: Partial<CorrectionEligibilityResult>,
): CorrectionEligibilityResult {
    const blockers = partial.blockers ?? [];
    const route = partial.route ?? 'BLOCKED';
    const allowed = partial.allowed ?? (blockers.length === 0 && route !== 'BLOCKED');
    return {
        ...base,
        allowed,
        route,
        blockers,
        warnings: partial.warnings ?? [],
        suggestedActions: partial.suggestedActions ?? [],
        correctionKind: partial.correctionKind,
        context: partial.context,
    };
}

function isCancelledStatus(status: string): boolean {
    const s = status.toUpperCase();
    return ['CANCELLED', 'VOID', 'VOIDED', 'DELETED', 'CANCELLED'].includes(s);
}

export const correctionEligibilityService = {

    async getEligibility(
        pool: Pool,
        documentType: CorrectionDocumentType,
        documentId: string,
    ): Promise<CorrectionEligibilityResult> {
        switch (documentType) {
            case 'GOODS_RECEIPT':
                return this.eligibilityGoodsReceipt(pool, documentId);
            case 'SUPPLIER_INVOICE':
                return this.eligibilitySupplierInvoice(pool, documentId);
            case 'INVOICE':
                return this.eligibilityCustomerInvoice(pool, documentId);
            case 'AR_PAYMENT':
                return this.eligibilityArPayment(pool, documentId);
            case 'RETURN_GRN':
                return this.eligibilityReturnGrn(pool, documentId);
            default:
                throw new Error(`Unsupported document type: ${documentType}`);
        }
    },

    async previewCorrection(
        pool: Pool,
        documentType: CorrectionDocumentType,
        documentId: string,
        correctionKind: CorrectionKind,
    ): Promise<CorrectionEligibilityResult> {
        const base = await this.getEligibility(pool, documentType, documentId);
        return this.applyCorrectionKindFilter(base, correctionKind);
    },

    applyCorrectionKindFilter(
        base: CorrectionEligibilityResult,
        correctionKind: CorrectionKind,
    ): CorrectionEligibilityResult {
        const blockers = [...base.blockers];
        const warnings = [...base.warnings];
        const suggestedActions = [...base.suggestedActions];

        const kindRoutes: Record<CorrectionKind, CorrectionRoute> = {
            REVERSE: 'BLOCKED',
            RETURN_GRN: 'RETURN_GRN',
            REVERSE_UNINVOICED_RECEIPT: 'REVERSE_UNINVOICED_RECEIPT',
            PRODUCT_SWAP: 'PRODUCT_SWAP',
            AP_RECLASS: 'AP_RECLASS',
            SUPPLIER_CN: 'SUPPLIER_CN',
            CUSTOMER_CN: 'CUSTOMER_CN',
        };

        const targetRoute = kindRoutes[correctionKind];

        if (correctionKind === 'REVERSE') {
            blockers.push('Full document reversal is not supported in v1 — use a specific correction kind.');
            return {
                ...base,
                correctionKind,
                allowed: false,
                route: 'BLOCKED',
                blockers,
                warnings,
                suggestedActions: [
                    ...suggestedActions,
                    'Use RETURN_GRN, PRODUCT_SWAP, SUPPLIER_CN, or AP_RECLASS as applicable.',
                ],
            };
        }

        if (base.route === 'BLOCKED' && base.blockers.length > 0) {
            return { ...base, correctionKind, allowed: false, route: 'BLOCKED', blockers, warnings, suggestedActions };
        }

        if (base.route !== 'NONE' && base.route !== targetRoute && base.route !== 'BLOCKED') {
            warnings.push(
                `Primary route for this document is ${base.route}; ${correctionKind} may require additional steps.`,
            );
        }

        const allowed = blockers.length === 0;
        return {
            ...base,
            correctionKind,
            allowed,
            route: allowed ? targetRoute : 'BLOCKED',
            blockers,
            warnings,
            suggestedActions,
        };
    },

    async eligibilityGoodsReceipt(pool: Pool, grnId: string): Promise<CorrectionEligibilityResult> {
        const header = await correctionEligibilityRepository.getGrnHeader(pool, grnId);
        if (!header) throw new Error(`Goods receipt ${grnId} not found`);

        const base = {
            documentType: 'GOODS_RECEIPT' as const,
            documentId: grnId,
            documentNumber: header.grNumber,
        };

        if (header.status === 'CANCELLED') {
            return result(base, {
                allowed: false,
                route: 'BLOCKED',
                blockers: ['Goods receipt is cancelled.'],
                suggestedActions: [],
            });
        }

        if (header.status === 'DRAFT') {
            return result(base, {
                allowed: false,
                route: 'BLOCKED',
                blockers: ['Goods receipt is still in DRAFT — finalize or cancel it; posted corrections apply only to COMPLETED receipts.'],
                suggestedActions: ['Finalize the goods receipt, or delete/cancel the draft.'],
            });
        }

        if (header.status !== 'COMPLETED') {
            return result(base, {
                allowed: false,
                route: 'BLOCKED',
                blockers: [`Goods receipt status "${header.status}" is not eligible for correction.`],
            });
        }

        const blockers: string[] = [];
        const warnings: string[] = [];
        const suggestedActions: string[] = [];

        const invoices = await correctionEligibilityRepository.getSupplierInvoicesForGrn(pool, grnId);
        const consumed = await correctionEligibilityRepository.getConsumedBatchesForGrn(pool, grnId);
        const returnGrns = await correctionEligibilityRepository.getReturnGrnsForGrn(pool, grnId);
        const returnableItems = await returnGrnRepository.getReturnableItems(pool, grnId);
        const hasReturnable = returnableItems.some((i) => Number(i.returnableQuantity) > 0);

        for (const inv of invoices) {
            if (inv.amountPaid > 0.01) {
                blockers.push(
                    `Supplier invoice ${inv.invoiceNumber} has payments (${inv.amountPaid.toFixed(2)} paid). Use supplier credit note / payment reversal — not GR reversal.`,
                );
            } else if (inv.outstandingBalance > 0) {
                warnings.push(`Open supplier invoice ${inv.invoiceNumber} (outstanding ${inv.outstandingBalance.toFixed(2)}).`);
            }
        }

        for (const batch of consumed) {
            warnings.push(
                `${batch.consumedQty} unit(s) of ${batch.productName} (batch ${batch.batchNumber ?? batch.batchId.slice(0, 8)}) already sold or consumed.`,
            );
        }

        const postedReturns = returnGrns.filter((r) => r.status === 'POSTED');
        if (postedReturns.length > 0) {
            warnings.push(
                `${postedReturns.length} posted return GRN(s) exist: ${postedReturns.map((r) => r.returnGrnNumber).join(', ')}.`,
            );
        }

        let route: CorrectionRoute = 'NONE';

        if (blockers.length > 0) {
            route = 'BLOCKED';
        } else if (consumed.length > 0 && !hasReturnable) {
            route = 'BLOCKED';
            blockers.push('All received quantity has been sold or consumed — cannot return remaining stock.');
            suggestedActions.push('Investigate sales/COGS; manual stock adjustment may be required outside GR reversal.');
        } else if (consumed.length > 0 && hasReturnable) {
            route = 'RETURN_GRN';
            suggestedActions.push('Create a Return GRN for returnable quantity only (partial return).');
            suggestedActions.push(
                'For wrong SKU: Return to Supplier on this GR, then create a new Goods Receipt for the correct product.',
            );
        } else if (hasReturnable) {
            route = 'RETURN_GRN';
            suggestedActions.push('Use Return GRN + supplier credit note via Supplier Adjustments.');
        } else if (invoices.some((i) => i.outstandingBalance > 0)) {
            route = 'SUPPLIER_CN';
            suggestedActions.push('Use Supplier Invoice Adjustment (price correction or return path).');
        } else {
            route = 'AP_RECLASS';
            suggestedActions.push('No open supplier invoice — supplier reassignment (AP reclass) may apply if liability was posted to wrong vendor.');
        }

        return result(base, {
            allowed: blockers.length === 0 && route !== 'BLOCKED',
            route,
            blockers,
            warnings,
            suggestedActions,
            context: {
                supplierId: header.supplierId,
                supplierName: header.supplierName,
                invoiceCount: invoices.length,
                consumedBatchCount: consumed.length,
                returnableLineCount: returnableItems.filter((i) => Number(i.returnableQuantity) > 0).length,
                returnGrnCount: returnGrns.length,
            },
        });
    },

    async eligibilitySupplierInvoice(pool: Pool, invoiceId: string): Promise<CorrectionEligibilityResult> {
        const header = await correctionEligibilityRepository.getSupplierInvoiceHeader(pool, invoiceId);
        if (!header) throw new Error(`Supplier invoice ${invoiceId} not found`);

        const base = {
            documentType: 'SUPPLIER_INVOICE' as const,
            documentId: invoiceId,
            documentNumber: header.invoiceNumber,
        };

        if (isCancelledStatus(header.status)) {
            return result(base, {
                allowed: false,
                route: 'BLOCKED',
                blockers: ['Supplier invoice is cancelled or voided.'],
            });
        }

        const blockers: string[] = [];
        const warnings: string[] = [];
        const suggestedActions: string[] = [];

        if (header.amountPaid > 0.01) {
            blockers.push(
                `Invoice has ${header.amountPaid.toFixed(2)} paid — adjust via supplier credit note after reversing payments, not direct reversal.`,
            );
        }

        const allocCount = await correctionEligibilityRepository.countSupplierPaymentAllocations(pool, invoiceId);
        if (allocCount > 0) {
            warnings.push(`${allocCount} supplier payment allocation(s) on this invoice.`);
        }

        let route: CorrectionRoute = 'SUPPLIER_CN';
        let returnableCount = 0;

        try {
            const ctx = await supplierAdjustmentService.getInvoiceContext(pool, invoiceId);
            returnableCount = ctx.returnableItems.length;
            if (ctx.suggestedIntent === 'RETURN' && header.amountPaid <= 0.01) {
                route = 'RETURN_GRN';
                suggestedActions.push('Use Supplier Adjustment with RETURN intent (Return GRN + credit note).');
            } else {
                suggestedActions.push('Use Supplier Adjustment with PRICE_CORRECTION intent (supplier credit note).');
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('fully paid')) {
                blockers.push(msg);
                route = 'BLOCKED';
            } else {
                warnings.push(msg);
                suggestedActions.push('Open supplier adjustment modal for this invoice.');
            }
        }

        if (blockers.length > 0) route = 'BLOCKED';

        return result(base, {
            allowed: blockers.length === 0,
            route,
            blockers,
            warnings,
            suggestedActions,
            context: { goodsReceiptId: header.goodsReceiptId, returnableCount },
        });
    },

    async eligibilityCustomerInvoice(pool: Pool, invoiceId: string): Promise<CorrectionEligibilityResult> {
        const header = await correctionEligibilityRepository.getCustomerInvoiceHeader(pool, invoiceId);
        if (!header) throw new Error(`Customer invoice ${invoiceId} not found`);

        const base = {
            documentType: 'INVOICE' as const,
            documentId: invoiceId,
            documentNumber: header.invoiceNumber,
        };

        if (isCancelledStatus(header.status)) {
            return result(base, {
                allowed: false,
                route: 'BLOCKED',
                blockers: ['Customer invoice is cancelled or voided.'],
            });
        }

        const blockers: string[] = [];
        const warnings: string[] = [];
        const suggestedActions = ['Use Customer Invoice Adjustment to issue a credit note.'];

        if (header.saleStatus && ['VOIDED', 'VOID', 'CANCELLED'].includes(header.saleStatus.toUpperCase())) {
            warnings.push(`Linked sale is ${header.saleStatus}.`);
        }

        if (header.amountPaid > 0.01 && header.outstandingBalance <= 0.01) {
            blockers.push('Invoice is fully paid — reverse allocations or refund before credit note.');
        } else if (header.amountPaid > 0.01) {
            warnings.push(`Partial payments (${header.amountPaid.toFixed(2)}) exist — credit note will adjust open balance.`);
        }

        const route: CorrectionRoute = blockers.length > 0 ? 'BLOCKED' : 'CUSTOMER_CN';

        return result(base, {
            allowed: blockers.length === 0,
            route,
            blockers,
            warnings,
            suggestedActions,
            context: { saleId: header.saleId, saleStatus: header.saleStatus },
        });
    },

    async eligibilityArPayment(pool: Pool, paymentId: string): Promise<CorrectionEligibilityResult> {
        const data = await getPaymentWithAllocations(pool, paymentId);
        if (!data) throw new Error(`AR payment ${paymentId} not found`);

        const paymentNumber = data.payment.paymentNumber ?? data.payment.id ?? paymentId;

        const base = {
            documentType: 'AR_PAYMENT' as const,
            documentId: paymentId,
            documentNumber: paymentNumber,
        };

        const allocations = data.allocations as Array<{ status?: string }>;
        const active = allocations.filter((a) => (a.status ?? 'ACTIVE') === 'ACTIVE');

        const blockers: string[] = [];
        const warnings: string[] = [];
        const suggestedActions: string[] = [];

        if (active.length === 0) {
            warnings.push('No active allocations — payment may be fully unallocated or already reversed.');
            suggestedActions.push('Verify customer open-item balance on smart statement.');
        } else {
            suggestedActions.push(
                `Reverse ${active.length} allocation(s) via POST /api/ar-payments/allocations/:id/reverse before voiding payment.`,
            );
            warnings.push(`${active.length} active allocation(s) must be reversed first.`);
        }

        return result(base, {
            allowed: true,
            route: active.length > 0 ? 'BLOCKED' : 'NONE',
            blockers,
            warnings,
            suggestedActions,
            context: { activeAllocationCount: active.length, totalAllocations: allocations.length },
        });
    },

    async eligibilityReturnGrn(pool: Pool, rgrnId: string): Promise<CorrectionEligibilityResult> {
        const rgrn = await returnGrnRepository.getById(pool, rgrnId);
        if (!rgrn) throw new Error(`Return GRN ${rgrnId} not found`);

        const base = {
            documentType: 'RETURN_GRN' as const,
            documentId: rgrnId,
            documentNumber: rgrn.returnGrnNumber,
        };

        const blockers: string[] = [];
        const warnings: string[] = [];
        const suggestedActions: string[] = [];

        if (rgrn.status === 'POSTED' && rgrn.hasCreditNote) {
            blockers.push('Posted return GRN already has a supplier credit note — reverse CN first.');
            suggestedActions.push('Cancel or reverse the linked supplier credit note before reversing this return.');
        } else if (rgrn.status === 'POSTED') {
            warnings.push('Posted return GRN — reversal requires compensating stock movement and GL reversal.');
            suggestedActions.push('Contact finance — use GL reversal on RETURN_GRN reference if policy allows.');
        } else {
            suggestedActions.push('Draft return GRN can be edited or deleted before posting.');
        }

        const route: CorrectionRoute =
            blockers.length > 0 ? 'BLOCKED' : rgrn.status === 'DRAFT' ? 'NONE' : 'SUPPLIER_CN';

        return result(base, {
            allowed: blockers.length === 0,
            route,
            blockers,
            warnings,
            suggestedActions,
            context: { grnId: rgrn.grnId, grNumber: rgrn.grNumber, status: rgrn.status },
        });
    },

    /**
     * Eligibility for one-click full receipt reverse (orchestrated Return GRN).
     * Blocks paid bills and consumed stock. GR status stays COMPLETED; counter-document + metadata.
     */
    async eligibilityReverseUninvoicedReceipt(pool: Pool | PoolClient, grnId: string): Promise<CorrectionEligibilityResult> {
        const header = await correctionEligibilityRepository.getGrnHeader(pool, grnId);
        if (!header) throw new Error(`Goods receipt ${grnId} not found`);

        const base = {
            documentType: 'GOODS_RECEIPT' as const,
            documentId: grnId,
            documentNumber: header.grNumber,
        };

        if (header.status === 'CANCELLED') {
            return result(base, {
                allowed: false,
                route: 'BLOCKED',
                blockers: ['Goods receipt is cancelled.'],
            });
        }

        if (header.status === 'DRAFT') {
            return result(base, {
                allowed: false,
                route: 'BLOCKED',
                blockers: ['Goods receipt is still in DRAFT — cancel the draft instead of reversing a posted receipt.'],
            });
        }

        if (!isGoodsReceiptPosted(header.status)) {
            return result(base, {
                allowed: false,
                route: 'BLOCKED',
                blockers: [`Goods receipt status "${header.status}" is not eligible for reversal (need COMPLETED).`],
            });
        }

        const blockers: string[] = [];
        const warnings: string[] = [];
        const suggestedActions: string[] = [];

        const reversalMeta = await correctionEligibilityRepository.getGrnReversalMetadata(pool, grnId);
        if (reversalMeta?.reversedByReturnGrnId) {
            blockers.push(
                `Receipt already reversed by ${reversalMeta.reversedByReturnGrnNumber ?? reversalMeta.reversedByReturnGrnId}.`,
            );
        }

        const invoices = await correctionEligibilityRepository.getSupplierInvoicesDirectlyLinkedToGrn(
            pool,
            grnId,
        );
        const billPlan = planSupplierBillsForGrFullReverse(invoices);
        blockers.push(...billPlan.blockers);
        warnings.push(...billPlan.warnings);
        if (billPlan.toCancel.length > 0) {
            suggestedActions.push(
                `Will auto-cancel ${billPlan.toCancel.length} supplier bill(s) and reverse AP/GL, then reverse stock.`,
            );
        }

        const returnGrns = await correctionEligibilityRepository.getReturnGrnsForGrn(pool, grnId);
        const postedReturns = returnGrns.filter((r) => r.status === 'POSTED');
        if (postedReturns.length > 0) {
            blockers.push(
                `${postedReturns.length} posted return GRN(s) already exist — complete remaining quantity via Return to Supplier.`,
            );
        }

        const returnableItems = await returnGrnRepository.getReturnableItems(pool, grnId);
        if (returnableItems.length === 0) {
            blockers.push('No receipt lines found.');
        }

        const consumedBatches = await correctionEligibilityRepository.getConsumedBatchesForGrn(
            pool,
            grnId,
        );
        for (const batch of consumedBatches) {
            blockers.push(
                `${batch.consumedQty} unit(s) of ${batch.productName} (batch ${batch.batchNumber ?? batch.batchId.slice(0, 8)}) already sold or consumed — cannot reverse this goods receipt.`,
            );
        }

        for (const item of returnableItems) {
            const returned = Number(item.returnedQuantity) || 0;
            const returnable = Number(item.returnableQuantity) || 0;
            const consumed = Number(item.consumedQuantity) || 0;
            const productName = item.productName ?? 'product';

            if (returned > 0) {
                blockers.push(`${productName}: partial return already recorded — use Return to Supplier for the remainder.`);
            }
            // Prefer batch-level message above; still block if line qty says consumed but batch query empty
            if (consumed > 0 && consumedBatches.length === 0) {
                blockers.push(
                    `${productName}: ${consumed} unit(s) sold or consumed — cannot reverse this goods receipt.`,
                );
            }
            if (returnable <= 0 && consumed <= 0 && consumedBatches.length === 0) {
                blockers.push(`${productName}: no returnable quantity on hand.`);
            }
            if (item.returnBlockReason && consumed <= 0 && consumedBatches.length === 0) {
                blockers.push(`${productName}: ${item.returnBlockReason}`);
            }
        }

        const route: CorrectionRoute =
            blockers.length > 0 ? 'BLOCKED' : 'REVERSE_UNINVOICED_RECEIPT';

        if (route === 'REVERSE_UNINVOICED_RECEIPT') {
            suggestedActions.push(
                'Full reverse: cancel unpaid linked bills (AP), post Return GRN (stock + GR/IR), mark receipt reversed, return PO to Draft. Not allowed if paid or stock consumed.',
            );
        }

        return result(base, {
            allowed: blockers.length === 0,
            route,
            blockers,
            warnings,
            suggestedActions,
            correctionKind: 'REVERSE_UNINVOICED_RECEIPT',
            context: {
                returnableLineCount: returnableItems.filter((i) => Number(i.returnableQuantity) > 0).length,
                invoiceCount: invoices.length,
                billsToAutoCancel: billPlan.toCancel.length,
                postedReturnCount: postedReturns.length,
                isReversed: Boolean(reversalMeta?.reversedByReturnGrnId),
            },
        });
    },
};
