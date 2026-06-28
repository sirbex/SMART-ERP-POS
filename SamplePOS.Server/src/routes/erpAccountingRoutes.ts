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
import {
  AccountingPeriodService,
  getAccountingPeriodService,
} from '../services/accountingPeriodService.js';
import {
  ProfitLossReportService,
  getProfitLossReportService,
} from '../services/profitLossReportService.js';
import {
  ReconciliationService,
  getReconciliationService,
} from '../services/reconciliationService.js';
import logger from '../utils/logger.js';
import { Money } from '../utils/money.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../rbac/middleware.js';
import { pool as globalPool } from '../db/pool.js';
import { getBusinessDate, formatDateBusiness } from '../utils/dateRange.js';
import {
  deprecateLegacyReconciliation,
  legacyReconciliationMeta,
} from '../modules/financial-reconciliation/legacyReconciliationAudit.js';
import {
  getLegacySurface,
  LEGACY_RECONCILIATION_SURFACES,
} from '../modules/financial-reconciliation/legacyReconciliationRegistry.js';
import {
  compareSqlSummaryToFramework,
  captureFrameworkBaseline,
} from '../modules/financial-reconciliation/reconciliationParityService.js';
import {
  getGovernanceDashboard,
  captureSnapshotWithAlerts,
  buildAuditEvidencePack,
} from '../modules/financial-governance/financialGovernanceService.js';
import {
  listMaterialityConfig,
  upsertMaterialityConfig,
  resolveMaterialityThreshold,
} from '../modules/financial-governance/materialityConfigService.js';
import {
  requestPeriodCloseSignoff,
  reviewPeriodCloseSignoff,
  getApprovedSignoffForPeriod,
} from '../modules/financial-governance/periodCloseSignoffService.js';
import {
  listSnapshotTrend,
  listRecentSnapshots,
} from '../modules/financial-governance/reconciliationSnapshotService.js';
import {
  listOpenAlerts,
  acknowledgeAlert,
} from '../modules/financial-governance/integrityAlertService.js';
import type { FinancialDomain } from '../modules/financial-reconciliation/types.js';

const router = Router();

// All ERP accounting routes require authentication
router.use(authenticate);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const JournalEntryLineSchema = z
  .object({
    accountId: z.string().min(1),
    accountCode: z.string().optional(),
    debitAmount: z.number().nonnegative().optional().default(0),
    creditAmount: z.number().nonnegative().optional().default(0),
    description: z.string().optional(),
    entityType: z.enum(['CUSTOMER', 'SUPPLIER', 'PRODUCT', 'EMPLOYEE']).optional(),
    entityId: z.string().uuid().optional(),
  })
  .refine(
    (data) =>
      (data.debitAmount && data.debitAmount > 0) || (data.creditAmount && data.creditAmount > 0),
    { message: 'Each line must have either a debit or credit amount > 0' }
  );

const CreateJournalEntrySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  narration: z.string().min(1).max(500),
  reference: z.string().max(50).optional(),
  lines: z.array(JournalEntryLineSchema).min(2, 'Journal entry must have at least 2 lines'),
});

const ClosePeriodSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  notes: z.string().optional(),
});

const ReopenPeriodSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
});

const LockPeriodSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

const DateRangeSchema = z.object({
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

// =============================================================================
// MIDDLEWARE
// =============================================================================

// Attach pool from request context (set by parent router)
function withServices(req: Request) {
  const pool = req.tenantPool || globalPool;
  return {
    journalService: getJournalEntryService(pool),
    periodService: getAccountingPeriodService(pool),
    plService: getProfitLossReportService(pool),
    reconciliationService: getReconciliationService(pool),
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
router.post(
  '/journal-entries',
  requirePermission('accounting.create'),
  asyncHandler(async (req, res) => {
    const validation = CreateJournalEntrySchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
      });
    }

    const { journalService } = withServices(req);
    const userId = getUserId(req);

    const result = await journalService.createJournalEntry({
      ...validation.data,
      createdBy: userId,
    });

    logger.info('Journal entry created', {
      entryId: result.id,
      userId,
      amount: result.totalDebit,
    });

    return res.status(201).json({
      success: true,
      data: result,
      message: 'Journal entry created successfully',
    });
  })
);

/**
 * POST /api/erp-accounting/journal-entries/:id/reverse
 * Reverse a journal entry
 */
router.post(
  '/journal-entries/:id/reverse',
  requirePermission('accounting.create'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.length < 5) {
      return res.status(400).json({
        success: false,
        error: 'Reason for reversal is required (min 5 characters)',
      });
    }

    const { journalService } = withServices(req);
    const userId = getUserId(req);

    const result = await journalService.reverseJournalEntry({
      journalEntryId: id,
      reversalDate: getBusinessDate(), // Today's date
      reason,
      reversedBy: userId,
    });

    logger.info('Journal entry reversed', {
      originalId: id,
      reversalId: result.id,
      userId,
    });

    return res.json({
      success: true,
      data: result,
      message: 'Journal entry reversed successfully',
    });
  })
);

