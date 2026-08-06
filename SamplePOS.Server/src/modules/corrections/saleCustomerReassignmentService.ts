/**
 * Sale customer reassignment — wrong-customer correction (manager/admin).
 * Mirrors supplier reassignment wizard: preview → confirm → transactional execute.
 *
 * Accounting integrity:
 *  - Same-account AR entity reclass on 1200 only when GL has open net for source customer
 *    (never invent a JE from invoice residual alone — that would fabricate entity AR).
 *  - Trial balance unchanged (DR 1200 / CR 1200 equal).
 *  - Invoice/open-item AR moved via customer_id change + balance sync.
 *
 * Tax integrity (document tax e2e parity):
 *  - Posted sale tax snapshots are immutable: tax_amount / line determination not recomputed.
 *  - Different customer VAT/exempt profiles only surface as warnings (not re-tax).
 *
 * Execute:
 *  1. Validate sale status + from customer match
 *  2. Period open
 *  3. Update sales.customer_id
 *  4. Move linked non-cancelled invoices to new customer
 *  5. Reclass open AR (1200) entity tags when GL net > 0 for from-customer
 *  6. Audit event + sync both customer AR balances
 */

import type { Pool } from 'pg';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { AccountingCore } from '../../services/accountingCore.js';
import { AccountCodes } from '../../services/glEntryService.js';
import { checkAccountingPeriodOpen } from '../../utils/periodGuard.js';
import { getBusinessDate } from '../../utils/dateRange.js';
import { ValidationError } from '../../middleware/errorHandler.js';
import { syncCustomerBalanceFromInvoices } from '../../utils/customerBalanceSync.js';
import {
  saleCustomerReassignmentRepository,
  type LinkedInvoiceRow,
} from './saleCustomerReassignmentRepository.js';
import type { SaleCustomerReassignmentBody } from '../../../../shared/zod/saleCustomerReassignment.js';

export interface SaleCustomerReassignmentWizardStep {
  order: number;
  code: 'VALIDATE' | 'UPDATE_SALE' | 'MOVE_INVOICES' | 'RECLASS_AR' | 'COMPLETE';
  title: string;
  description: string;
}

export interface SaleCustomerReassignmentPreview {
  saleId: string;
  saleNumber: string;
  fromCustomerId: string | null;
  fromCustomerName: string | null;
  toCustomerId: string;
  toCustomerName: string | null;
  reason: string;
  saleTotal: number;
  /** Entity-tagged AR (1200) net to reclass — GL SSOT only */
  openArAmount: number;
  /** Sum of open invoice residual moved with customer_id (open-item subledger) */
  invoiceOutstandingAmount: number;
  accountScope: 'AR' | 'NONE';
  invoicesToMove: Array<{
    invoiceId: string;
    invoiceNumber: string;
    outstandingBalance: number;
    totalAmount: number;
    amountPaid: number;
  }>;
  journalLines: Array<{ accountCode: string; debit: number; credit: number; entityId: string }>;
  wizardSteps: SaleCustomerReassignmentWizardStep[];
  blockers: string[];
  warnings: string[];
  /** Always true: reassignment never mutates sale/invoice tax math */
  documentTaxImmutable: true;
}

export interface SaleCustomerReassignmentResult {
  eventId: string;
  glTransactionId: string;
  saleId: string;
  saleNumber: string;
  fromCustomerId: string | null;
  toCustomerId: string;
  toCustomerName: string | null;
  invoicesMoved: number;
  openArReclassed: number;
  warnings: string[];
}

const ALLOWED_STATUSES = new Set(['COMPLETED', 'PARTIALLY_RETURNED']);

function normId(id: string | null | undefined): string | null {
  if (id == null || id === '' || id === 'null') return null;
  return id;
}

function sameCustomer(a: string | null, b: string | null): boolean {
  return normId(a) === normId(b);
}

