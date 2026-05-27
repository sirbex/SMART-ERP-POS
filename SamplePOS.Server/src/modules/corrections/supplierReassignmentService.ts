/**
 * Phase F — post-GR supplier reassignment (SAP/Odoo smart wizard).
 * 1. Auto-reverse unpaid GR-linked supplier bills (reopens GR/IR on wrong vendor)
 * 2. Reclass open GR/IR (2150) from old supplier → correct supplier
 */

import type { Pool, PoolClient } from 'pg';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { AccountingCore } from '../../services/accountingCore.js';
import { AccountCodes } from '../../services/glEntryService.js';
import { checkAccountingPeriodOpen } from '../../utils/periodGuard.js';
import { getBusinessDate } from '../../utils/dateRange.js';
import { ValidationError } from '../../middleware/errorHandler.js';
import { correctionEligibilityService } from './correctionEligibilityService.js';
import { correctionEligibilityRepository } from './correctionEligibilityRepository.js';
import type { GrnSupplierInvoiceRow } from './correctionEligibilityRepository.js';
import { supplierReassignmentRepository } from './supplierReassignmentRepository.js';
import { recalculateOutstandingBalance as recalcSupplierBalance } from '../suppliers/supplierRepository.js';
import { cancelSupplierInvoiceForCorrection } from '../supplier-payments/supplierPaymentService.js';
import type {
    SupplierReassignmentBody,
    SupplierReassignmentExecuteBody,
} from '../../../../shared/zod/supplierReassignment.js';

export interface SupplierReassignmentInvoicePlan {
    invoiceId: string;
    invoiceNumber: string;
    totalAmount: number;
    amountPaid: number;
    isPostedToGl: boolean;
    action: 'REVERSE_AND_CANCEL' | 'UNALLOCATE_PAYMENTS_AND_CANCEL';
}

export interface SupplierReassignmentWizardStep {
    order: number;
    code:
        | 'UNALLOCATE_PAYMENTS'
        | 'REVERSE_INVOICES'
        | 'RECLASS_GRIR'
        | 'UPDATE_PURCHASE_ORDER'
        | 'COMPLETE';
    title: string;
    description: string;
}

export interface SupplierReassignmentPreview {
    grnId: string;
    grNumber: string;
    purchaseOrderId: string | null;
    fromSupplierId: string;
    fromSupplierName: string | null;
    toSupplierId: string;
    toSupplierName: string | null;
    reason: string;
    amount: number;
    accountScope: 'GRIR';
    eligibility: Awaited<ReturnType<typeof correctionEligibilityService.previewCorrection>>;
    journalLines: Array<{ accountCode: string; debit: number; credit: number; entityId: string }>;
    invoicesToReverse: SupplierReassignmentInvoicePlan[];
    wizardSteps: SupplierReassignmentWizardStep[];
    blockers: string[];
    warnings: string[];
}

export interface SupplierReassignmentResult {
    eventId: string;
    glTransactionId: string;
    amount: number;
    accountScope: 'GRIR';
    purchaseOrderId: string | null;
    poSupplierUpdated: boolean;
    toSupplierId: string;
    toSupplierName: string | null;
    reversedInvoices: Array<{
        invoiceId: string;
        invoiceNumber: string;
        glReversed: boolean;
        paymentsUnallocated?: number;
    }>;
    warnings: string[];
}

async function resolveSupplierNames(
    pool: Pool | PoolClient,
    fromId: string,
    toId: string,
): Promise<{ fromName: string | null; toName: string | null }> {
    const result = await pool.query(
        `SELECT "Id" AS id, "CompanyName" AS name FROM suppliers WHERE "Id" = ANY($1::uuid[])`,
        [[fromId, toId]],
    );
    const map = new Map(result.rows.map((r) => [r.id as string, r.name as string]));
    return { fromName: map.get(fromId) ?? null, toName: map.get(toId) ?? null };
}

