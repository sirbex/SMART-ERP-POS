/**
 * Sale tax restatement — apply omitted (or under-posted) VAT to a posted sale
 * without voiding.
 *
 * SSOT:
 *  - DocumentTaxService.computeForLines (product bridge for UUID products —
 *    never frozen sale_items.is_taxable / tax_rate)
 *  - Integrity asserts from documentTaxIntegrity (fail loud, no soft continue)
 *
 * Policy: tax increases only. Decreases → credit note.
 */

import type { Pool } from 'pg';
import { Decimal } from '../../utils/money.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { AccountingCore } from '../../services/accountingCore.js';
import { AccountCodes } from '../../services/glEntryService.js';
import { customerArLine, requireCustomerIdForAr } from '../accounting-governance/arPostingHelpers.js';
import { DocumentTaxService } from '../../services/documentTaxService.js';
import {
  assertLineTaxEqualsHeader,
  assertPostedTaxTriplet,
  assertTaxRestatementDeltaPolicy,
  isUuidProductId,
  money2,
} from '../../services/documentTaxIntegrity.js';
import { checkAccountingPeriodOpen } from '../../utils/periodGuard.js';
import { getBusinessDate } from '../../utils/dateRange.js';
import { BusinessError, ValidationError } from '../../middleware/errorHandler.js';
import { syncCustomerBalanceFromInvoices } from '../../utils/customerBalanceSync.js';
import {
  saleTaxRestatementRepository,
  type TaxRestatementSaleItemRow,
} from './saleTaxRestatementRepository.js';
import type { SaleTaxRestatementBody } from '../../../../shared/zod/saleTaxRestatement.js';

export interface SaleTaxRestatementLinePreview {
  saleItemId: string;
  productId: string | null;
  productName: string | null;
  postedTax: number;
  newTax: number;
  taxRate: number;
  determination: string;
  isTaxable: boolean;
}

export interface SaleTaxRestatementWizardStep {
  order: number;
  code: 'VALIDATE' | 'RECOMPUTE' | 'UPDATE_LINES' | 'UPDATE_INVOICES' | 'POST_GL' | 'COMPLETE';
  title: string;
  description: string;
}

export interface SaleTaxRestatementPreview {
  saleId: string;
  saleNumber: string;
  customerId: string | null;
  customerName: string | null;
  reason: string;
  taxInclusive: boolean;
  customerExempt: boolean;
  postedTax: number;
  newTax: number;
  taxDelta: number;
  postedTotal: number;
  newTotal: number;
  totalDelta: number;
  lines: SaleTaxRestatementLinePreview[];
  invoices: Array<{
    invoiceId: string;
    invoiceNumber: string;
    postedTax: number;
    newTax: number;
    postedTotal: number;
    newTotal: number;
    newAmountDue: number;
  }>;
  journalLines: Array<{ accountCode: string; debit: number; credit: number; entityId?: string }>;
  wizardSteps: SaleTaxRestatementWizardStep[];
  blockers: string[];
  warnings: string[];
}

export interface SaleTaxRestatementResult {
  eventId: string;
  glTransactionId: string;
  saleId: string;
  saleNumber: string;
  postedTax: number;
  newTax: number;
  taxDelta: number;
  totalDelta: number;
  invoicesUpdated: number;
  warnings: string[];
}

const ALLOWED_STATUSES = new Set(['COMPLETED', 'PARTIALLY_RETURNED']);

function invoiceStatusAfterDue(amountDue: number, amountPaid: number, totalAmount: number): string {
  if (amountDue <= 0.009) return 'PAID';
  if (amountPaid > 0.009 && amountDue < totalAmount - 0.009) return 'PARTIALLY_PAID';
  if (amountPaid > 0.009) return 'PARTIALLY_PAID';
  return 'UNPAID';
}

