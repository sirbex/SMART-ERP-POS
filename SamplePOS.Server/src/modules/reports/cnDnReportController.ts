/**
 * Credit/Debit Note Reports Controller
 *
 * HTTP handlers for CN/DN reporting endpoints.
 * All responses wrapped in standard report envelope:
 * { success, data: { reportType, reportName, generatedAt, data, summary, recordCount, executionTimeMs } }
 */

import type { Request, Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import * as cnDnReportService from './cnDnReportService.js';
import {
  ReportPDFGenerator,
  formatCurrencyPDF,
  formatDatePDF,
  formatDateTimePDF,
  PDFColors,
  type PDFTableColumn,
} from '../documents/pdfGenerator.js';
import { getBusinessDate } from '../../utils/dateRange.js';
import { reportsService } from './reportsService.js';

const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

/** Accept camelCase (POST generate) or snake_case (GET PDF export). */
const DateRangeSchema = z.preprocess((raw) => {
  const q = (raw ?? {}) as Record<string, unknown>;
  return {
    startDate: q.startDate ?? q.start_date,
    endDate: q.endDate ?? q.end_date,
    format: q.format,
  };
}, z.object({
  startDate: Ymd,
  endDate: Ymd,
  format: z.enum(['json', 'pdf', 'csv']).optional(),
}));

const OptionalCustomerIdSchema = z.preprocess((raw) => {
  const q = (raw ?? {}) as Record<string, unknown>;
  return { customerId: q.customerId ?? q.customer_id };
}, z.object({
  customerId: z.string().uuid().optional(),
}));

const OptionalSupplierIdSchema = z.preprocess((raw) => {
  const q = (raw ?? {}) as Record<string, unknown>;
  return { supplierId: q.supplierId ?? q.supplier_id };
}, z.object({
  supplierId: z.string().uuid().optional(),
}));

/** Wrap report data in the standard envelope the frontend expects */
function envelope(reportType: string, reportName: string, data: unknown[], summary: Record<string, unknown>) {
  return {
    reportType,
    reportName,
    generatedAt: new Date().toISOString(),
    data,
    summary,
    recordCount: data.length,
    executionTimeMs: 0,
  };
}

async function getCompanyName(pool: Pool): Promise<string> {
  try {
    const settings = await reportsService.getSystemSettings(pool);
    return settings.businessName || 'SMART ERP';
  } catch {
    return 'SMART ERP';
  }
}

function formatSignedBalance(v: unknown): string {
  const n = Number(v) || 0;
  if (Math.abs(n) < 0.009) return formatCurrencyPDF(0);
  return `${formatCurrencyPDF(Math.abs(n))}${n < 0 ? ' CR' : ' DR'}`;
}

function writePartnerLedgerPdf(
  res: Response,
  opts: {
    companyName: string;
    title: string;
    subtitle: string;
    filename: string;
    summary: {
      openingBalance: number;
      totalDebit: number;
      totalCredit: number;
      closingBalance: number;
    };
    rows: Array<Record<string, unknown>>;
  },
) {
  const pdfGen = new ReportPDFGenerator(opts.companyName, { layout: 'landscape' });
  const doc = pdfGen.getDocument();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${opts.filename}"`);
  doc.pipe(res);

  pdfGen.addHeader({
    companyName: opts.companyName,
    title: opts.title,
    subtitle: opts.subtitle,
    generatedAt: formatDateTimePDF(new Date()),
  });

  pdfGen.addSummaryCards([
    {
      label: 'Opening',
      value: formatSignedBalance(opts.summary.openingBalance),
      color: PDFColors.primary,
    },
    {
      label: 'Debits',
      value: formatCurrencyPDF(opts.summary.totalDebit),
      color: PDFColors.info,
    },
    {
      label: 'Credits',
      value: formatCurrencyPDF(opts.summary.totalCredit),
      color: PDFColors.success,
    },
    {
      label: 'Closing',
      value: formatSignedBalance(opts.summary.closingBalance),
      color:
        opts.summary.closingBalance < -0.009
          ? PDFColors.success
          : opts.summary.closingBalance > 0.009
            ? PDFColors.danger
            : PDFColors.dark,
    },
  ]);

  pdfGen.addSectionHeading('Ledger movements');

  const columns: PDFTableColumn[] = [
    {
      header: 'Date',
      key: 'date',
      width: 0.1,
      format: (v) => (v ? formatDatePDF(String(v).slice(0, 10)) : ''),
    },
    {
      header: 'Type',
      key: 'referenceType',
      width: 0.14,
      format: (v) => String(v || '').replace(/_/g, ' '),
    },
    { header: 'Document', key: 'document', width: 0.14 },
    { header: 'Description', key: 'description', width: 0.22 },
    {
      header: 'Debit',
      key: 'debit',
      width: 0.12,
      align: 'right',
      format: (v) => (Number(v) > 0.009 ? formatCurrencyPDF(v as number) : '—'),
    },
    {
      header: 'Credit',
      key: 'credit',
      width: 0.12,
      align: 'right',
      format: (v) => (Number(v) > 0.009 ? formatCurrencyPDF(v as number) : '—'),
    },
    {
      header: 'Balance',
      key: 'balance',
      width: 0.16,
      align: 'right',
      format: formatSignedBalance,
    },
  ];

  const tableRows = opts.rows.map((r) => ({
    ...r,
    document: r.referenceNumber || r.transactionNumber || '',
  }));

  pdfGen.addTable(columns, tableRows);
  pdfGen.end();
}

export const cnDnReportsController = {

  // 1. Sales Returns & Allowances (P&L)
  async getSalesReturns(req: Request, res: Response, pool: Pool) {
    const { startDate, endDate } = DateRangeSchema.parse(req.query);
    const result = await cnDnReportService.getSalesReturnsAndAllowances(pool, startDate, endDate);
    res.json({
      success: true,
      data: envelope(
        'SALES_RETURNS_ALLOWANCES',
        'Sales Returns & Allowances',
        result.data,
        result.summary,
      ),
    });
  },

  // 2. Purchase Returns & Allowances (P&L)
  async getPurchaseReturns(req: Request, res: Response, pool: Pool) {
    const { startDate, endDate } = DateRangeSchema.parse(req.query);
    const result = await cnDnReportService.getPurchaseReturnsAndAllowances(pool, startDate, endDate);
    res.json({
      success: true,
      data: envelope(
        'PURCHASE_RETURNS_ALLOWANCES',
        'Purchase Returns & Allowances',
        result.data,
        result.summary,
      ),
    });
  },

  // 3. AR Ledger (GL view)
  async getArLedger(req: Request, res: Response, pool: Pool) {
    const { startDate, endDate, format } = DateRangeSchema.parse(req.query);
    const { customerId } = OptionalCustomerIdSchema.parse(req.query);
    const result = await cnDnReportService.getArLedger(pool, startDate, endDate, customerId);

    if (format === 'pdf') {
      const companyName = await getCompanyName(pool);
      writePartnerLedgerPdf(res, {
        companyName,
        title: 'Accounts Receivable Ledger',
        subtitle: `GL control account 1200 · ${formatDatePDF(startDate)} to ${formatDatePDF(endDate)}${customerId ? ' · filtered customer' : ' · all customers'}`,
        filename: `ar-ledger-${getBusinessDate()}.pdf`,
        summary: {
          openingBalance: result.summary.openingBalance,
          totalDebit: result.summary.totalDebit,
          totalCredit: result.summary.totalCredit,
          closingBalance: result.summary.closingBalance,
        },
        rows: result.data as unknown as Array<Record<string, unknown>>,
      });
      return;
    }

    res.json({ success: true, data: envelope('AR_LEDGER', 'Accounts Receivable Ledger', result.data, result.summary) });
  },

  // 4. AP Ledger (GL view)
  async getApLedger(req: Request, res: Response, pool: Pool) {
    const { startDate, endDate, format } = DateRangeSchema.parse(req.query);
    const { supplierId } = OptionalSupplierIdSchema.parse(req.query);
    const result = await cnDnReportService.getApLedger(pool, startDate, endDate, supplierId);

    if (format === 'pdf') {
      const companyName = await getCompanyName(pool);
      writePartnerLedgerPdf(res, {
        companyName,
        title: 'Accounts Payable Ledger',
        subtitle: `GL AP control · ${formatDatePDF(startDate)} to ${formatDatePDF(endDate)}${supplierId ? ' · filtered supplier' : ' · all suppliers'}`,
        filename: `ap-ledger-${getBusinessDate()}.pdf`,
        summary: {
          openingBalance: result.summary.openingBalance,
          totalDebit: result.summary.totalDebit,
          totalCredit: result.summary.totalCredit,
          closingBalance: result.summary.closingBalance,
        },
        rows: result.data as unknown as Array<Record<string, unknown>>,
      });
      return;
    }

    res.json({ success: true, data: envelope('AP_LEDGER', 'Accounts Payable Ledger', result.data, result.summary) });
  },

  // 5. Credit/Debit Note Register
  async getNoteRegister(req: Request, res: Response, pool: Pool) {
    const { startDate, endDate } = DateRangeSchema.parse(req.query);
    const side = req.query.side
      ? z.enum(['CUSTOMER', 'SUPPLIER']).parse(req.query.side)
      : undefined;
    const documentType = req.query.documentType
      ? z.enum(['CREDIT_NOTE', 'DEBIT_NOTE', 'SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE']).parse(req.query.documentType)
      : undefined;
    const status = req.query.status
      ? z.enum(['DRAFT', 'POSTED', 'CANCELLED']).parse(req.query.status)
      : undefined;
    const result = await cnDnReportService.getNoteRegister(pool, {
      startDate,
      endDate,
      side,
      documentType,
      status,
    });
    res.json({ success: true, data: envelope('NOTE_REGISTER', 'Credit / Debit Note Register', result.data, result.summary) });
  },

  // 6. Tax Reversal Report
  async getTaxReversal(req: Request, res: Response, pool: Pool) {
    const { startDate, endDate } = DateRangeSchema.parse(req.query);
    const result = await cnDnReportService.getTaxReversalReport(pool, startDate, endDate);
    res.json({ success: true, data: envelope('TAX_REVERSAL', 'Tax Reversal Report', result.data, result.summary) });
  },

  // 7. Invoice Adjustment History
  async getInvoiceAdjustments(req: Request, res: Response, pool: Pool) {
    const invoiceId = z.string().uuid().parse(req.params.invoiceId);
    const side = (req.query.side as 'CUSTOMER' | 'SUPPLIER') || 'CUSTOMER';
    const data = await cnDnReportService.getInvoiceAdjustments(pool, invoiceId, side);
    const rows = Array.isArray(data) ? data : [];
    res.json({ success: true, data: envelope('INVOICE_ADJUSTMENTS', 'Invoice Adjustment History', rows, {}) });
  },

  // 8. Supplier Statement (Tally/SAP/Odoo partner statement)
  async getSupplierStatement(req: Request, res: Response, pool: Pool) {
    const supplierId = z.string().uuid().parse(req.params.supplierId);
    const { startDate, endDate, format } = DateRangeSchema.parse(req.query);
    const data = await cnDnReportService.getSmartSupplierStatementData(pool, supplierId, startDate, endDate);

    const totalDebit = data.entries.reduce((s, e) => s + Number(e.debit || 0), 0);
    const totalCredit = data.entries.reduce((s, e) => s + Number(e.credit || 0), 0);
    const summary = {
      supplierId: data.supplierId,
      supplierName: data.supplierName,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      openingBalance: data.openingBalance,
      closingBalance: data.closingBalance,
      totalDebit,
      totalCredit,
      totalDebits: totalDebit,
      totalCredits: totalCredit,
      openItemBalance: data.openItemBalance,
      unallocatedPrepaymentsTotal: data.unallocatedPrepaymentsTotal,
    };

    if (format === 'pdf') {
      const companyName = await getCompanyName(pool);
      writePartnerLedgerPdf(res, {
        companyName,
        title: 'Supplier Account Statement',
        subtitle: `${data.supplierName} · AP partner ledger · ${formatDatePDF(startDate)} to ${formatDatePDF(endDate)}`,
        filename: `supplier-statement-${getBusinessDate()}.pdf`,
        summary: {
          openingBalance: data.openingBalance,
          totalDebit,
          totalCredit,
          closingBalance: data.closingBalance,
        },
        rows: data.entries.map((e) => ({
          date: e.date,
          referenceType: e.vchType,
          referenceNumber: e.vchNo,
          description: e.particulars,
          debit: e.debit,
          credit: e.credit,
          balance: e.balanceAfter,
        })),
      });
      return;
    }

    res.json({
      success: true,
      data: envelope(
        'SUPPLIER_STATEMENT',
        `Supplier Statement — ${data.supplierName}`,
        data.entries,
        summary,
      ),
    });
  },

  // 9. Supplier Aging (Aged Payables)
  async getSupplierAging(req: Request, res: Response, pool: Pool) {
    const result = await cnDnReportService.getSupplierAging(pool);
    res.json({ success: true, data: envelope('SUPPLIER_AGING', 'Supplier Aging (Aged Payables)', result.data, result.summary) });
  },
};