function classifyInvoices(invoices: GrnSupplierInvoiceRow[]): {
    invoicesToReverse: SupplierReassignmentInvoicePlan[];
    blockers: string[];
    warnings: string[];
} {
    const blockers: string[] = [];
    const warnings: string[] = [];
    const invoicesToReverse: SupplierReassignmentInvoicePlan[] = [];

    for (const inv of invoices) {
        const docType = inv.documentType ?? '';
        if (docType === 'OPENING_BALANCE') {
            blockers.push(
                `Opening balance document ${inv.invoiceNumber} is linked — cancel it from Supplier Payments first.`,
            );
            continue;
        }
        if (docType === 'SUPPLIER_CREDIT_NOTE' || docType === 'SUPPLIER_DEBIT_NOTE') {
            blockers.push(
                `Credit/debit note ${inv.invoiceNumber} is linked — resolve it before supplier reassignment.`,
            );
            continue;
        }

        if (inv.outstandingBalance > 0.01 || inv.totalAmount > 0.01 || inv.amountPaid > 0.01) {
            const needsUnalloc = inv.amountPaid > 0.01;
            invoicesToReverse.push({
                invoiceId: inv.id,
                invoiceNumber: inv.invoiceNumber,
                totalAmount: inv.totalAmount,
                amountPaid: inv.amountPaid,
                isPostedToGl: inv.isPostedToGl,
                action: needsUnalloc ? 'UNALLOCATE_PAYMENTS_AND_CANCEL' : 'REVERSE_AND_CANCEL',
            });
            if (needsUnalloc) {
                warnings.push(
                    `Bill ${inv.invoiceNumber}: ${inv.amountPaid.toFixed(2)} payment allocation(s) will be removed (payments stay on ${inv.invoiceNumber} supplier as unallocated — re-apply after new bill).`,
                );
            }
            if (!inv.isPostedToGl) {
                warnings.push(
                    `Draft bill ${inv.invoiceNumber} will be cancelled (not posted to GL).`,
                );
            }
        }
    }

    return { invoicesToReverse, blockers, warnings };
}

function buildWizardSteps(
    invoicesToReverse: SupplierReassignmentInvoicePlan[],
    amount: number,
    fromName: string | null,
    toName: string | null,
    purchaseOrderId: string | null,
): SupplierReassignmentWizardStep[] {
    const steps: SupplierReassignmentWizardStep[] = [];

    const withPayments = invoicesToReverse.filter((i) => i.action === 'UNALLOCATE_PAYMENTS_AND_CANCEL');
    if (withPayments.length > 0) {
        const paidTotal = withPayments.reduce((s, i) => s + i.amountPaid, 0);
        steps.push({
            order: steps.length + 1,
            code: 'UNALLOCATE_PAYMENTS',
            title: 'Unapply payments from bill(s)',
            description:
                `Remove payment reconciliation (${paidTotal.toFixed(2)}) from ${withPayments.map((i) => i.invoiceNumber).join(', ')}. Cash stays on the supplier account as unallocated — Odoo/SAP reset before vendor bill reversal.`,
        });
    }

    if (invoicesToReverse.length > 0) {
        const labels = invoicesToReverse.map((i) => i.invoiceNumber).join(', ');
        steps.push({
            order: steps.length + 1,
            code: 'REVERSE_INVOICES',
            title: 'Reverse supplier bill(s)',
            description:
                `Cancel ${invoicesToReverse.length} bill(s) (${labels}) and reverse GL so GR/IR clearing reopens on the wrong vendor — same as SAP MIRO reversal before vendor correction.`,
        });
    }

    steps.push({
        order: steps.length + 1,
        code: 'RECLASS_GRIR',
        title: 'Reclass GR/IR clearing',
        description:
            amount > 0.01
                ? `Move ${amount.toFixed(2)} on account 2150 from ${fromName ?? 'old supplier'} to ${toName ?? 'new supplier'}. Inventory batches are unchanged.`
                : `No open GR/IR to move; bill reversal reopens clearing on the correct vendor.`,
    });

    if (purchaseOrderId) {
        steps.push({
            order: steps.length + 1,
            code: 'UPDATE_PURCHASE_ORDER',
            title: 'Update purchase order supplier',
            description:
                `Set PO vendor to ${toName ?? 'new supplier'} so this receipt, PO list, and new supplier bills show the correct vendor (inventory unchanged).`,
        });
    } else {
        steps.push({
            order: steps.length + 1,
            code: 'UPDATE_PURCHASE_ORDER',
            title: 'No linked purchase order',
            description:
                'This receipt has no PO — only GL supplier tags change. Link a PO or use manual billing with the correct vendor.',
        });
    }

    steps.push({
        order: steps.length + 1,
        code: 'COMPLETE',
        title: 'Ready to bill correct supplier',
        description:
            'After posting, create a new supplier bill against this receipt for the correct vendor (3-way match).',
    });

    return steps;
}