function buildWizardSteps(
  invoices: LinkedInvoiceRow[],
  glOpenAr: number,
  fromName: string | null,
  toName: string | null,
): SaleCustomerReassignmentWizardStep[] {
  const steps: SaleCustomerReassignmentWizardStep[] = [
    {
      order: 1,
      code: 'VALIDATE',
      title: 'Validate sale',
      description: 'Confirm sale is posted and source customer matches the document.',
    },
    {
      order: 2,
      code: 'UPDATE_SALE',
      title: 'Update sale customer',
      description: `Set sale customer to ${toName ?? 'new customer'} (was ${fromName ?? 'Walk-in'}).`,
    },
  ];
  if (invoices.length > 0) {
    steps.push({
      order: steps.length + 1,
      code: 'MOVE_INVOICES',
      title: 'Move linked invoice(s)',
      description: `Re-link ${invoices.length} invoice(s) to ${toName ?? 'new customer'} (payments stay on the invoice).`,
    });
  }
  if (glOpenAr > 0.01) {
    steps.push({
      order: steps.length + 1,
      code: 'RECLASS_AR',
      title: 'Reclass open AR',
      description: `Move open AR ${glOpenAr.toFixed(2)} on account 1200 from ${fromName ?? 'old customer'} to ${toName ?? 'new customer'} (balanced same-account reclass).`,
    });
  }
  steps.push({
    order: steps.length + 1,
    code: 'COMPLETE',
    title: 'Complete',
    description: 'Write audit event and resync customer balances. Document tax snapshot stays as posted.',
  });
  return steps;
}

function taxProfileDiffWarning(
  from: {
    vatRegistered: boolean;
    taxExempt: boolean;
    taxProfile: string;
  } | null,
  to: {
    vatRegistered: boolean;
    taxExempt: boolean;
    taxProfile: string;
  } | null,
): string | null {
  if (!from || !to) return null;
  const diffs: string[] = [];
  if (from.taxExempt !== to.taxExempt) {
    diffs.push(`tax_exempt ${from.taxExempt} → ${to.taxExempt}`);
  }
  if (from.vatRegistered !== to.vatRegistered) {
    diffs.push(`vat_registered ${from.vatRegistered} → ${to.vatRegistered}`);
  }
  if ((from.taxProfile || 'STANDARD') !== (to.taxProfile || 'STANDARD')) {
    diffs.push(`tax_profile ${from.taxProfile} → ${to.taxProfile}`);
  }
  if (diffs.length === 0) return null;
  return (
    `Customer tax profiles differ (${diffs.join('; ')}). ` +
    `Posted document tax is immutable — reassignment does not recompute VAT/lines.`
  );
}

