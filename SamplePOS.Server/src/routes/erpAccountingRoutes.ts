/**
 * ERP Accounting Routes
 * 
 * ERP-grade accounting controls (NOT reports - those are in /api/reports):
 *   ✔ Journal Entries - Create, reverse, list manual journal entries
 *   ✔ Period Management - Open, close, lock accounting periods
 *   ✔ P&L Verification - Verify P&L consistency with Trial Balance
 *   ✔ Reconciliation - Cash, AR, Inventory, AP reconciliation
 * 
 * NOTE: P&L reports are in /api/reports module, not here.
 * This module focuses on ERP controls, not reporting.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Pool } from 'pg';
import { JournalEntryService, getJournalEntryService } from '../services/journalEntryService.js';
import { AccountingPeriodService, getAccountingPeriodService } from '../services/accountingPeriodService.js';
import { ProfitLossReportService, getProfitLossReportService } from '../services/profitLossReportService.js';
import { ReconciliationService, getReconciliationService } from '../services/reconciliationService.js';
import logger from '../utils/logger.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// All ERP accounting routes require authentication
router.use(authenticate);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const JournalEntryLineSchema = z.object({
    accountId: z.string().min(1),
    accountCode: z.string().optional(),
    debitAmount: z.number().nonnegative().optional().default(0),
    creditAmount: z.number().nonnegative().optional().default(0),
    description: z.string().optional(),
    entityType: z.enum(['CUSTOMER', 'SUPPLIER', 'PRODUCT', 'EMPLOYEE']).optional(),
    entityId: z.string().uuid().optional()
}).refine(
    data => (data.debitAmount && data.debitAmount > 0) || (data.creditAmount && data.creditAmount > 0),
    { message: 'Each line must have either a debit or credit amount > 0' }
);

const CreateJournalEntrySchema = z.object({
    entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
    narration: z.string().min(1).max(500),
    reference: z.string().max(50).optional(),
    lines: z.array(JournalEntryLineSchema).min(2, 'Journal entry must have at least 2 lines')
});

const ClosePeriodSchema = z.object({
    year: z.number().int().min(2020).max(2100),
    month: z.number().int().min(1).max(12),
    notes: z.string().optional()
});

const ReopenPeriodSchema = z.object({
    year: z.number().int().min(2020).max(2100),
    month: z.number().int().min(1).max(12),
    reason: z.string().min(10, 'Reason must be at least 10 characters')
});

const LockPeriodSchema = z.object({
    year: z.number().int().min(2020).max(2100),
    month: z.number().int().min(1).max(12)
});

const DateRangeSchema = z.object({
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

// =============================================================================
// MIDDLEWARE
// =============================================================================

// Attach pool from request context (set by parent router)
function withServices(req: Request) {
    const pool = req.app.get('pool') as Pool;
    return {
        journalService: getJournalEntryService(pool),
        periodService: getAccountingPeriodService(pool),
        plService: getProfitLossReportService(pool),
        reconciliationService: getReconciliationService(pool)
    };
}

// Get user ID from auth middleware
function getUserId(req: Request): string {
    return req.user!.id;
}

// =============================================================================
// JOURNAL ENTRY ROUTES
// =============================================================================

/**
 * POST /api/erp-accounting/journal-entries
 * Create a new manual journal entry
 */
router.post('/journal-entries', asyncHandler(async (req, res) => {
    const validation = CreateJournalEntrySchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(400).json({
            success: false,
            error: validation.error.errors[0].message
        });
    }

    const { journalService } = withServices(req);
    const userId = getUserId(req);

    const result = await journalService.createJournalEntry({
        ...validation.data,
        createdBy: userId
    });

    logger.info('Journal entry created', {
        entryId: result.id,
        userId,
        amount: result.totalDebit
    });

    return res.status(201).json({
        success: true,
        data: result,
        message: 'Journal entry created successfully'
    });

}));

/**
 * POST /api/erp-accounting/journal-entries/:id/reverse
 * Reverse a journal entry
 */