export const supplierReassignmentService = {

    async validateAndCompute(
        pool: Pool,
        input: SupplierReassignmentBody,
    ): Promise<{
        amount: number;
        blockers: string[];
        warnings: string[];
        grNumber: string;
        purchaseOrderId: string | null;
        invoicesToReverse: SupplierReassignmentInvoicePlan[];
    }> {
        const blockers: string[] = [];
        const warnings: string[] = [];

        if (input.fromSupplierId === input.toSupplierId) {
            blockers.push('From and to supplier must be different.');
        }

        const header = await correctionEligibilityRepository.getGrnHeader(pool, input.grnId);
        if (!header) throw new ValidationError('Goods receipt not found');
        if (header.status !== 'COMPLETED') {
            blockers.push('Supplier reassignment requires a COMPLETED goods receipt.');
        }

        if (header.supplierId && header.supplierId !== input.fromSupplierId) {
            blockers.push(
                `Goods receipt supplier (${header.supplierName ?? header.supplierId}) does not match fromSupplierId.`,
            );
        }

        const invoices = await correctionEligibilityRepository.getSupplierInvoicesForGrn(pool, input.grnId);
        const invoicePlan = classifyInvoices(invoices);
        blockers.push(...invoicePlan.blockers);
        warnings.push(...invoicePlan.warnings);

        const grTotal = await supplierReassignmentRepository.getGrTotalValue(pool, input.grnId);
        const openGrir = await supplierReassignmentRepository.getOpenGrirForGrn(
            pool,
            input.grnId,
            input.fromSupplierId,
        );

        let amount = Math.min(grTotal, openGrir > 0 ? openGrir : grTotal);
        if (openGrir > 0 && openGrir < grTotal - 0.01) {
            warnings.push(
                `Open GR/IR (${openGrir.toFixed(2)}) is less than GR value (${grTotal.toFixed(2)}) — partial clearing may exist.`,
            );
            amount = openGrir;
        } else {
            amount = grTotal;
        }

        if (amount <= 0.01 && invoicePlan.invoicesToReverse.length === 0) {
            blockers.push('No open GR/IR liability to reassign for this goods receipt.');
        }

        const eligibility = await correctionEligibilityService.previewCorrection(
            pool,
            'GOODS_RECEIPT',
            input.grnId,
            'AP_RECLASS',
        );
        const paidHandled = invoicePlan.invoicesToReverse.some(
            (i) => i.action === 'UNALLOCATE_PAYMENTS_AND_CANCEL',
        );
        if (!eligibility.allowed) {
            for (const b of eligibility.blockers) {
                if (paidHandled && b.includes('has payments')) continue;
                blockers.push(b);
            }
        }
        warnings.push(...eligibility.warnings);

        return {
            amount,
            blockers,
            warnings,
            grNumber: header.grNumber,
            purchaseOrderId: header.purchaseOrderId,
            invoicesToReverse: invoicePlan.invoicesToReverse,
        };
    },

    async preview(pool: Pool, input: SupplierReassignmentBody): Promise<SupplierReassignmentPreview> {
        const computed = await this.validateAndCompute(pool, input);
        const names = await resolveSupplierNames(pool, input.fromSupplierId, input.toSupplierId);

        const eligibility = await correctionEligibilityService.previewCorrection(
            pool,
            'GOODS_RECEIPT',
            input.grnId,
            'AP_RECLASS',
        );

        const journalLines = computed.amount > 0
            ? [
                {
                    accountCode: AccountCodes.GRIR_CLEARING,
                    debit: computed.amount,
                    credit: 0,
                    entityId: input.fromSupplierId,
                },
                {
                    accountCode: AccountCodes.GRIR_CLEARING,
                    debit: 0,
                    credit: computed.amount,
                    entityId: input.toSupplierId,
                },
            ]
            : [];

        const wizardSteps = buildWizardSteps(
            computed.invoicesToReverse,
            computed.amount,
            names.fromName,
            names.toName,
            computed.purchaseOrderId,
        );

        if (computed.invoicesToReverse.length > 0) {
            computed.warnings.push(
                'Unpaid supplier bill(s) will be reversed automatically when you confirm (Odoo: cancel vendor bill + reopen GR/IR).',
            );
        }

        return {
            grnId: input.grnId,
            grNumber: computed.grNumber,
            purchaseOrderId: computed.purchaseOrderId,
            fromSupplierId: input.fromSupplierId,
            fromSupplierName: names.fromName,
            toSupplierId: input.toSupplierId,
            toSupplierName: names.toName,
            reason: input.reason,
            amount: computed.amount,
            accountScope: 'GRIR',
            eligibility,
            journalLines,
            invoicesToReverse: computed.invoicesToReverse,
            wizardSteps,
            blockers: computed.blockers,
            warnings: computed.warnings,
        };
    },

    async execute(
        pool: Pool,
        input: SupplierReassignmentExecuteBody,
        userId: string,
    ): Promise<SupplierReassignmentResult> {
        const preview = await this.preview(pool, input);
        if (preview.blockers.length > 0) {
            throw new ValidationError(preview.blockers.join(' '));
        }

        const autoReverse = input.autoReverseInvoices !== false;
        if (!autoReverse && preview.invoicesToReverse.length > 0) {
            throw new ValidationError(
                'Open supplier bill(s) must be reversed before reassignment. Enable auto-reverse or cancel them manually.',
            );
        }

        if (preview.amount <= 0 && preview.invoicesToReverse.length === 0) {
            throw new ValidationError('Nothing to reassign for this goods receipt.');
        }

        const entryDate = getBusinessDate();
        const warnings = [...preview.warnings];
        const reversedInvoices: SupplierReassignmentResult['reversedInvoices'] = [];
        const names = await resolveSupplierNames(pool, input.fromSupplierId, input.toSupplierId);

        return UnitOfWork.run(pool, async (client) => {
            await checkAccountingPeriodOpen(client, entryDate);

            if (autoReverse) {
                for (const inv of preview.invoicesToReverse) {
                    const cancelled = await cancelSupplierInvoiceForCorrection(
                        pool,
                        inv.invoiceId,
                        userId,
                        input.reason,
                        {
                            client,
                            grnId: input.grnId,
                            unallocatePaymentsFirst:
                                inv.action === 'UNALLOCATE_PAYMENTS_AND_CANCEL',
                        },
                    );
                    reversedInvoices.push({
                        ...cancelled,
                        paymentsUnallocated:
                            inv.action === 'UNALLOCATE_PAYMENTS_AND_CANCEL'
                                ? inv.amountPaid
                                : 0,
                    });
                }
            }

            let glTransactionId = '';
            let eventId = '';
            let poSupplierUpdated = false;

            if (preview.amount > 0.01) {
                const amount = preview.amount;

                const journal = await AccountingCore.createJournalEntry(
                    {
                        entryDate,
                        description: `Supplier reassignment: ${preview.grNumber} ${names.fromName ?? ''} → ${names.toName ?? ''}`,
                        referenceType: 'CORRECTION',
                        referenceId: input.grnId,
                        referenceNumber: preview.grNumber,
                        lines: [
                            {
                                accountCode: AccountCodes.GRIR_CLEARING,
                                description: `GR/IR reclass out: ${preview.grNumber}`,
                                debitAmount: amount,
                                creditAmount: 0,
                                entityType: 'supplier',
                                entityId: input.fromSupplierId,
                            },
                            {
                                accountCode: AccountCodes.GRIR_CLEARING,
                                description: `GR/IR reclass in: ${preview.grNumber}`,
                                debitAmount: 0,
                                creditAmount: amount,
                                entityType: 'supplier',
                                entityId: input.toSupplierId,
                            },
                        ],
                        userId,
                        idempotencyKey: `SUPPLIER_REASSIGN-${input.grnId}-${input.toSupplierId}`,
                        source: 'SYSTEM_CORRECTION',
                    },
                    pool,
                    client,
                );

                glTransactionId = journal.transactionId;

                eventId = await supplierReassignmentRepository.insertEvent(client, {
                    grnId: input.grnId,
                    fromSupplierId: input.fromSupplierId,
                    toSupplierId: input.toSupplierId,
                    amount,
                    accountScope: 'GRIR',
                    glTransactionId: journal.transactionId,
                    reason: input.reason,
                    createdBy: userId,
                });

                await recalcSupplierBalance(client, input.fromSupplierId);
                await recalcSupplierBalance(client, input.toSupplierId);
            }

            if (preview.purchaseOrderId) {
                poSupplierUpdated = await supplierReassignmentRepository.updatePurchaseOrderSupplier(
                    client,
                    preview.purchaseOrderId,
                    input.toSupplierId,
                );
                if (!poSupplierUpdated) {
                    throw new ValidationError(
                        `Purchase order ${preview.purchaseOrderId} could not be updated to the new supplier.`,
                    );
                }
            } else {
                warnings.push(
                    'No purchase order on this receipt — GR/IR and bills use supplier tags; PO screens will not show a vendor change.',
                );
            }

            return {
                eventId,
                glTransactionId,
                amount: preview.amount,
                accountScope: 'GRIR',
                purchaseOrderId: preview.purchaseOrderId,
                poSupplierUpdated,
                toSupplierId: input.toSupplierId,
                toSupplierName: names.toName,
                reversedInvoices,
                warnings,
            };
        });
    },
};