/**
 * GET /api/erp-accounting/journal-entries
 * List journal entries with filtering
 */
router.get(
  '/journal-entries',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const { dateFrom, dateTo, status, page = '1', limit = '50' } = req.query;

    const { journalService } = withServices(req);

    const result = await journalService.listJournalEntries({
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      status: status as 'POSTED' | 'REVERSED',
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
    });

    return res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * GET /api/erp-accounting/journal-entries/:id
 * Get journal entry details
 */
router.get(
  '/journal-entries/:id',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { journalService } = withServices(req);

    const result = await journalService.getJournalEntry(id);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Journal entry not found',
      });
    }

    return res.json({
      success: true,
      data: result,
    });
  })
);

// =============================================================================
// PERIOD MANAGEMENT ROUTES
// =============================================================================

/**
 * GET /api/erp-accounting/periods
 * List accounting periods
 */
router.get(
  '/periods',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const { year } = req.query;
    const { periodService } = withServices(req);

    const result = await periodService.getPeriods(year ? parseInt(year as string, 10) : undefined);

    return res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * GET /api/erp-accounting/periods/check-open
 * Check if a specific date is in an open period
 */
router.get(
  '/periods/check-open',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const { date } = req.query;

    if (!date || typeof date !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required (YYYY-MM-DD format)',
      });
    }

    const pool = req.tenantPool || globalPool;
    const result = await pool.query(
      `SELECT status FROM accounting_periods
       WHERE period_year = EXTRACT(YEAR FROM $1::date)::int
         AND period_month = EXTRACT(MONTH FROM $1::date)::int`,
      [date]
    );
    // No period row → implicitly open
    const isOpen = result.rows.length === 0 || result.rows[0].status === 'OPEN';

    return res.json({
      success: true,
      data: {
        date,
        isOpen,
      },
    });
  })
);

/**
 * POST /api/erp-accounting/periods/close
 * Close an accounting period
 */
router.post(
  '/periods/close',
  requirePermission('accounting.period_manage'),
  asyncHandler(async (req, res) => {
    const validation = ClosePeriodSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
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
      closedBy: userId,
    });

    return res.json({
      success: true,
      data: result,
      message: `Period ${validation.data.year}-${String(validation.data.month).padStart(2, '0')} closed successfully`,
    });
  })
);

/**
 * POST /api/erp-accounting/periods/reopen
 * Reopen a closed accounting period
 */
router.post(
  '/periods/reopen',
  requirePermission('accounting.period_manage'),
  asyncHandler(async (req, res) => {
    const validation = ReopenPeriodSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
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
      reason: validation.data.reason,
    });

    return res.json({
      success: true,
      data: result,
      message: `Period ${validation.data.year}-${String(validation.data.month).padStart(2, '0')} reopened`,
    });
  })
);

/**
 * POST /api/erp-accounting/periods/lock
 * Permanently lock an accounting period
 */
router.post(
  '/periods/lock',
  requirePermission('accounting.period_manage'),
  asyncHandler(async (req, res) => {
    const validation = LockPeriodSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
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
      lockedBy: userId,
    });

    return res.json({
      success: true,
      data: result,
      message: `Period ${validation.data.year}-${String(validation.data.month).padStart(2, '0')} permanently locked`,
    });
  })
);