function buildWizardSteps(hasInvoices: boolean, taxDelta: number): SaleTaxRestatementWizardStep[] {
  const steps: SaleTaxRestatementWizardStep[] = [
    {
      order: 1,
      code: 'VALIDATE',
      title: 'Validate sale',
      description: 'Confirm sale is posted and period is open for the correction journal.',
    },
    {
      order: 2,
      code: 'RECOMPUTE',
      title: 'Recompute DocumentTax',
      description: 'Recalculate VAT from current product liability + customer tax profile (SSOT).',
    },
    {
      order: 3,
      code: 'UPDATE_LINES',
      title: 'Restamp sale lines',
      description: 'Write tax rate, amount, and determination onto sale items and header.',
    },
  ];
  if (hasInvoices) {
    steps.push({
      order: steps.length + 1,
      code: 'UPDATE_INVOICES',
      title: 'Update invoices',
      description: 'Increase invoice tax/total and open balance (amount due).',
    });
  }
  if (taxDelta > 0.009) {
    steps.push({
      order: steps.length + 1,
      code: 'POST_GL',
      title: 'Post tax GL delta',
      description: 'Recognise omitted output VAT in Tax Payable (and AR/revenue as required).',
    });
  }
  steps.push({
    order: steps.length + 1,
    code: 'COMPLETE',
    title: 'Audit',
    description: 'Record restatement event for audit trail.',
  });
  return steps;
}

/** Build DocumentTax lines: UUID products = pure SSOT (no frozen line tax flags). */
function toDocumentTaxLines(items: TaxRestatementSaleItemRow[]) {
  return items.map((it, lineIndex) => {
    const lineNet = new Decimal(it.quantity)
      .times(it.unitPrice)
      .minus(it.discountAmount || 0);
    const base = {
      lineIndex,
      productId: it.productId,
      lineNetAmount: money2(lineNet.toNumber()),
      quantity: it.quantity,
    };
    // Custom / non-UUID: no products row → pass line liability; UUID: bridge only
    if (!isUuidProductId(it.productId)) {
      return {
        ...base,
        isTaxable: it.isTaxable,
        taxRate: it.taxRate,
      };
    }
    return base;
  });
}

