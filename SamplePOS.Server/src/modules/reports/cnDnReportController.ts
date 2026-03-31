/**
 * Credit/Debit Note Reports Controller
 *
 * HTTP handlers for CN/DN reporting endpoints.
 * Follows existing reportsController pattern:
 * - Date range from query params (startDate, endDate)
 * - JSON responses in { success, data, summary? } format
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

export const cnDnReportsController = {

    // 1. Sales Returns & Allowances (P&L)
    async getSalesReturns(req: Request, res: Response, pool: Pool) {
        const { startDate, endDate } = DateRangeSchema.parse(req.query);
        const result = await cnDnReportService.getSalesReturnsAndAllowances(pool, startDate, endDate);
        res.json({ success: true, data: result.data, summary: result.summary });
    },

    // 2. Purchase Returns & Allowances (P&L)
    async getPurchaseReturns(req: Request, res: Response, pool: Pool) {
        const { startDate, endDate } = DateRangeSchema.parse(req.query);
        const result = await cnDnReportService.getPurchaseReturnsAndAllowances(pool, startDate, endDate);
        res.json({ success: true, data: result.data, summary: result.summary });
    },

    // 3. AR Ledger (GL view)
    async getArLedger(req: Request, res: Response, pool: Pool) {
        const { startDate, endDate } = DateRangeSchema.parse(req.query);
        const { customerId } = OptionalCustomerIdSchema.parse(req.query);
        const result = await cnDnReportService.getArLedger(pool, startDate, endDate, customerId);
        res.json({ success: true, data: result.data, summary: result.summary });
    },

    // 4. AP Ledger (GL view)
    async getApLedger(req: Request, res: Response, pool: Pool) {
        const { startDate, endDate } = DateRangeSchema.parse(req.query);
        const { supplierId } = OptionalSupplierIdSchema.parse(req.query);
        const result = await cnDnReportService.getApLedger(pool, startDate, endDate, supplierId);
        res.json({ success: true, data: result.data, summary: result.summary });
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
        res.json({ success: true, data: result.data, summary: result.summary });
    },

    // 6. Tax Reversal Report
    async getTaxReversal(req: Request, res: Response, pool: Pool) {
        const { startDate, endDate } = DateRangeSchema.parse(req.query);
        const result = await cnDnReportService.getTaxReversalReport(pool, startDate, endDate);
        res.json({ success: true, data: result.data, summary: result.summary });
    },

    // 7. Invoice Adjustment History
    async getInvoiceAdjustments(req: Request, res: Response, pool: Pool) {
        const invoiceId = z.string().uuid().parse(req.params.invoiceId);
        const side = (req.query.side as 'CUSTOMER' | 'SUPPLIER') || 'CUSTOMER';
        const data = await cnDnReportService.getInvoiceAdjustments(pool, invoiceId, side);
        res.json({ success: true, data });
    },

    // 8. Supplier Statement
    async getSupplierStatement(req: Request, res: Response, pool: Pool) {
        const supplierId = z.string().uuid().parse(req.params.supplierId);
        const { startDate, endDate } = DateRangeSchema.parse(req.query);
        const data = await cnDnReportService.getSupplierStatement(pool, supplierId, startDate, endDate);
        res.json({ success: true, data });
    },

    // 9. Supplier Aging (Aged Payables)
    async getSupplierAging(req: Request, res: Response, pool: Pool) {
        const result = await cnDnReportService.getSupplierAging(pool);
        res.json({ success: true, data: result.data, summary: result.summary });
    },
};