/**
 * GET /api/erp-accounting/periods/:year/:month/history
 * Get period history (audit trail)
 */
router.get(
  '/periods/:year/:month/history',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const year = parseInt(req.params.year, 10);
    const month = parseInt(req.params.month, 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        error: 'Invalid year or month',
      });
    }

    const { periodService } = withServices(req);

    // First get the period to find its ID
    const periods = await periodService.getPeriods();
    const period = periods.find((p) => p.periodYear === year && p.periodMonth === month);

    if (!period) {
      return res.status(404).json({
        success: false,
        error: `Period ${year}-${String(month).padStart(2, '0')} not found`,
      });
    }

    const result = await periodService.getPeriodHistory(period.id);

    return res.json({
      success: true,
      data: result,
    });
  })
);

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
router.get(
  '/reports/profit-loss',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const { dateFrom, dateTo } = req.query;

    const bizToday = getBusinessDate();
    const defaultFrom = bizToday.slice(0, 7) + '-01';
    const defaultTo = bizToday;

    const startDate = (dateFrom as string) || defaultFrom;
    const endDate = (dateTo as string) || defaultTo;

    const pool = req.tenantPool || globalPool;

    // Get detailed P&L by account
    const detailResult = await pool.query('SELECT * FROM fn_get_profit_loss($1::DATE, $2::DATE)', [
      startDate,
      endDate,
    ]);

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
        accounts: detailResult.rows.map((row) => ({
          section: row.section,
          accountCode: row.account_code,
          accountName: row.account_name,
          debitTotal: Money.parseDb(row.debit_total).toNumber(),
          creditTotal: Money.parseDb(row.credit_total).toNumber(),
          netAmount: Money.parseDb(row.net_amount).toNumber(),
          displayAmount: Money.parseDb(row.display_amount).toNumber(),
        })),
        summary: {
          totalRevenue: Money.parseDb(summary.total_revenue).toNumber(),
          totalCOGS: Money.parseDb(summary.total_cogs).toNumber(),
          grossProfit: Money.parseDb(summary.gross_profit).toNumber(),
          grossMarginPercent: Money.parseDb(summary.gross_margin_percent).toNumber(),
          totalOperatingExpenses: Money.parseDb(summary.total_operating_expenses).toNumber(),
          operatingIncome: Money.parseDb(summary.operating_income).toNumber(),
          operatingMarginPercent: Money.parseDb(summary.operating_margin_percent).toNumber(),
          netIncome: Money.parseDb(summary.net_income).toNumber(),
          netMarginPercent: Money.parseDb(summary.net_margin_percent).toNumber(),
        },
      },
    });
  })
);

/**
 * GET /api/erp-accounting/reports/profit-loss/by-customer
 * GL-based P&L by customer using fn_get_profit_loss_by_customer
 */
router.get(
  '/reports/profit-loss/by-customer',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const { dateFrom, dateTo } = req.query;

    const bizToday = getBusinessDate();
    const defaultFrom = bizToday.slice(0, 7) + '-01';
    const defaultTo = bizToday;

    const startDate = (dateFrom as string) || defaultFrom;
    const endDate = (dateTo as string) || defaultTo;

    const pool = req.tenantPool || globalPool;

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
        customers: result.rows.map((row) => ({
          customerId: row.customer_id,
          customerName: row.customer_name,
          totalRevenue: Money.parseDb(row.total_revenue).toNumber(),
          totalCOGS: Money.parseDb(row.total_cogs).toNumber(),
          grossProfit: Money.parseDb(row.gross_profit).toNumber(),
          grossMarginPercent: Money.parseDb(row.gross_margin_percent).toNumber(),
          transactionCount: parseInt(row.transaction_count || '0'),
        })),
        recordCount: result.rows.length,
      },
    });
  })
);

/**
 * GET /api/erp-accounting/reports/profit-loss/by-product
 * GL-based P&L by product using fn_get_profit_loss_by_product
 */
