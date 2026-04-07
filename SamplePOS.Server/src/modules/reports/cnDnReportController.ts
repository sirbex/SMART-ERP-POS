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

const DateRangeSchema = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD'),
});

const OptionalCustomerIdSchema = z.object({
    customerId: z.string().uuid().optional(),
});

const OptionalSupplierIdSchema = z.object({
    supplierId: z.string().uuid().optional(),
});

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

export const cnDnReportsController = {

    // 1. Sales Returns & Allowances (P&L)
    async getSalesReturns(req: Request, res: Response, pool: Pool) {
        const { startDate, endDate } = DateRangeSchema.parse(req.query);
        const result = await cnDnReportService.getSalesReturnsAndAllowances(pool, startDate, endDate);
        res.json({ success: true, data: envelope('SALES_RETURNS', 'Sales Returns & Allowances', result.data, result.summary) });
    },

    // 2. Purchase Returns & Allowances (P&L)
    async getPurchaseReturns(req: Request, res: Response, pool: Pool) {
        const { startDate, endDate } = DateRangeSchema.parse(req.query);
        const result = await cnDnReportService.getPurchaseReturnsAndAllowances(pool, startDate, endDate);
        res.json({ success: true, data: envelope('PURCHASE_RETURNS', 'Purchase Returns & Allowances', result.data, result.summary) });
    },

    // 3. AR Ledger (GL view)
    async getArLedger(req: Request, res: Response, pool: Pool) {
        const { startDate, endDate } = DateRangeSchema.parse(req.query);
        const { customerId } = OptionalCustomerIdSchema.parse(req.query);
        const result = await cnDnReportService.getArLedger(pool, startDate, endDate, customerId);
        res.json({ success: true, data: envelope('AR_LEDGER', 'Accounts Receivable Ledger', result.data, result.summary) });
    },

    // 4. AP Ledger (GL view)
    async getApLedger(req: Request, res: Response, pool: Pool) {
        const { startDate, endDate } = DateRangeSchema.parse(req.query);
        const { supplierId } = OptionalSupplierIdSchema.parse(req.query);
        const result = await cnDnReportService.getApLedger(pool, startDate, endDate, supplierId);
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

    // 8. Supplier Statement
    async getSupplierStatement(req: Request, res: Response, pool: Pool) {
        const supplierId = z.string().uuid().parse(req.params.supplierId);
        const { startDate, endDate } = DateRangeSchema.parse(req.query);
        const data = await cnDnReportService.getSupplierStatement(pool, supplierId, startDate, endDate);
        res.json({
            success: true,
            data: envelope('SUPPLIER_STATEMENT', `Supplier Statement — ${data.supplierName}`, data.entries, {
                supplierName: data.supplierName,
                periodStart: data.periodStart,
                periodEnd: data.periodEnd,
                openingBalance: data.openingBalance,
                closingBalance: data.closingBalance,
            }),
        });
    },

    // 9. Supplier Aging (Aged Payables)
    async getSupplierAging(req: Request, res: Response, pool: Pool) {
        const result = await cnDnReportService.getSupplierAging(pool);
        res.json({ success: true, data: envelope('SUPPLIER_AGING', 'Supplier Aging (Aged Payables)', result.data, result.summary) });
    },
};