router.post('/journal-entries/:id/reverse', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.length < 5) {
        return res.status(400).json({
            success: false,
            error: 'Reason for reversal is required (min 5 characters)'
        });
    }

    const { journalService } = withServices(req);
    const userId = getUserId(req);

    const result = await journalService.reverseJournalEntry({
        journalEntryId: id,
        reversalDate: new Date().toLocaleDateString('en-CA'), // Today's date
        reason,
        reversedBy: userId
    });

    logger.info('Journal entry reversed', {
        originalId: id,
        reversalId: result.id,
        userId
    });

    return res.json({
        success: true,
        data: result,
        message: 'Journal entry reversed successfully'
    });

}));

/**
 * GET /api/erp-accounting/journal-entries
 * List journal entries with filtering
 */
router.get('/journal-entries', asyncHandler(async (req, res) => {
    const { dateFrom, dateTo, status, page = '1', limit = '50' } = req.query;

    const { journalService } = withServices(req);

    const result = await journalService.listJournalEntries({
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        status: status as 'POSTED' | 'REVERSED',
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10)
    });

    return res.json({
        success: true,
        data: result
    });

}));

/**
 * GET /api/erp-accounting/journal-entries/:id
 * Get journal entry details
 */
router.get('/journal-entries/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { journalService } = withServices(req);

    const result = await journalService.getJournalEntry(id);

    if (!result) {
        return res.status(404).json({
            success: false,
            error: 'Journal entry not found'
        });
    }

    return res.json({
        success: true,
        data: result
    });

}));

// =============================================================================
// PERIOD MANAGEMENT ROUTES
// =============================================================================

/**
 * GET /api/erp-accounting/periods
 * List accounting periods
 */
router.get('/periods', asyncHandler(async (req, res) => {
    const { year } = req.query;
    const { periodService } = withServices(req);

    const result = await periodService.getPeriods(
        year ? parseInt(year as string, 10) : undefined
    );

    return res.json({
        success: true,
        data: result
    });

}));

/**
 * GET /api/erp-accounting/periods/check-open
 * Check if a specific date is in an open period
 */
router.get('/periods/check-open', asyncHandler(async (req, res) => {
    const { date } = req.query;

    if (!date || typeof date !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'Date parameter is required (YYYY-MM-DD format)'
        });
    }

    const pool = req.app.get('pool');
    const result = await pool.query(
        `SELECT fn_is_period_open($1::DATE) as is_open`,
        [date]
    );

    return res.json({
        success: true,
        data: {
            date,
            isOpen: result.rows[0]?.is_open ?? true
        }
    });

}));

/**
 * POST /api/erp-accounting/periods/close
 * Close an accounting period
 */
router.post('/periods/close', asyncHandler(async (req, res) => {
    const validation = ClosePeriodSchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(400).json({
            success: false,
            error: validation.error.errors[0].message
        });
    }

    const { periodService } = withServices(req);
    const userId = getUserId(req);

    const result = await periodService.closePeriod(
        validation.data.year,
        validation.data.month,
        userId,
        validation.data.notes
    );

    logger.info('Period closed', {
        year: validation.data.year,
        month: validation.data.month,
        closedBy: userId
    });

    return res.json({
        success: true,
        data: result,
        message: `Period ${validation.data.year}-${String(validation.data.month).padStart(2, '0')} closed successfully`
    });

}));

/**
 * POST /api/erp-accounting/periods/reopen
 * Reopen a closed accounting period
 */
router.post('/periods/reopen', asyncHandler(async (req, res) => {
    const validation = ReopenPeriodSchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(400).json({
            success: false,
            error: validation.error.errors[0].message
        });
    }

    const { periodService } = withServices(req);
    const userId = getUserId(req);

    const result = await periodService.reopenPeriod(
        validation.data.year,
        validation.data.month,
        userId,
        validation.data.reason
    );

    logger.warn('Period reopened', {
        year: validation.data.year,
        month: validation.data.month,
        reopenedBy: userId,
        reason: validation.data.reason
    });

    return res.json({
        success: true,
        data: result,
        message: `Period ${validation.data.year}-${String(validation.data.month).padStart(2, '0')} reopened`
    });

}));

/**
 * POST /api/erp-accounting/periods/lock
 * Permanently lock an accounting period
 */
