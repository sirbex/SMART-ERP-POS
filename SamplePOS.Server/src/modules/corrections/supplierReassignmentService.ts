/**
 * Phase F — post-GR supplier reassignment (AP / GR-IR reclass only; no batch mutation).
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
import { supplierReassignmentRepository } from './supplierReassignmentRepository.js';
import { recalculateOutstandingBalance as recalcSupplierBalance } from '../suppliers/supplierRepository.js';
import type { SupplierReassignmentBody } from '../../../../shared/zod/supplierReassignment.js';

export interface SupplierReassignmentPreview {
    grnId: string;
    grNumber: string;
    fromSupplierId: string;
    fromSupplierName: string | null;
    toSupplierId: string;
    toSupplierName: string | null;
    reason: string;
    amount: number;
    accountScope: 'GRIR';
    eligibility: Awaited<ReturnType<typeof correctionEligibilityService.previewCorrection>>;
    journalLines: Array<{ accountCode: string; debit: number; credit: number; entityId: string }>;
    blockers: string[];
    warnings: string[];
}

export interface SupplierReassignmentResult {
    eventId: string;
    glTransactionId: string;
    amount: number;
    accountScope: 'GRIR';
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

export const supplierReassignmentService = {

    async validateAndCompute(
        pool: Pool,
        input: SupplierReassignmentBody,
    ): Promise<{ amount: number; blockers: string[]; warnings: string[]; grNumber: string }> {
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
        for (const inv of invoices) {
            if (inv.amountPaid > 0.01) {
                blockers.push(
                    `Supplier invoice ${inv.invoiceNumber} has payments — use supplier credit note workflow.`,
                );
            } else if (inv.outstandingBalance > 0.01) {
                blockers.push(
                    `Open supplier invoice ${inv.invoiceNumber} exists — cancel or reverse it before reassignment.`,
                );
            }
        }

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

        if (amount <= 0.01) {
            blockers.push('No open GR/IR liability to reassign for this goods receipt.');
        }

        const eligibility = await correctionEligibilityService.previewCorrection(
            pool,
            'GOODS_RECEIPT',
            input.grnId,
            'AP_RECLASS',
        );
        if (!eligibility.allowed) {
            blockers.push(...eligibility.blockers);
        }
        warnings.push(...eligibility.warnings);

        return { amount, blockers, warnings, grNumber: header.grNumber };
    },

    async preview(pool: Pool, input: SupplierReassignmentBody): Promise<SupplierReassignmentPreview> {
        const { amount, blockers, warnings, grNumber } = await this.validateAndCompute(pool, input);
        const names = await resolveSupplierNames(pool, input.fromSupplierId, input.toSupplierId);

        const eligibility = await correctionEligibilityService.previewCorrection(
            pool,
            'GOODS_RECEIPT',
            input.grnId,
            'AP_RECLASS',
        );

        const journalLines = amount > 0
            ? [
                {
                    accountCode: AccountCodes.GRIR_CLEARING,
                    debit: amount,
                    credit: 0,
                    entityId: input.fromSupplierId,
                },
                {
                    accountCode: AccountCodes.GRIR_CLEARING,
                    debit: 0,
                    credit: amount,
                    entityId: input.toSupplierId,
                },
            ]
            : [];

        return {
            grnId: input.grnId,
            grNumber,
            fromSupplierId: input.fromSupplierId,
            fromSupplierName: names.fromName,
            toSupplierId: input.toSupplierId,
            toSupplierName: names.toName,
            reason: input.reason,
            amount,
            accountScope: 'GRIR',
            eligibility,
            journalLines,
            blockers,
            warnings,
        };
    },

    async execute(
        pool: Pool,
        input: SupplierReassignmentBody,
        userId: string,
    ): Promise<SupplierReassignmentResult> {
        const preview = await this.preview(pool, input);
        if (preview.blockers.length > 0) {
            throw new ValidationError(preview.blockers.join(' '));
        }
        if (preview.amount <= 0) {
            throw new ValidationError('Reassignment amount must be positive.');
        }

        const entryDate = getBusinessDate();
        const warnings = [...preview.warnings];

        return UnitOfWork.run(pool, async (client) => {
            await checkAccountingPeriodOpen(client, entryDate);

            const names = await resolveSupplierNames(client, input.fromSupplierId, input.toSupplierId);
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

            const eventId = await supplierReassignmentRepository.insertEvent(client, {
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

            return {
                eventId,
                glTransactionId: journal.transactionId,
                amount,
                accountScope: 'GRIR',
                warnings,
            };
        });
    },
};