router.get(
  '/reports/profit-loss/by-product',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const { dateFrom, dateTo } = req.query;

    const bizToday = getBusinessDate();
    const defaultFrom = bizToday.slice(0, 7) + '-01';
    const defaultTo = bizToday;

    const startDate = (dateFrom as string) || defaultFrom;
    const endDate = (dateTo as string) || defaultTo;

    const pool = req.tenantPool || globalPool;

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
        products: result.rows.map((row) => ({
          productId: row.product_id,
          productName: row.product_name,
          productSku: row.product_sku,
          totalRevenue: Money.parseDb(row.total_revenue).toNumber(),
          totalCOGS: Money.parseDb(row.total_cogs).toNumber(),
          grossProfit: Money.parseDb(row.gross_profit).toNumber(),
          grossMarginPercent: Money.parseDb(row.gross_margin_percent).toNumber(),
          quantitySold: Money.parseDb(row.quantity_sold).toNumber(),
        })),
        recordCount: result.rows.length,
      },
    });
  })
);

/**
 * GET /api/erp-accounting/reports/profit-loss/verify
 * Verify P&L consistency with Trial Balance
 * NOTE: This is a unique ERP function - keeping it
 */
router.get(
  '/reports/profit-loss/verify',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const { dateFrom, dateTo } = req.query;

    const bizToday = getBusinessDate();
    const defaultFrom = bizToday.slice(0, 7) + '-01';
    const defaultTo = bizToday;

    const { plService } = withServices(req);

    const result = await plService.verifyProfitLossConsistency(
      (dateFrom as string) || defaultFrom,
      (dateTo as string) || defaultTo
    );

    return res.json({
      success: true,
      data: result,
    });
  })
);

/**
 * GET /api/erp-accounting/reports/profit-loss/comparative
 * Compare P&L across multiple periods using GL data
 */
router.get(
  '/reports/profit-loss/comparative',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const { periods = '3' } = req.query;
    const numPeriods = Math.min(12, Math.max(1, parseInt(periods as string) || 3));

    const pool = req.tenantPool || globalPool;
    const comparisons = [];

    // Use business date for correct year/month near midnight
    const bizToday = getBusinessDate();
    const [bizYear, bizMonth] = bizToday.split('-').map(Number);

    for (let i = 0; i < numPeriods; i++) {
      // First day of month i months ago (UTC-safe arithmetic)
      const periodStart = new Date(Date.UTC(bizYear, bizMonth - 1 - i, 1));
      // Last day of that month
      const periodEnd = new Date(Date.UTC(bizYear, bizMonth - i, 0));

      const startDate = formatDateBusiness(periodStart);
      const endDate = formatDateBusiness(periodEnd);

      const result = await pool.query(
        'SELECT * FROM fn_get_profit_loss_summary($1::DATE, $2::DATE)',
        [startDate, endDate]
      );

      const summary = result.rows[0] || {};

      comparisons.push({
        period: `${periodStart.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${periodStart.getUTCFullYear()}`,
        startDate,
        endDate,
        totalRevenue: Money.parseDb(summary.total_revenue).toNumber(),
        totalCOGS: Money.parseDb(summary.total_cogs).toNumber(),
        grossProfit: Money.parseDb(summary.gross_profit).toNumber(),
        grossMarginPercent: Money.parseDb(summary.gross_margin_percent).toNumber(),
        operatingExpenses: Money.parseDb(summary.total_operating_expenses).toNumber(),
        netIncome: Money.parseDb(summary.net_income).toNumber(),
        netMarginPercent: Money.parseDb(summary.net_margin_percent).toNumber(),
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
        comparisons,
      },
    });
  })
);

// =============================================================================
// RECONCILIATION ROUTES
// =============================================================================

/**
 * GET /api/erp-accounting/reconciliation/summary
 * @deprecated Phase F0 — use /financial-health. Framework-authoritative; SQL parity logged.
 */
router.get(
  '/reconciliation/summary',
  requirePermission('accounting.reconcile'),
  deprecateLegacyReconciliation('erp.reconciliation.summary'),
  asyncHandler(async (req, res) => {
    const { asOfDate } = req.query;

    const { reconciliationService } = withServices(req);

    const result = await reconciliationService.getFullReconciliation(asOfDate as string);
    const surface = getLegacySurface('erp.reconciliation.summary');

    return res.json({
      success: true,
      data: result,
      _meta: surface ? legacyReconciliationMeta(surface) : undefined,
    });
  })
);