export const saleCustomerReassignmentService = {
  async preview(pool: Pool, input: SaleCustomerReassignmentBody): Promise<SaleCustomerReassignmentPreview> {
    const sale = await saleCustomerReassignmentRepository.getSale(pool, input.saleId);
    if (!sale) {
      throw new ValidationError('Sale not found');
    }

    const blockers: string[] = [];
    const warnings: string[] = [];
    const fromCustomerId = normId(input.fromCustomerId);
    const toCustomerId = input.toCustomerId;

    if (!ALLOWED_STATUSES.has(String(sale.status || '').toUpperCase())) {
      blockers.push(
        `Cannot reassign customer on sale status ${sale.status}. Only COMPLETED or PARTIALLY_RETURNED sales can be corrected.`,
      );
    }

    if (!sameCustomer(sale.customerId, fromCustomerId)) {
      blockers.push(
        `From customer does not match sale. Sale is linked to ${sale.customerName ?? 'Walk-in'} (${sale.customerId ?? 'none'}).`,
      );
    }

    if (sameCustomer(fromCustomerId, toCustomerId)) {
      blockers.push('Target customer must be different from the current customer.');
    }

    const toCustomer = await saleCustomerReassignmentRepository.getCustomerActive(pool, toCustomerId);
    if (!toCustomer) {
      blockers.push('Target customer not found.');
    } else if (!toCustomer.isActive) {
      blockers.push('Target customer is inactive.');
    }

    let fromCustomerForWarn: Awaited<
      ReturnType<typeof saleCustomerReassignmentRepository.getCustomerActive>
    > = null;
    if (fromCustomerId) {
      fromCustomerForWarn = await saleCustomerReassignmentRepository.getCustomerActive(
        pool,
        fromCustomerId,
      );
      if (!fromCustomerForWarn) {
        warnings.push('Source customer master record not found (will still re-link the sale).');
      }
    }

    const invoices = await saleCustomerReassignmentRepository.getLinkedInvoices(pool, input.saleId);
    const invoiceOutstanding = invoices.reduce((s, i) => s + Number(i.outstandingBalance || 0), 0);

    // AR reclass SSOT = entity-tagged 1200 net only. Never fabricate a JE from invoice residual.
    const glOpenAr = fromCustomerId
      ? await saleCustomerReassignmentRepository.getOpenArForSale(pool, input.saleId, fromCustomerId)
      : 0;

    warnings.push(
      'Document tax is immutable: sale/invoice tax_amount and line determinations stay as posted (no re-tax).',
    );
    warnings.push(
      'Original SALE/INVOICE revenue, VAT, and cash ledger entity tags are not rewritten; only open AR entity reclass applies when present.',
    );

    if (fromCustomerId) {
      const taxWarn = taxProfileDiffWarning(fromCustomerForWarn, toCustomer);
      if (taxWarn) warnings.push(taxWarn);
    }

    if (invoiceOutstanding > 0.01 && glOpenAr <= 0.01) {
      warnings.push(
        fromCustomerId
          ? 'Open invoice residual will move with customer_id + AR open-item balance sync; no 1200 GL reclass (no entity-tagged AR found for source customer on this sale).'
          : 'Walk-in / cash sale: invoices move when present; no 1200 entity reclass without a prior customer.',
      );
    }
    if (Math.abs(invoiceOutstanding - glOpenAr) > 0.02 && glOpenAr > 0.01 && invoiceOutstanding > 0.01) {
      warnings.push(
        `Invoice open residual (${invoiceOutstanding.toFixed(2)}) differs from GL AR net (${glOpenAr.toFixed(2)}); reclass uses GL amount only.`,
      );
    }

    if (invoices.some((i) => Number(i.amountPaid) > 0.01 && Number(i.outstandingBalance) > 0.01)) {
      warnings.push(
        'Some invoices are partially paid. Payments stay on the invoice under the new customer.',
      );
    }
    if (invoices.some((i) => Number(i.amountPaid) > 0.01 && Number(i.outstandingBalance) <= 0.01)) {
      warnings.push(
        'Fully paid invoice(s) will be moved for history; cash/AR settlement is unchanged.',
      );
    }

    const journalLines =
      glOpenAr > 0.01 && fromCustomerId
        ? [
            {
              accountCode: AccountCodes.ACCOUNTS_RECEIVABLE,
              debit: 0,
              credit: glOpenAr,
              entityId: fromCustomerId,
            },
            {
              accountCode: AccountCodes.ACCOUNTS_RECEIVABLE,
              debit: glOpenAr,
              credit: 0,
              entityId: toCustomerId,
            },
          ]
        : [];

    // Integrity: same-account reclass must balance (guard against future edits)
    if (journalLines.length > 0) {
      const debits = journalLines.reduce((s, l) => s + Number(l.debit || 0), 0);
      const credits = journalLines.reduce((s, l) => s + Number(l.credit || 0), 0);
      if (Math.abs(debits - credits) > 0.001) {
        blockers.push(
          `Internal integrity error: AR reclass journal unbalanced (DR ${debits} vs CR ${credits}).`,
        );
      }
      if (!journalLines.every((l) => l.accountCode === AccountCodes.ACCOUNTS_RECEIVABLE)) {
        blockers.push('Internal integrity error: AR reclass must stay on account 1200 only.');
      }
    }

    const fromName = sale.customerName ?? (fromCustomerId ? null : 'Walk-in');
    const wizardSteps = buildWizardSteps(invoices, glOpenAr, fromName, toCustomer?.name ?? null);

    return {
      saleId: sale.id,
      saleNumber: sale.saleNumber,
      fromCustomerId,
      fromCustomerName: fromName,
      toCustomerId,
      toCustomerName: toCustomer?.name ?? null,
      reason: input.reason,
      saleTotal: Number(sale.totalAmount || 0),
      openArAmount: glOpenAr,
      invoiceOutstandingAmount: invoiceOutstanding,
      accountScope: glOpenAr > 0.01 && fromCustomerId ? 'AR' : 'NONE',
      invoicesToMove: invoices.map((i) => ({
        invoiceId: i.id,
        invoiceNumber: i.invoiceNumber,
        outstandingBalance: Number(i.outstandingBalance || 0),
        totalAmount: Number(i.totalAmount || 0),
        amountPaid: Number(i.amountPaid || 0),
      })),
      journalLines,
      wizardSteps,
      blockers,
      warnings,
      documentTaxImmutable: true,
    };
  },

  async execute(
    pool: Pool,
    input: SaleCustomerReassignmentBody,
    userId: string,
  ): Promise<SaleCustomerReassignmentResult> {
    const preview = await this.preview(pool, input);
    if (preview.blockers.length > 0) {
      throw new ValidationError(preview.blockers.join(' '));
    }

    const entryDate = getBusinessDate();
    const fromCustomerId = normId(input.fromCustomerId);

    return UnitOfWork.run(pool, async (client) => {
      await checkAccountingPeriodOpen(client, entryDate);

      // Re-check under lock
      const locked = await saleCustomerReassignmentRepository.getSale(client, input.saleId);
      if (!locked || !sameCustomer(locked.customerId, fromCustomerId)) {
        throw new ValidationError('Sale customer changed since preview. Reload and try again.');
      }

      const updated = await saleCustomerReassignmentRepository.updateSaleCustomer(
        client,
        input.saleId,
        input.toCustomerId,
      );
      if (!updated) {
        throw new ValidationError('Could not update sale customer.');
      }

      const invoicesMoved = await saleCustomerReassignmentRepository.updateInvoiceCustomers(
        client,
        input.saleId,
        input.toCustomerId,
        preview.toCustomerName ?? 'Customer',
      );

      let glTransactionId = '';
      const reclassAmount =
        preview.openArAmount > 0.01 && fromCustomerId ? preview.openArAmount : 0;

      if (reclassAmount > 0.01) {
        if (!fromCustomerId) {
          throw new ValidationError(
            'Cannot reclass open AR without a source customer entity.',
          );
        }
        const journal = await AccountingCore.createJournalEntry(
          {
            entryDate,
            description: `Sale customer reassignment: ${preview.saleNumber} ${preview.fromCustomerName ?? 'Walk-in'} → ${preview.toCustomerName ?? ''}`,
            referenceType: 'CORRECTION',
            referenceId: input.saleId,
            referenceNumber: preview.saleNumber,
            lines: [
              {
                accountCode: AccountCodes.ACCOUNTS_RECEIVABLE,
                description: `AR reclass out: ${preview.saleNumber}`,
                debitAmount: 0,
                creditAmount: reclassAmount,
                entityType: 'customer',
                entityId: fromCustomerId,
              },
              {
                accountCode: AccountCodes.ACCOUNTS_RECEIVABLE,
                description: `AR reclass in: ${preview.saleNumber}`,
                debitAmount: reclassAmount,
                creditAmount: 0,
                entityType: 'customer',
                entityId: input.toCustomerId,
              },
            ],
            userId,
            idempotencyKey: `SALE_CUSTOMER_REASSIGN-${input.saleId}-${input.toCustomerId}`,
            source: 'SYSTEM_CORRECTION',
          },
          pool,
          client,
        );
        glTransactionId = journal.transactionId;
      }

      const eventId = await saleCustomerReassignmentRepository.insertEvent(client, {
        saleId: input.saleId,
        fromCustomerId,
        toCustomerId: input.toCustomerId,
        amount: reclassAmount,
        accountScope: reclassAmount > 0.01 ? 'AR' : 'NONE',
        glTransactionId: glTransactionId || null,
        reason: input.reason,
        createdBy: userId,
      });

      if (fromCustomerId) {
        await syncCustomerBalanceFromInvoices(client, fromCustomerId, 'SALE_CUSTOMER_REASSIGN_FROM');
      }
      await syncCustomerBalanceFromInvoices(client, input.toCustomerId, 'SALE_CUSTOMER_REASSIGN_TO');

      return {
        eventId,
        glTransactionId,
        saleId: input.saleId,
        saleNumber: preview.saleNumber,
        fromCustomerId,
        toCustomerId: input.toCustomerId,
        toCustomerName: preview.toCustomerName,
        invoicesMoved,
        openArReclassed: reclassAmount,
        warnings: preview.warnings,
      };
    });
  },
};