async function buildPreview(
  pool: Pool,
  input: SaleTaxRestatementBody,
): Promise<{
  preview: SaleTaxRestatementPreview;
  items: TaxRestatementSaleItemRow[];
}> {
  const sale = await saleTaxRestatementRepository.getSale(pool, input.saleId);
  if (!sale) throw new ValidationError('Sale not found');

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!ALLOWED_STATUSES.has(String(sale.status || '').toUpperCase())) {
    blockers.push(
      `Sale status ${sale.status} cannot be tax-restated. Only COMPLETED or PARTIALLY_RETURNED sales.`,
    );
  }

  const items = await saleTaxRestatementRepository.getSaleItems(pool, input.saleId);
  if (items.length === 0) blockers.push('Sale has no line items to recompute.');

  const taxDoc = await DocumentTaxService.computeForLines(pool, {
    customerId: sale.customerId,
    documentDate: sale.saleDate?.slice(0, 10) || getBusinessDate(),
    scope: 'SALE',
    applyTenantDefaultWhenUnresolved: false,
    preferLineTaxOverrides: false,
    lines: toDocumentTaxLines(items),
  });

  if (items.length > 0 && taxDoc.lineResults.length !== items.length) {
    throw new BusinessError(
      `DocumentTax lineResults length (${taxDoc.lineResults.length}) != sale items (${items.length})`,
      'ERR_TAX_LINE_MISMATCH',
      { items: items.length, lineResults: taxDoc.lineResults.length },
    );
  }

  const newTax = money2(taxDoc.documentTotals.totalTax);
  const postedTax = money2(sale.taxAmount);
  const taxInclusive = taxDoc.taxInclusive === true;

  // Delta policy — for preview, collect as blockers instead of throw (UI review)
  let taxDelta = money2(newTax - postedTax);
  if (taxDelta < -0.009) {
    blockers.push(
      `Computed tax (${newTax}) is lower than posted tax (${postedTax}). Tax reductions must use credit notes, not restatement.`,
    );
  } else if (taxDelta <= 0.009) {
    blockers.push(
      'Computed tax matches posted tax (no omitted VAT to apply). Ensure products are VAT-liable and the customer is not exempt before restating.',
    );
  }

  const totalDelta = taxInclusive ? 0 : taxDelta > 0.009 ? taxDelta : 0;
  const newTotal = money2(sale.totalAmount + totalDelta);

  if (taxDoc.customerExempt) {
    warnings.push(
      'Customer is currently tax-exempt — DocumentTax returns zero. Clear exemption only if intentionally taxable.',
    );
  }

  if (!taxInclusive && taxDelta > 0.009 && !sale.customerId) {
    blockers.push(
      'Exclusive VAT restatement increases AR. Assign a customer before applying omitted tax (or use a debit note).',
    );
  }

  try {
    await checkAccountingPeriodOpen(pool, getBusinessDate());
  } catch (err) {
    // Surface as blocker for preview; execute re-throws period guard
    blockers.push(err instanceof Error ? err.message : 'Accounting period is closed for correction.');
  }

  let stampedLineTax = 0;
  const lines: SaleTaxRestatementLinePreview[] = items.map((it, i) => {
    const lr = taxDoc.lineResults[i];
    if (!lr) {
      throw new BusinessError(
        `DocumentTax missing lineResult for sale item index ${i}`,
        'ERR_TAX_LINE_MISMATCH',
        { lineIndex: i },
      );
    }
    const lineTax = money2(lr.computation.totalTax);
    stampedLineTax = money2(stampedLineTax + lineTax);
    const pct = lr.taxes.find((t) => t.type === 'PERCENTAGE' && Number(t.rate) > 0);
    const rate = pct ? Number(pct.rate) : 0;
    return {
      saleItemId: it.id,
      productId: it.productId,
      productName: it.productName,
      postedTax: money2(it.taxAmount),
      newTax: lineTax,
      taxRate: lineTax > 0 ? rate : 0,
      determination: lr.determination,
      isTaxable: lineTax > 0 || lr.taxes.length > 0,
    };
  });

  if (items.length > 0) {
    try {
      assertLineTaxEqualsHeader(stampedLineTax, newTax, 'taxRestatement.preview');
    } catch (err) {
      blockers.push(err instanceof Error ? err.message : String(err));
    }
  }

  const invoicesRaw = await saleTaxRestatementRepository.getLinkedInvoices(pool, input.saleId);
  // Linked invoice must track sale tax snapshot 1:1 when sale is the AR source
  const invoices = invoicesRaw.map((inv) => {
    const invTotalDelta = taxInclusive ? 0 : taxDelta > 0.009 ? taxDelta : 0;
    const finalTax = money2(inv.taxAmount + (taxDelta > 0.009 ? taxDelta : 0));
    // Prefer absolute re-align when invoice tax matched sale (normal path)
    const alignedTax =
      Math.abs(inv.taxAmount - postedTax) < 0.05 ? money2(newTax) : finalTax;
    const invTaxDelta = money2(alignedTax - inv.taxAmount);
    const invTotalD = taxInclusive ? 0 : invTaxDelta;
    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      postedTax: money2(inv.taxAmount),
      newTax: alignedTax,
      postedTotal: money2(inv.totalAmount),
      newTotal: money2(inv.totalAmount + invTotalD),
      newAmountDue: money2(Math.max(0, inv.amountDue + invTotalD)),
    };
  });

  // Reject divergent multi-invoice residual arithmetic before execute
  if (invoices.length > 1 && taxDelta > 0.009) {
    for (const inv of invoices) {
      if (Math.abs(inv.newTax - newTax) > 0.05) {
        warnings.push(
          `Invoice ${inv.invoiceNumber} planned tax ${inv.newTax} differs from sale recompute ${newTax} — verify multi-invoice sale manually.`,
        );
      }
    }
  }

  if (invoicesRaw.length === 0 && totalDelta > 0.009) {
    warnings.push(
      'No linked invoice. Sale header will update; ensure AR open items still match GL for this customer.',
    );
  }

  if (sale.amountPaid > 0.009 && totalDelta > 0.009) {
    warnings.push(
      `Sale amount paid ${sale.amountPaid}. Omitted VAT (${taxDelta}) increases open balance — customer still owes the tax.`,
    );
  }

  const journalLines: SaleTaxRestatementPreview['journalLines'] = [];
  if (taxDelta > 0.009 && blockers.length === 0) {
    if (taxInclusive) {
      journalLines.push(
        { accountCode: AccountCodes.SALES_REVENUE, debit: taxDelta, credit: 0 },
        { accountCode: AccountCodes.TAX_PAYABLE, debit: 0, credit: taxDelta },
      );
    } else if (sale.customerId) {
      journalLines.push(
        {
          accountCode: AccountCodes.ACCOUNTS_RECEIVABLE,
          debit: taxDelta,
          credit: 0,
          entityId: sale.customerId,
        },
        { accountCode: AccountCodes.TAX_PAYABLE, debit: 0, credit: taxDelta },
      );
    } else {
      blockers.push('Exclusive GL path requires customer-tagged AR (1200).');
    }

    const dr = journalLines.reduce((s, l) => s + l.debit, 0);
    const cr = journalLines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(money2(dr) - money2(cr)) > 0.02 || dr < 0.01) {
      blockers.push(`Correction journal unbalanced: DR ${dr} CR ${cr}`);
    }
  }

  const preview: SaleTaxRestatementPreview = {
    saleId: sale.id,
    saleNumber: sale.saleNumber,
    customerId: sale.customerId,
    customerName: sale.customerName,
    reason: input.reason,
    taxInclusive,
    customerExempt: taxDoc.customerExempt,
    postedTax,
    newTax,
    taxDelta: taxDelta > 0.009 ? taxDelta : money2(newTax - postedTax),
    postedTotal: money2(sale.totalAmount),
    newTotal,
    totalDelta,
    lines,
    invoices,
    journalLines,
    wizardSteps: buildWizardSteps(invoicesRaw.length > 0, taxDelta > 0.009 ? taxDelta : 0),
    blockers,
    warnings,
  };

  return { preview, items };
}