/**
 * GET /api/erp-accounting/reconciliation/cash
 * @deprecated Phase F0 — Cash lane provider planned.
 */
router.get(
  '/reconciliation/cash',
  requirePermission('accounting.reconcile'),
  deprecateLegacyReconciliation('erp.reconciliation.cash'),
  asyncHandler(async (req, res) => {
    const { asOfDate } = req.query;

    const { reconciliationService } = withServices(req);

    const result = await reconciliationService.reconcileCash(asOfDate as string);
    const surface = getLegacySurface('erp.reconciliation.cash');

    return res.json({
      success: true,
      data: result,
      _meta: surface ? legacyReconciliationMeta(surface) : undefined,
    });
  })
);

/**
 * GET /api/erp-accounting/reconciliation/accounts-receivable
 * @deprecated Phase F0 — use /ar/{integrity,cache,history}.
 */
router.get(
  '/reconciliation/accounts-receivable',
  requirePermission('accounting.reconcile'),
  deprecateLegacyReconciliation('erp.reconciliation.accounts-receivable'),
  asyncHandler(async (req, res) => {
    const { asOfDate } = req.query;

    const { reconciliationService } = withServices(req);

    const result = await reconciliationService.reconcileAccountsReceivable(asOfDate as string);
    const surface = getLegacySurface('erp.reconciliation.accounts-receivable');

    return res.json({
      success: true,
      data: result,
      _meta: surface ? legacyReconciliationMeta(surface) : undefined,
    });
  })
);

/**
 * GET /api/erp-accounting/reconciliation/inventory
 * @deprecated Phase F0 — use /inventory/{integrity,cache,history}.
 */
router.get(
  '/reconciliation/inventory',
  requirePermission('accounting.reconcile'),
  deprecateLegacyReconciliation('erp.reconciliation.inventory'),
  asyncHandler(async (req, res) => {
    const { asOfDate } = req.query;

    const { reconciliationService } = withServices(req);

    const result = await reconciliationService.reconcileInventory(asOfDate as string);
    const surface = getLegacySurface('erp.reconciliation.inventory');

    return res.json({
      success: true,
      data: result,
      _meta: surface ? legacyReconciliationMeta(surface) : undefined,
    });
  })
);

/**
 * GET /api/erp-accounting/reconciliation/accounts-payable
 * @deprecated Phase F0 — use /ap/{integrity,cache,history}.
 */
router.get(
  '/reconciliation/accounts-payable',
  requirePermission('accounting.reconcile'),
  deprecateLegacyReconciliation('erp.reconciliation.accounts-payable'),
  asyncHandler(async (req, res) => {
    const { asOfDate } = req.query;

    const { reconciliationService } = withServices(req);

    const result = await reconciliationService.reconcileAccountsPayable(asOfDate as string);
    const surface = getLegacySurface('erp.reconciliation.accounts-payable');

    return res.json({
      success: true,
      data: result,
      _meta: surface ? legacyReconciliationMeta(surface) : undefined,
    });
  })
);

/**
 * GET /api/erp-accounting/reconciliation/ap/integrity
 * Lane 1 — net-active GL vs open-item (period close gate).
 */
router.get(
  '/reconciliation/ap/integrity',
  requirePermission('accounting.reconcile'),
  asyncHandler(async (req, res) => {
    const { asOfDate } = req.query;
    const { reconciliationService } = withServices(req);
    const result = await reconciliationService.getApIntegrityLane(asOfDate as string);
    return res.json({ success: true, data: result });
  }),
);

/**
 * GET /api/erp-accounting/reconciliation/ap/cache
 * Lane 2 — open-item vs supplier cache (maintenance).
 */
router.get(
  '/reconciliation/ap/cache',
  requirePermission('accounting.reconcile'),
  asyncHandler(async (req, res) => {
    const { asOfDate } = req.query;
    const { reconciliationService } = withServices(req);
    const result = await reconciliationService.getApCacheLane(asOfDate as string);
    return res.json({ success: true, data: result });
  }),
);

/**
 * GET /api/erp-accounting/reconciliation/ap/history
 * Lane 3 — gross posted vs net-active (journal audit, informational).
 */