router.post('/periods/lock', asyncHandler(async (req, res) => {
    const validation = LockPeriodSchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(400).json({
            success: false,
            error: validation.error.errors[0].message
        });
    }

    const { periodService } = withServices(req);
    const userId = getUserId(req);

    const result = await periodService.lockPeriod(
        validation.data.year,
        validation.data.month,
        userId
    );

    logger.warn('Period permanently locked', {
        year: validation.data.year,
        month: validation.data.month,
        lockedBy: userId
    });

    return res.json({
        success: true,
        data: result,
        message: `Period ${validation.data.year}-${String(validation.data.month).padStart(2, '0')} permanently locked`
    });

}));

/**
 * GET /api/erp-accounting/periods/:year/:month/history
 * Get period history (audit trail)
 */
router.get('/periods/:year/:month/history', asyncHandler(async (req, res) => {
    const year = parseInt(req.params.year, 10);
    const month = parseInt(req.params.month, 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({
            success: false,
            error: 'Invalid year or month'
        });
    }

    const { periodService } = withServices(req);

    // First get the period to find its ID
    const periods = await periodService.getPeriods();
    const period = periods.find((p) => p.periodYear === year && p.periodMonth === month);

    if (!period) {
        return res.status(404).json({
            success: false,
            error: `Period ${year}-${String(month).padStart(2, '0')} not found`
        });
    }

    const result = await periodService.getPeriodHistory(period.id);

    return res.json({
        success: true,
        data: result
    });

}));

// =============================================================================
// PROFIT & LOSS REPORT ROUTES - GL-BASED (ERP-GRADE)
// =============================================================================
// NOTE: These P&L reports use GL ledger data via database functions for
// ERP-grade financial reporting. The /api/reports module uses sales table
// data for operational reports. Both are needed for different purposes.

/**
 * GET /api/erp-accounting/reports/profit-loss
 * GL-based P&L report using fn_get_profit_loss and fn_get_profit_loss_summary
 */
router.get('/reports/profit-loss', asyncHandler(async (req, res) => {
    const { dateFrom, dateTo } = req.query;

    const today = new Date();
    const defaultFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    const defaultTo = today.toLocaleDateString('en-CA');

    const startDate = (dateFrom as string) || defaultFrom;
    const endDate = (dateTo as string) || defaultTo;

    const pool = req.app.get('pool') as Pool;

    // Get detailed P&L by account
    const detailResult = await pool.query(
        'SELECT * FROM fn_get_profit_loss($1::DATE, $2::DATE)',
        [startDate, endDate]
    );

    // Get summary totals
    const summaryResult = await pool.query(
        'SELECT * FROM fn_get_profit_loss_summary($1::DATE, $2::DATE)',
        [startDate, endDate]
    );

    const summary = summaryResult.rows[0] || {};

    return res.json({
        success: true,
        data: {
            reportType: 'PROFIT_LOSS_GL',
            dateFrom: startDate,
            dateTo: endDate,
            generatedAt: new Date().toISOString(),
            accounts: detailResult.rows.map(row => ({
                section: row.section,
                accountCode: row.account_code,
                accountName: row.account_name,
                debitTotal: parseFloat(row.debit_total || 0),
                creditTotal: parseFloat(row.credit_total || 0),
                netAmount: parseFloat(row.net_amount || 0),
                displayAmount: parseFloat(row.display_amount || 0)
            })),
            summary: {
                totalRevenue: parseFloat(summary.total_revenue || 0),
                totalCOGS: parseFloat(summary.total_cogs || 0),
                grossProfit: parseFloat(summary.gross_profit || 0),
                grossMarginPercent: parseFloat(summary.gross_margin_percent || 0),
                totalOperatingExpenses: parseFloat(summary.total_operating_expenses || 0),
                operatingIncome: parseFloat(summary.operating_income || 0),
                operatingMarginPercent: parseFloat(summary.operating_margin_percent || 0),
                netIncome: parseFloat(summary.net_income || 0),
                netMarginPercent: parseFloat(summary.net_margin_percent || 0)
            }
        }
    });

}));

/**
 * GET /api/erp-accounting/reports/profit-loss/by-customer
 * GL-based P&L by customer using fn_get_profit_loss_by_customer
 */