export const saleTaxRestatementService = {
  async preview(pool: Pool, input: SaleTaxRestatementBody): Promise<SaleTaxRestatementPreview> {
    const { preview } = await buildPreview(pool, input);
    return preview;
  },

  async execute(
    pool: Pool,
    input: SaleTaxRestatementBody,
    userId: string,
  ): Promise<SaleTaxRestatementResult> {
    if (!userId?.trim()) {
      throw new ValidationError('User identity required for tax restatement audit');
    }

    const { preview } = await buildPreview(pool, input);
    if (preview.blockers.length > 0) {
      throw new ValidationError(preview.blockers.join(' '));
    }

    // Fail loud — never soft-execute zero or negative
    assertTaxRestatementDeltaPolicy(preview.postedTax, preview.newTax);

    const entryDate = getBusinessDate();
    await checkAccountingPeriodOpen(pool, entryDate);

    return UnitOfWork.run(pool, async (client) => {
      const locked = await saleTaxRestatementRepository.lockSaleForUpdate(client, input.saleId);
      if (!locked) throw new ValidationError('Sale not found');
      if (!ALLOWED_STATUSES.has(String(locked.status || '').toUpperCase())) {
        throw new ValidationError(`Sale status ${locked.status} cannot be tax-restated.`);
      }
      if (Math.abs(money2(locked.taxAmount) - preview.postedTax) > 0.02) {
        throw new ValidationError('Sale tax changed since preview. Reload and try again.');
      }
      if (Math.abs(money2(locked.totalAmount) - preview.postedTotal) > 0.02) {
        throw new ValidationError('Sale total changed since preview. Reload and try again.');
      }

      // Recompute inside lock (SSOT — no stale preview numbers if masters changed mid-wizard)
      const items = await saleTaxRestatementRepository.getSaleItems(client, input.saleId);
      const taxDoc = await DocumentTaxService.computeForLines(client, {
        customerId: locked.customerId,
        documentDate: locked.saleDate?.slice(0, 10) || entryDate,
        scope: 'SALE',
        applyTenantDefaultWhenUnresolved: false,
        preferLineTaxOverrides: false,
        lines: toDocumentTaxLines(items),
      });
      if (taxDoc.lineResults.length !== items.length) {
        throw new BusinessError(
          `DocumentTax lineResults length mismatch under lock`,
          'ERR_TAX_LINE_MISMATCH',
          { items: items.length, lineResults: taxDoc.lineResults.length },
        );
      }
      const newTax = money2(taxDoc.documentTotals.totalTax);
      const { taxDelta } = assertTaxRestatementDeltaPolicy(money2(locked.taxAmount), newTax);
      if (Math.abs(newTax - preview.newTax) > 0.02 || Math.abs(taxDelta - preview.taxDelta) > 0.02) {
        throw new ValidationError(
          'DocumentTax result changed since preview (product/customer master update). Preview again.',
        );
      }

      const taxInclusive = taxDoc.taxInclusive === true;
      const totalDelta = taxInclusive ? 0 : taxDelta;
      const newTotal = money2(locked.totalAmount + totalDelta);

      let lineTaxSum = 0;
      for (let i = 0; i < items.length; i++) {
        const lr = taxDoc.lineResults[i]!;
        const lineTax = money2(lr.computation.totalTax);
        lineTaxSum = money2(lineTaxSum + lineTax);
        const pct = lr.taxes.find((t) => t.type === 'PERCENTAGE' && Number(t.rate) > 0);
        const rate = pct ? Number(pct.rate) : 0;
        await saleTaxRestatementRepository.updateSaleItemTax(client, items[i].id, {
          taxAmount: lineTax,
          taxRate: lineTax > 0 ? rate : 0,
          isTaxable: lineTax > 0 || lr.taxes.length > 0,
          taxDetermination: lr.determination,
        });
      }
      assertLineTaxEqualsHeader(lineTaxSum, newTax, 'taxRestatement.execute');

      await saleTaxRestatementRepository.updateSaleTax(client, input.saleId, {
        taxAmount: newTax,
        totalAmount: newTotal,
      });

      const invoices = await saleTaxRestatementRepository.getLinkedInvoices(client, input.saleId);
      for (const inv of invoices) {
        const plan = preview.invoices.find((p) => p.invoiceId === inv.id);
        if (!plan) {
          throw new BusinessError(
            `Linked invoice ${inv.invoiceNumber} missing from restatement plan — refuse partial write`,
            'ERR_TAX_RESTATE_INVOICE_PLAN',
            { invoiceId: inv.id },
          );
        }
        // Recompute plan amounts from lock-time taxDelta SSOT
        const alignedTax =
          Math.abs(inv.taxAmount - locked.taxAmount) < 0.05
            ? newTax
            : money2(inv.taxAmount + taxDelta);
        const invTaxDelta = money2(alignedTax - inv.taxAmount);
        const invTotalD = taxInclusive ? 0 : invTaxDelta;
        const invNewTotal = money2(inv.totalAmount + invTotalD);
        const invNewDue = money2(Math.max(0, inv.amountDue + invTotalD));
        const status = invoiceStatusAfterDue(invNewDue, inv.amountPaid, invNewTotal);
        await saleTaxRestatementRepository.updateInvoiceTax(client, inv.id, {
          taxAmount: alignedTax,
          totalAmount: invNewTotal,
          amountDue: invNewDue,
          status,
        });
        const linesCopied = await saleTaxRestatementRepository.refreshInvoiceLinesFromSale(
          client,
          inv.id,
          input.saleId,
        );
        // Header-only invoices (0 lines) are allowed; if lines existed they must be refreshed
        if (linesCopied === 0) {
          // verify there are still zero lines (was header-only)
          const n = await saleTaxRestatementRepository.countInvoiceLines(client, inv.id);
          if (n > 0) {
            throw new BusinessError(
              `Invoice ${inv.invoiceNumber} line refresh returned 0 but lines remain`,
              'ERR_TAX_RESTATE_INVOICE_LINES',
              { invoiceId: inv.id },
            );
          }
        }
        assertPostedTaxTriplet({
          saleTax: newTax,
          lineTaxSum,
          invoiceTax: alignedTax,
          context: `taxRestatement.invoice:${inv.invoiceNumber}`,
        });
      }

      if (taxDelta <= 0.009) {
        throw new BusinessError('Tax delta vanished under lock', 'ERR_TAX_RESTATE_ZERO_DELTA', {});
      }

      const glLines =
        taxInclusive
          ? [
              {
                accountCode: AccountCodes.SALES_REVENUE,
                description: `Tax restatement: split VAT from revenue ${preview.saleNumber}`,
                debitAmount: taxDelta,
                creditAmount: 0,
              },
              {
                accountCode: AccountCodes.TAX_PAYABLE,
                description: `Tax restatement: output VAT ${preview.saleNumber}`,
                debitAmount: 0,
                creditAmount: taxDelta,
              },
            ]
          : [
              customerArLine({
                customerId: requireCustomerIdForAr(
                  locked.customerId,
                  `tax restatement ${preview.saleNumber}`,
                ),
                debitAmount: taxDelta,
                description: `Tax restatement: omitted VAT A/R ${preview.saleNumber}`,
              }),
              {
                accountCode: AccountCodes.TAX_PAYABLE,
                description: `Tax restatement: output VAT ${preview.saleNumber}`,
                debitAmount: 0,
                creditAmount: taxDelta,
              },
            ];

      const journal = await AccountingCore.createJournalEntry(
        {
          entryDate,
          description: `Tax restatement ${preview.saleNumber}: +${taxDelta} VAT`,
          referenceType: 'CORRECTION',
          referenceId: input.saleId,
          referenceNumber: preview.saleNumber,
          lines: glLines,
          userId,
          idempotencyKey: `TAX_RESTATE-${input.saleId}-${Math.round(preview.postedTax * 100)}-${Math.round(newTax * 100)}`,
          source: 'SYSTEM_CORRECTION',
        },
        pool,
        client,
      );
      if (!journal?.transactionId) {
        throw new BusinessError(
          'GL journal created without transactionId — refuse incomplete restatement',
          'ERR_TAX_RESTATE_GL',
          {},
        );
      }
      const glTransactionId = journal.transactionId;

      if (locked.customerId) {
        await syncCustomerBalanceFromInvoices(
          client,
          locked.customerId,
          `sale_tax_restatement:${preview.saleNumber}`,
        );
      }

      // Post-write DB assert
      const verify = await saleTaxRestatementRepository.getPostedTaxIntegrity(client, input.saleId);
      assertPostedTaxTriplet({
        saleTax: verify.saleTax,
        lineTaxSum: verify.lineTaxSum,
        invoiceTax: verify.primaryInvoiceTax,
        context: 'taxRestatement.postWrite',
      });
      if (Math.abs(verify.saleTax - newTax) > 0.02) {
        throw new BusinessError(
          `Post-write sale tax ${verify.saleTax} != expected ${newTax}`,
          'ERR_TAX_RESTATE_POST_WRITE',
          { got: verify.saleTax, expected: newTax },
        );
      }

      const eventId = await saleTaxRestatementRepository.insertEvent(client, {
        saleId: input.saleId,
        postedTax: preview.postedTax,
        newTax,
        taxDelta,
        totalDelta,
        taxInclusive,
        glTransactionId,
        reason: input.reason,
        createdBy: userId,
      });

      return {
        eventId,
        glTransactionId,
        saleId: preview.saleId,
        saleNumber: preview.saleNumber,
        postedTax: preview.postedTax,
        newTax,
        taxDelta,
        totalDelta,
        invoicesUpdated: invoices.length,
        warnings: preview.warnings,
      };
    });
  },
};