router.get(
  '/reconciliation/ap/history',
  requirePermission('accounting.reconcile'),
  asyncHandler(async (req, res) => {
    const { asOfDate } = req.query;
    const { reconciliationService } = withServices(req);
    const result = await reconciliationService.getApJournalAuditLane(asOfDate as string);
    return res.json({ success: true, data: result });
  }),
);

/**
 * GET /api/erp-accounting/reconciliation/ar/integrity
 * Lane 1 — net-active GL vs open-item (period close gate).
 */
router.get(
  '/reconciliation/ar/integrity',
  requirePermission('accounting.reconcile'),
  asyncHandler(async (req, res) => {
    const { asOfDate } = req.query;
    const { reconciliationService } = withServices(req);
    const result = await reconciliationService.getArIntegrityLane(asOfDate as string);
    return res.json({ success: true, data: result });
  }),
);

/**
 * GET /api/erp-accounting/reconciliation/ar/cache
 * Lane 2 — open-item vs customer cache (maintenance).
 */
router.get(
  '/reconciliation/ar/cache',
  requirePermission('accounting.reconcile'),
  asyncHandler(async (req, res) => {
    const { asOfDate } = req.query;
    const { reconciliationService } = withServices(req);
    const result = await reconciliationService.getArCacheLane(asOfDate as string);
    return res.json({ success: true, data: result });
  }),
);

/**
 * GET /api/erp-accounting/reconciliation/ar/history
 * Lane 3 — gross posted vs net-active (journal audit, informational).
 */
router.get(
  '/reconciliation/ar/history',
  requirePermission('accounting.reconcile'),
  asyncHandler(async (req, res) => {
    const { asOfDate } = req.query;
    const { reconciliationService } = withServices(req);
    const result = await reconciliationService.getArJournalAuditLane(asOfDate as string);
    return res.json({ success: true, data: result });
  }),
);

/**
 * GET /api/erp-accounting/reconciliation/inventory/integrity
 * Lane 1 — net-active GL vs batch subledger (period close gate).
 */
router.get(
  '/reconciliation/inventory/integrity',
  requirePermission('accounting.reconcile'),
  asyncHandler(async (req, res) => {
    const { asOfDate } = req.query;
    const { reconciliationService } = withServices(req);
    const result = await reconciliationService.getInventoryIntegrityLane(asOfDate as string);
    return res.json({ success: true, data: result });
  }),
);

/**
 * GET /api/erp-accounting/reconciliation/inventory/cache
 * Lane 2 — batch subledger vs product cache (maintenance).
 */
router.get(
  '/reconciliation/inventory/cache',
  requirePermission('accounting.reconcile'),
  asyncHandler(async (req, res) => {
    const { asOfDate } = req.query;
    const { reconciliationService } = withServices(req);
    const result = await reconciliationService.getInventoryCacheLane(asOfDate as string);
    return res.json({ success: true, data: result });
  }),
);

/**
 * GET /api/erp-accounting/reconciliation/inventory/history
 * Lane 3 — gross posted vs net-active (journal audit, informational).
 */
router.get(
  '/reconciliation/inventory/history',
  requirePermission('accounting.reconcile'),
  asyncHandler(async (req, res) => {
    const { asOfDate } = req.query;
    const { reconciliationService } = withServices(req);
    const result = await reconciliationService.getInventoryJournalAuditLane(asOfDate as string);
    return res.json({ success: true, data: result });
  }),
);

/**
 * GET /api/erp-accounting/reconciliation/lanes/:domain/:lane
 * Generic financial lane resolver (ap | ar | inventory | cash).
 */
router.get(
  '/reconciliation/lanes/:domain/:lane',
  requirePermission('accounting.reconcile'),
  asyncHandler(async (req, res) => {
    const { domain, lane } = req.params;
    const { asOfDate } = req.query;
    const { reconciliationService } = withServices(req);
    const result = await reconciliationService.getFinancialLane(
      domain as 'ap' | 'ar' | 'inventory' | 'cash',
      lane as 'integrity' | 'cache' | 'history',
      asOfDate as string,
    );
    return res.json({ success: true, data: result });
  }),
);