router.get('/reports/profit-loss/by-customer', asyncHandler(async (req, res) => {
    const { dateFrom, dateTo } = req.query;

    const today = new Date();
    const defaultFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    const defaultTo = today.toLocaleDateString('en-CA');

    const startDate = (dateFrom as string) || defaultFrom;
    const endDate = (dateTo as string) || defaultTo;

    const pool = req.app.get('pool') as Pool;

    const result = await pool.query(
        'SELECT * FROM fn_get_profit_loss_by_customer($1::DATE, $2::DATE)',
        [startDate, endDate]
    );

    return res.json({
        success: true,
        data: {
            reportType: 'PROFIT_LOSS_BY_CUSTOMER',
            dateFrom: startDate,
            dateTo: endDate,
            generatedAt: new Date().toISOString(),
            customers: result.rows.map(row => ({
                customerId: row.customer_id,
                customerName: row.customer_name,
                totalRevenue: parseFloat(row.total_revenue || 0),
                totalCOGS: parseFloat(row.total_cogs || 0),
                grossProfit: parseFloat(row.gross_profit || 0),
                grossMarginPercent: parseFloat(row.gross_margin_percent || 0),
                transactionCount: parseInt(row.transaction_count || 0)
            })),
            recordCount: result.rows.length
        }
    });

}));

/**
 * GET /api/erp-accounting/reports/profit-loss/by-product
 * GL-based P&L by product using fn_get_profit_loss_by_product
 */
router.get('/reports/profit-loss/by-product', asyncHandler(async (req, res) => {
    const { dateFrom, dateTo } = req.query;

    const today = new Date();
    const defaultFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    const defaultTo = today.toLocaleDateString('en-CA');

    const startDate = (dateFrom as string) || defaultFrom;
    const endDate = (dateTo as string) || defaultTo;

    const pool = req.app.get('pool') as Pool;

    const result = await pool.query(
        'SELECT * FROM fn_get_profit_loss_by_product($1::DATE, $2::DATE)',
        [startDate, endDate]
    );

    return res.json({
        success: true,
        data: {
            reportType: 'PROFIT_LOSS_BY_PRODUCT',
            dateFrom: startDate,
            dateTo: endDate,
            generatedAt: new Date().toISOString(),
            products: result.rows.map(row => ({
                productId: row.product_id,
                productName: row.product_name,
                productSku: row.product_sku,
                totalRevenue: parseFloat(row.total_revenue || 0),
                totalCOGS: parseFloat(row.total_cogs || 0),
                grossProfit: parseFloat(row.gross_profit || 0),
                grossMarginPercent: parseFloat(row.gross_margin_percent || 0),
                quantitySold: parseFloat(row.quantity_sold || 0)
            })),
            recordCount: result.rows.length
        }
    });

}));

/**
 * GET /api/erp-accounting/reports/profit-loss/verify
 * Verify P&L consistency with Trial Balance
 * NOTE: This is a unique ERP function - keeping it
 */
router.get('/reports/profit-loss/verify', asyncHandler(async (req, res) => {
    const { dateFrom, dateTo } = req.query;

    const today = new Date();
    const defaultFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    const defaultTo = today.toLocaleDateString('en-CA');

    const { plService } = withServices(req);

    const result = await plService.verifyProfitLossConsistency(
        (dateFrom as string) || defaultFrom,
        (dateTo as string) || defaultTo
    );

    return res.json({
        success: true,
        data: result
    });

}));

/**
 * GET /api/erp-accounting/reports/profit-loss/comparative
 * Compare P&L across multiple periods using GL data
 */