/**
 * GET /api/erp-accounting/reconciliation/financial-health
 * Aggregated lane status for all registered domains (read-only).
 */
router.get(
  '/reconciliation/financial-health',
  requirePermission('accounting.reconcile'),
  asyncHandler(async (req, res) => {
    const { asOfDate } = req.query;
    const { reconciliationService } = withServices(req);
    const result = await reconciliationService.getFinancialHealthSummary(asOfDate as string);
    res.setHeader('X-Reconciliation-Framework', 'authoritative');
    return res.json({ success: true, data: result });
  }),
);

/**
 * GET /api/erp-accounting/reconciliation/:accountCode/discrepancies
 * @deprecated Phase F0 — use lane exception tables on domain integrity/cache routes.
 */
router.get(
  '/reconciliation/:accountCode/discrepancies',
  requirePermission('accounting.reconcile'),
  deprecateLegacyReconciliation('erp.reconciliation.discrepancies'),
  asyncHandler(async (req, res) => {
    const { accountCode } = req.params;
    const { asOfDate } = req.query;

    const validCodes = ['1200', '2100'];
    if (!validCodes.includes(accountCode)) {
      return res.status(400).json({
        success: false,
        error: `Discrepancy details only available for accounts: ${validCodes.join(', ')}`,
      });
    }

    const { reconciliationService } = withServices(req);

    const result = await reconciliationService.getDiscrepancyDetails(
      accountCode,
      asOfDate as string
    );

    return res.json({
      success: true,
      data: result,
      _meta: legacyReconciliationMeta(getLegacySurface('erp.reconciliation.discrepancies')!),
    });
  })
);

/**
 * GET /api/erp-accounting/reconciliation/stabilization/consumer-audit
 * Phase F0 — read-only catalog of legacy surfaces and their successors.
 */
router.get(
  '/reconciliation/stabilization/consumer-audit',
  requirePermission('accounting.reconcile'),
  asyncHandler(async (_req, res) => {
    return res.json({
      success: true,
      data: {
        phase: 'F0',
        authoritative: 'financial-lane-framework',
        surfaces: LEGACY_RECONCILIATION_SURFACES,
      },
    });
  }),
);

/**
 * GET /api/erp-accounting/reconciliation/stabilization/parity
 * Phase F0 — compare fn_full_reconciliation_report vs framework lanes.
 */
router.get(
  '/reconciliation/stabilization/parity',
  requirePermission('accounting.reconcile'),
  asyncHandler(async (req, res) => {
    const { asOfDate } = req.query;
    const pool = req.tenantPool || globalPool;
    const date = (asOfDate as string) || getBusinessDate();
    const [parity, baseline] = await Promise.all([
      compareSqlSummaryToFramework(pool, date),
      captureFrameworkBaseline(pool, date),
    ]);
    return res.json({
      success: true,
      data: { parity, baseline },
    });
  }),
);

// =============================================================================
// Financial Governance (Phase G1) — builds on integrity framework
// =============================================================================

/**
 * GET /api/erp-accounting/reconciliation/governance/dashboard
 */
router.get(
  '/reconciliation/governance/dashboard',
  requirePermission('accounting.reconcile'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const data = await getGovernanceDashboard(pool);
    return res.json({ success: true, data });
  }),
);

/**
 * GET /api/erp-accounting/reconciliation/governance/materiality
 */
router.get(
  '/reconciliation/governance/materiality',
  requirePermission('accounting.reconcile'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const data = await listMaterialityConfig(pool);
    return res.json({ success: true, data });
  }),
);

/**
 * PUT /api/erp-accounting/reconciliation/governance/materiality/:domain
 */
router.put(
  '/reconciliation/governance/materiality/:domain',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const domain = req.params.domain as FinancialDomain;
    const { mode, exactTolerance, percentRate, floorAmount, capAmount, notes } = req.body;
    const data = await upsertMaterialityConfig(pool, domain, {
      mode,
      exactTolerance,
      percentRate,
      floorAmount,
      capAmount,
      notes,
      updatedBy: req.user!.id,
    });
    return res.json({ success: true, data });
  }),
);

/**
 * GET /api/erp-accounting/reconciliation/governance/materiality/:domain/resolve
 */
router.get(
  '/reconciliation/governance/materiality/:domain/resolve',
  requirePermission('accounting.reconcile'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const domain = req.params.domain as FinancialDomain;
    const glBalance = Number(req.query.glBalance ?? 0);
    const data = await resolveMaterialityThreshold(pool, domain, glBalance);
    return res.json({ success: true, data });
  }),
);

/**
 * POST /api/erp-accounting/reconciliation/governance/snapshots
 */
router.post(
  '/reconciliation/governance/snapshots',
  requirePermission('accounting.reconcile'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const { asOfDate, captureSource, periodYear, periodMonth, frameworkCommit } = req.body;
    const date = asOfDate || getBusinessDate();
    const result = await captureSnapshotWithAlerts(pool, {
      asOfDate: date,
      captureSource: captureSource ?? 'manual',
      periodYear,
      periodMonth,
      frameworkCommit,
      createdBy: req.user?.id,
      includeParity: true,
    });
    return res.status(201).json({ success: true, data: result });
  }),
);

/**
 * GET /api/erp-accounting/reconciliation/governance/snapshots
 */
router.get(
  '/reconciliation/governance/snapshots',
  requirePermission('accounting.reconcile'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const limit = Number(req.query.limit ?? 30);
    const data = await listRecentSnapshots(pool, limit);
    return res.json({ success: true, data });
  }),
);

/**
 * GET /api/erp-accounting/reconciliation/governance/trends/:domain
 */
router.get(
  '/reconciliation/governance/trends/:domain',
  requirePermission('accounting.reconcile'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const days = Number(req.query.days ?? 90);
    const data = await listSnapshotTrend(pool, req.params.domain, days);
    return res.json({ success: true, data });
  }),
);

/**
 * GET /api/erp-accounting/reconciliation/governance/alerts
 */
router.get(
  '/reconciliation/governance/alerts',
  requirePermission('accounting.reconcile'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const data = await listOpenAlerts(pool);
    return res.json({ success: true, data });
  }),
);

/**
 * POST /api/erp-accounting/reconciliation/governance/alerts/:id/acknowledge
 */
router.post(
  '/reconciliation/governance/alerts/:id/acknowledge',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const data = await acknowledgeAlert(pool, req.params.id, req.user!.id);
    if (!data) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }
    return res.json({ success: true, data });
  }),
);

/**
 * POST /api/erp-accounting/reconciliation/governance/signoffs
 */
router.post(
  '/reconciliation/governance/signoffs',
  requirePermission('accounting.period_manage'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const { periodYear, periodMonth, snapshotId, attestation } = req.body;
    const data = await requestPeriodCloseSignoff(pool, {
      periodYear,
      periodMonth,
      snapshotId,
      attestation,
      requestedBy: req.user!.id,
    });
    return res.status(201).json({ success: true, data });
  }),
);

/**
 * POST /api/erp-accounting/reconciliation/governance/signoffs/:id/review
 */
router.post(
  '/reconciliation/governance/signoffs/:id/review',
  requirePermission('accounting.approve'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const { status, reviewNotes } = req.body;
    const data = await reviewPeriodCloseSignoff(pool, {
      signoffId: req.params.id,
      status,
      reviewedBy: req.user!.id,
      reviewNotes,
    });
    return res.json({ success: true, data });
  }),
);

/**
 * GET /api/erp-accounting/reconciliation/governance/signoffs/:year/:month
 */
router.get(
  '/reconciliation/governance/signoffs/:year/:month',
  requirePermission('accounting.reconcile'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const data = await getApprovedSignoffForPeriod(
      pool,
      Number(req.params.year),
      Number(req.params.month),
    );
    return res.json({ success: true, data });
  }),
);

/**
 * GET /api/erp-accounting/reconciliation/governance/evidence/:snapshotId
 * Audit evidence pack for a captured snapshot.
 */
router.get(
  '/reconciliation/governance/evidence/:snapshotId',
  requirePermission('accounting.export'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const data = await buildAuditEvidencePack(pool, req.params.snapshotId);
    return res.json({ success: true, data });
  }),
);

export default router;