router.get('/reports/profit-loss/comparative', asyncHandler(async (req, res) => {
    const { periods = '3' } = req.query;
    const numPeriods = Math.min(12, Math.max(1, parseInt(periods as string) || 3));

    const pool = req.app.get('pool') as Pool;
    const comparisons = [];

    const today = new Date();

    // Helper to format date as YYYY-MM-DD without timezone issues
    const formatDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    for (let i = 0; i < numPeriods; i++) {
        // First day of month i months ago
        const periodStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
        // Last day of that month
        const periodEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);

        const startDate = formatDate(periodStart);
        const endDate = formatDate(periodEnd);

        const result = await pool.query(
            'SELECT * FROM fn_get_profit_loss_summary($1::DATE, $2::DATE)',
            [startDate, endDate]
        );

        const summary = result.rows[0] || {};

        comparisons.push({
            period: periodStart.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
            startDate,
            endDate,
            totalRevenue: parseFloat(summary.total_revenue || 0),
            totalCOGS: parseFloat(summary.total_cogs || 0),
            grossProfit: parseFloat(summary.gross_profit || 0),
            grossMarginPercent: parseFloat(summary.gross_margin_percent || 0),
            operatingExpenses: parseFloat(summary.total_operating_expenses || 0),
            netIncome: parseFloat(summary.net_income || 0),
            netMarginPercent: parseFloat(summary.net_margin_percent || 0)
        });
    }

    // Reverse to show oldest first
    comparisons.reverse();

    return res.json({
        success: true,
        data: {
            reportType: 'PROFIT_LOSS_COMPARATIVE',
            generatedAt: new Date().toISOString(),
            periodsCompared: numPeriods,
            comparisons
        }
    });

}));

// =============================================================================
// RECONCILIATION ROUTES
// =============================================================================

/**
 * GET /api/erp-accounting/reconciliation/summary
 * Get full reconciliation summary for all key accounts
 */
router.get('/reconciliation/summary', asyncHandler(async (req, res) => {
    const { asOfDate } = req.query;

    const { reconciliationService } = withServices(req);

    const result = await reconciliationService.getFullReconciliation(asOfDate as string);

    return res.json({
        success: true,
        data: result
    });

}));

/**
 * GET /api/erp-accounting/reconciliation/cash
 * Reconcile Cash account
 */
router.get('/reconciliation/cash', asyncHandler(async (req, res) => {
    const { asOfDate } = req.query;

    const { reconciliationService } = withServices(req);

    const result = await reconciliationService.reconcileCash(asOfDate as string);

    return res.json({
        success: true,
        data: result
    });

}));

/**
 * GET /api/erp-accounting/reconciliation/accounts-receivable
 * Reconcile Accounts Receivable
 */
router.get('/reconciliation/accounts-receivable', asyncHandler(async (req, res) => {
    const { asOfDate } = req.query;

    const { reconciliationService } = withServices(req);

    const result = await reconciliationService.reconcileAccountsReceivable(asOfDate as string);

    return res.json({
        success: true,
        data: result
    });

}));

/**
 * GET /api/erp-accounting/reconciliation/inventory
 * Reconcile Inventory
 */
router.get('/reconciliation/inventory', asyncHandler(async (req, res) => {
    const { asOfDate } = req.query;

    const { reconciliationService } = withServices(req);

    const result = await reconciliationService.reconcileInventory(asOfDate as string);

    return res.json({
        success: true,
        data: result
    });

}));

/**
 * GET /api/erp-accounting/reconciliation/accounts-payable
 * Reconcile Accounts Payable
 */
router.get('/reconciliation/accounts-payable', asyncHandler(async (req, res) => {
    const { asOfDate } = req.query;

    const { reconciliationService } = withServices(req);

    const result = await reconciliationService.reconcileAccountsPayable(asOfDate as string);

    return res.json({
        success: true,
        data: result
    });

}));

/**
 * GET /api/erp-accounting/reconciliation/:accountCode/discrepancies
 * Get detailed discrepancies for an account
 */
router.get('/reconciliation/:accountCode/discrepancies', asyncHandler(async (req, res) => {
    const { accountCode } = req.params;
    const { asOfDate } = req.query;

    const validCodes = ['1200', '2100'];
    if (!validCodes.includes(accountCode)) {
        return res.status(400).json({
            success: false,
            error: `Discrepancy details only available for accounts: ${validCodes.join(', ')}`
        });
    }

    const { reconciliationService } = withServices(req);

    const result = await reconciliationService.getDiscrepancyDetails(
        accountCode,
        asOfDate as string
    );

    return res.json({
        success: true,
        data: result
    });

}));

export default router;
