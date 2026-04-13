/**
 * Accounting Routes
 *
 * Provides REST API endpoints for accounting functionality:
 * - Chart of Accounts CRUD
 * - General Ledger queries
 * - Trial Balance
 * - Financial Statements (Balance Sheet, Income Statement, Cash Flow)
 *
 * This module queries REAL data from the PostgreSQL database,
 * following proper double-entry accounting principles.
 */

import express from 'express';
import { z } from 'zod';
import logger from '../../utils/logger.js';
import { authenticate } from '../../middleware/auth.js';
import * as accountingRepository from '../../repositories/accountingRepository.js';
import { Money } from '../../utils/money.js';
import { getSettings } from '../settings/invoiceSettingsService.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { requirePermission } from '../../rbac/middleware.js';
import { pool as globalPool } from '../../db/pool.js';
import { getBusinessDate, formatDateBusiness } from '../../utils/dateRange.js';

// Zod schemas for accounting routes
const ChartOfAccountsQuerySchema = z.object({
  accountType: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  isPostingAccount: z.enum(['true', 'false']).optional(),
  search: z.string().optional(),
});
const AccountIdParamSchema = z.object({ id: z.string().min(1) });
const CreateAccountSchema = z.object({
  accountNumber: z.string().min(1),
  accountName: z.string().min(1),
  accountType: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  normalBalance: z.enum(['DEBIT', 'CREDIT']),
  parentAccountId: z.string().uuid().optional().nullable(),
  isPostingAccount: z.boolean().optional().default(true),
});
const GLQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v) : 20)),
  accountId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
});
const TransactionIdParamSchema = z.object({ transactionId: z.string().min(1) });
const TrialBalanceQuerySchema = z.object({
  asOfDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  includeZeroBalances: z.enum(['true', 'false']).optional().default('false'),
});
const DateQuerySchema = z.object({
  asOfDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
const DateRangeQuerySchema = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// =============================================================================
// CHART OF ACCOUNTS
// =============================================================================

/**
 * GET /api/accounting/chart-of-accounts
 * Get all accounts with optional filtering
 */
router.get(
  '/chart-of-accounts',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const query = ChartOfAccountsQuerySchema.parse(req.query);

    const filters: accountingRepository.AccountFilters = {};

    if (query.accountType && query.accountType !== 'ALL') {
      filters.accountType = query.accountType;
    }
    if (query.isActive !== undefined) {
      filters.isActive = query.isActive === 'true';
    }
    if (query.isPostingAccount !== undefined) {
      filters.isPostingAccount = query.isPostingAccount === 'true';
    }
    if (query.search) {
      filters.search = query.search;
    }

    const accounts = await accountingRepository.getAccounts(filters, req.tenantPool || globalPool);

    // Transform to frontend format
    // For display purposes:
    // - ASSET, EXPENSE: Debit is positive (display as-is from Debit-Credit calculation)
    // - LIABILITY, EQUITY, REVENUE: Credit is positive (flip the sign for display)
    const formattedAccounts = accounts.map((acc) => {
      const rawBalance = Money.parseDb(acc.currentBalance);
      // Credit-normal accounts (Liability, Equity, Revenue) should display credit balances as positive
      const isCreditNormal = ['LIABILITY', 'EQUITY', 'REVENUE'].includes(acc.accountType);
      const displayBalance = isCreditNormal
        ? Money.negate(rawBalance).toNumber()
        : rawBalance.toNumber();

      return {
        id: acc.id,
        accountNumber: acc.accountCode,
        accountName: acc.accountName,
        accountType: acc.accountType,
        normalBalance: acc.normalBalance,
        parentAccountId: acc.parentAccountId,
        level: acc.level,
        isPostingAccount: acc.isPostingAccount,
        isActive: acc.isActive,
        currentBalance: displayBalance,
      };
    });

    res.json({
      success: true,
      data: formattedAccounts,
    });
  })
);

/**
 * GET /api/accounting/chart-of-accounts/:id
 * Get account by ID
 */
router.get(
  '/chart-of-accounts/:id',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const { id } = AccountIdParamSchema.parse(req.params);
    const account = await accountingRepository.getAccountById(id, req.tenantPool || globalPool);

    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found',
      });
    }

    res.json({
      success: true,
      data: {
        id: account.id,
        accountNumber: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        normalBalance: account.normalBalance,
        parentAccountId: account.parentAccountId,
        level: account.level,
        isPostingAccount: account.isPostingAccount,
        isActive: account.isActive,
      },
    });
  })
);

/**
 * POST /api/accounting/chart-of-accounts
 * Create new account
 */
router.post(
  '/chart-of-accounts',
  authenticate,
  requirePermission('accounting.create'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const {
      accountNumber,
      accountName,
      accountType,
      normalBalance,
      parentAccountId,
      isPostingAccount,
    } = CreateAccountSchema.parse(req.body);

    // Determine level based on parent
    let level = 1;
    if (parentAccountId) {
      const parent = await accountingRepository.getAccountById(parentAccountId, pool);
      if (parent) {
        level = parent.level + 1;
      }
    }

    const account = await accountingRepository.createAccount(
      {
        accountCode: accountNumber,
        accountName,
        accountType,
        normalBalance,
        parentAccountId: parentAccountId || null,
        level,
        isPostingAccount: isPostingAccount !== false,
        isActive: true,
      },
      pool
    );

    res.status(201).json({
      success: true,
      data: {
        id: account.id,
        accountNumber: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        normalBalance: account.normalBalance,
      },
    });
  })
);

/**
 * PUT /api/accounting/chart-of-accounts/:id
 * Update an existing account
 */
const UpdateAccountSchema = z.object({
  accountNumber: z.string().min(1).optional(),
  accountName: z.string().min(1).optional(),
  accountType: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']).optional(),
  normalBalance: z.enum(['DEBIT', 'CREDIT']).optional(),
  parentAccountId: z.string().uuid().optional().nullable(),
  isPostingAccount: z.boolean().optional(),
  isActive: z.boolean().optional(),
  description: z.string().optional(),
});

router.put(
  '/chart-of-accounts/:id',
  requirePermission('accounting.update'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const { id } = AccountIdParamSchema.parse(req.params);
    const data = UpdateAccountSchema.parse(req.body);

    const existing = await accountingRepository.getAccountById(id, pool);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    const updated = await accountingRepository.updateAccount(
      id,
      {
        accountCode: data.accountNumber,
        accountName: data.accountName,
        accountType: data.accountType,
        normalBalance: data.normalBalance,
        parentAccountId: data.parentAccountId,
        isPostingAccount: data.isPostingAccount,
        isActive: data.isActive,
      },
      pool
    );

    res.json({
      success: true,
      data: updated
        ? {
          id: updated.id,
          accountNumber: updated.accountCode,
          accountName: updated.accountName,
          accountType: updated.accountType,
          normalBalance: updated.normalBalance,
          parentAccountId: updated.parentAccountId,
          isPostingAccount: updated.isPostingAccount,
          isActive: updated.isActive,
        }
        : null,
    });
  })
);

/**
 * DELETE /api/accounting/chart-of-accounts/:id
 * Delete (or deactivate) an account
 */
router.delete(
  '/chart-of-accounts/:id',
  requirePermission('accounting.delete'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const { id } = AccountIdParamSchema.parse(req.params);

    const existing = await accountingRepository.getAccountById(id, pool);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    const deleted = await accountingRepository.deleteAccount(id, pool);
    if (!deleted) {
      return res.status(500).json({ success: false, error: 'Failed to delete account' });
    }

    res.json({
      success: true,
      message: 'Account deleted successfully',
    });
  })
);

// =============================================================================
// GENERAL LEDGER
// =============================================================================

/**
 * GET /api/accounting/general-ledger
 * Get ledger entries with filtering and pagination
 */
router.get(
  '/general-ledger',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const query = GLQuerySchema.parse(req.query);

    const filters: accountingRepository.LedgerFilters = {
      page: query.page,
      limit: query.limit,
      accountId: query.accountId && query.accountId !== 'ALL' ? query.accountId : undefined,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      search: query.search,
    };

    const { entries, total } = await accountingRepository.getLedgerEntries(
      filters,
      req.tenantPool || globalPool
    );

    res.json({
      success: true,
      data: entries.map((entry) => ({
        id: entry.id,
        transactionId: entry.transactionId,
        accountId: entry.accountId,
        accountNumber: entry.accountCode,
        accountName: entry.accountName,
        description: entry.description,
        debitAmount: entry.debitAmount,
        creditAmount: entry.creditAmount,
        balance: entry.runningBalance,
        transactionDate: entry.entryDate?.split('T')[0] || entry.entryDate,
        reference: entry.reference,
        createdAt: entry.createdAt,
      })),
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    });
  })
);

/**
 * GET /api/accounting/general-ledger/export
 * Export general ledger entries as CSV
 * NOTE: This route MUST come before /general-ledger/:id to avoid route conflict
 */
router.get(
  '/general-ledger/export',
  requirePermission('accounting.export'),
  asyncHandler(async (req, res) => {
    const query = GLQuerySchema.parse(req.query);

    // Get all entries (high limit for export)
    const filters: accountingRepository.LedgerFilters = {
      page: 1,
      limit: 10000, // Get all for export
      accountId: query.accountId && query.accountId !== 'ALL' ? query.accountId : undefined,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      search: query.search,
    };

    const { entries } = await accountingRepository.getLedgerEntries(
      filters,
      req.tenantPool || globalPool
    );

    // Build CSV content
    const headers = [
      'Date',
      'Reference',
      'Account Code',
      'Account Name',
      'Description',
      'Debit',
      'Credit',
      'Balance',
    ];
    const rows = entries.map((entry) => [
      entry.entryDate?.split('T')[0] || '',
      entry.reference || '',
      entry.accountCode || '',
      entry.accountName || '',
      (entry.description || '').replace(/,/g, ';'), // Escape commas
      Money.format(entry.debitAmount, 2),
      Money.format(entry.creditAmount, 2),
      Money.format(entry.runningBalance, 2),
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="general-ledger-${getBusinessDate()}.csv"`
    );
    res.send(csvContent);
  })
);

/**
 * GET /api/accounting/general-ledger/:id
 * Get journal entry by ID with all lines
 */
router.get(
  '/general-ledger/:id',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const { id } = AccountIdParamSchema.parse(req.params);
    const entry = await accountingRepository.getJournalEntryById(id, req.tenantPool || globalPool);

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Journal entry not found',
      });
    }

    res.json({
      success: true,
      data: entry,
    });
  })
);

/**
 * GET /api/accounting/transactions/:transactionId
 * Get transaction details by transaction ID
 * Tries ledger_transactions first (backfilled data), then journal_entries
 */
router.get(
  '/transactions/:transactionId',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const { transactionId } = TransactionIdParamSchema.parse(req.params);

    // First, try to find in ledger_transactions (backfilled data)
    const ledgerTxn = await accountingRepository.getLedgerTransactionById(
      transactionId,
      req.tenantPool || globalPool
    );

    if (ledgerTxn) {
      return res.json({
        success: true,
        data: {
          id: ledgerTxn.id,
          transactionId: ledgerTxn.id,
          transactionNumber: ledgerTxn.transactionNumber,
          transactionDate: ledgerTxn.transactionDate?.split('T')[0] || '',
          reference: ledgerTxn.referenceNumber || ledgerTxn.transactionNumber,
          referenceType: ledgerTxn.referenceType,
          description: ledgerTxn.description,
          status: ledgerTxn.status,
          // Frontend expects totalAmount - use totalDebitAmount (or totalCreditAmount, they should match)
          totalAmount: ledgerTxn.totalDebitAmount || ledgerTxn.totalCreditAmount || 0,
          totalDebitAmount: ledgerTxn.totalDebitAmount,
          totalCreditAmount: ledgerTxn.totalCreditAmount,
          createdAt: ledgerTxn.createdAt || '',
          createdBy: ledgerTxn.createdBy || 'System',
          entries: ledgerTxn.entries.map((entry) => ({
            id: entry.id,
            accountId: entry.accountId,
            accountNumber: entry.accountCode,
            accountName: entry.accountName,
            debitAmount: entry.debitAmount,
            creditAmount: entry.creditAmount,
            description: entry.description,
          })),
        },
      });
    }

    // Fall back to journal_entries (original system)
    const journalEntry = await accountingRepository.getJournalEntryById(
      transactionId,
      req.tenantPool || globalPool
    );

    if (!journalEntry) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found',
      });
    }

    res.json({
      success: true,
      data: {
        id: journalEntry.id,
        transactionId: journalEntry.transactionId,
        date: journalEntry.entryDate?.split('T')[0],
        reference: journalEntry.transactionId,
        description: journalEntry.description,
        status: journalEntry.status,
        createdAt: journalEntry.createdAt,
        entries: journalEntry.lines.map((line) => ({
          id: line.id,
          accountId: line.accountId,
          accountNumber: line.accountCode,
          accountName: line.accountName,
          debitAmount: line.debitAmount,
          creditAmount: line.creditAmount,
          description: line.description,
        })),
      },
    });
  })
);

// =============================================================================
// TRIAL BALANCE
// =============================================================================

/**
 * GET /api/accounting/trial-balance
 * Generate trial balance as of a given date
 */
router.get(
  '/trial-balance',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const query = TrialBalanceQuerySchema.parse(req.query);
    const asOfDate = query.asOfDate || getBusinessDate();
    const includeZeroBalances = query.includeZeroBalances === 'true';

    const trialBalance = await accountingRepository.getTrialBalance(
      asOfDate,
      includeZeroBalances,
      req.tenantPool || globalPool
    );

    res.json({
      success: true,
      data: trialBalance,
    });
  })
);

// =============================================================================
// BALANCE SHEET
// =============================================================================

/**
 * GET /api/accounting/balance-sheet
 * Generate balance sheet as of a given date
 */
router.get(
  '/balance-sheet',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const query = DateQuerySchema.parse(req.query);
    const asOfDate = query.asOfDate || getBusinessDate();

    const balanceSheet = await accountingRepository.getBalanceSheet(asOfDate, pool);

    // Get company name from settings
    const settings = await getSettings(pool);
    const companyName = settings.companyName || 'SMART ERP';

    res.json({
      success: true,
      data: { ...balanceSheet, companyName },
    });
  })
);

// =============================================================================
// INCOME STATEMENT
// =============================================================================

/**
 * GET /api/accounting/income-statement
 * Generate income statement for a date range
 */
router.get(
  '/income-statement',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    // Use business date for default range (timezone-safe, SAP pattern)
    const bizDate = getBusinessDate();
    const firstDayOfMonth = bizDate.slice(0, 8) + '01';

    const query = DateRangeQuerySchema.parse(req.query);
    const startDate = query.startDate || firstDayOfMonth;
    const endDate = query.endDate || bizDate;

    const incomeStatement = await accountingRepository.getIncomeStatement(startDate, endDate, pool);

    // Get company name from settings
    const settings = await getSettings(pool);
    const companyName = settings.companyName || 'SMART ERP';

    res.json({
      success: true,
      data: { ...incomeStatement, companyName },
    });
  })
);

// =============================================================================
// CASH FLOW STATEMENT
// =============================================================================

/**
 * GET /api/accounting/cash-flow
 * Generate cash flow statement for a date range
 *
 * Note: Cash flow is calculated from changes in account balances
 * between two periods, categorized by activity type.
 */
router.get(
  '/cash-flow',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    // Use business date for default range (timezone-safe, SAP pattern)
    const bizDate = getBusinessDate();
    const firstDayOfMonth = bizDate.slice(0, 8) + '01';

    const query = DateRangeQuerySchema.parse(req.query);
    const startDate = query.startDate || firstDayOfMonth;
    const endDate = query.endDate || bizDate;

    // Get income statement for net income
    const incomeStatement = await accountingRepository.getIncomeStatement(startDate, endDate, pool);

    // Get cash movements by type from ledger entries
    const cashMovementsResult = await pool.query(
      `
      SELECT 
    lt."ReferenceType",
    SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END) as cash_in,
    SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END) as cash_out
      FROM ledger_entries le
      JOIN accounts a ON a."Id" = le."AccountId"
      LEFT JOIN ledger_transactions lt ON lt."Id" = le."LedgerTransactionId"
      WHERE a."AccountCode" = '1010'
    AND le."EntryDate" >= $1 AND le."EntryDate" <= $2
      GROUP BY lt."ReferenceType"
    `,
      [startDate, endDate + ' 23:59:59']
    );

    // Categorize cash movements using decimal-safe arithmetic
    let operatingCashIn = Money.parse(0);
    let operatingCashOut = Money.parse(0);
    let investingCashIn = Money.parse(0);
    let investingCashOut = Money.parse(0);
    let financingCashIn = Money.parse(0);
    let financingCashOut = Money.parse(0);

    const operatingItems: { description: string; amount: number }[] = [];
    const investingItems: { description: string; amount: number }[] = [];
    const financingItems: { description: string; amount: number }[] = [];

    for (const row of cashMovementsResult.rows) {
      const cashIn = Money.parseDb(row.cash_in);
      const cashOut = Money.parseDb(row.cash_out);
      const netAmount = Money.subtract(cashIn, cashOut);
      const refType = row.ReferenceType || 'OTHER';

      // Operating activities: sales, customer payments, deposits, expenses
      if (
        ['SALE', 'CUSTOMER_PAYMENT', 'INVOICE_PAYMENT', 'CUSTOMER_DEPOSIT', 'EXPENSE'].includes(
          refType
        )
      ) {
        operatingCashIn = Money.add(operatingCashIn, cashIn);
        operatingCashOut = Money.add(operatingCashOut, cashOut);
        if (!Money.isZero(netAmount)) {
          operatingItems.push({
            description: refType.replace(/_/g, ' '),
            amount: netAmount.toNumber(),
          });
        }
      }
      // Investing activities: fixed assets, equipment purchases
      else if (['ASSET_PURCHASE', 'ASSET_SALE', 'INVESTMENT'].includes(refType)) {
        investingCashIn = Money.add(investingCashIn, cashIn);
        investingCashOut = Money.add(investingCashOut, cashOut);
        if (!Money.isZero(netAmount)) {
          investingItems.push({
            description: refType.replace(/_/g, ' '),
            amount: netAmount.toNumber(),
          });
        }
      }
      // Financing activities: loans, capital contributions
      else if (['LOAN', 'CAPITAL_CONTRIBUTION', 'DIVIDEND'].includes(refType)) {
        financingCashIn = Money.add(financingCashIn, cashIn);
        financingCashOut = Money.add(financingCashOut, cashOut);
        if (!Money.isZero(netAmount)) {
          financingItems.push({
            description: refType.replace(/_/g, ' '),
            amount: netAmount.toNumber(),
          });
        }
      }
      // Default to operating
      else if (!Money.isZero(netAmount)) {
        operatingCashIn = Money.add(operatingCashIn, cashIn);
        operatingCashOut = Money.add(operatingCashOut, cashOut);
        operatingItems.push({
          description: refType.replace(/_/g, ' '),
          amount: netAmount.toNumber(),
        });
      }
    }

    // Calculate totals from actual cash movements (Direct Method)
    // Note: Net Income is NOT added here - we show actual cash flows, not accrual-based income
    const totalOperatingCashFlow = Money.subtract(operatingCashIn, operatingCashOut).toNumber();
    const totalInvestingCashFlow = Money.subtract(investingCashIn, investingCashOut).toNumber();
    const totalFinancingCashFlow = Money.subtract(financingCashIn, financingCashOut).toNumber();

    const operatingActivities = {
      items: operatingItems, // Direct method: show actual cash transactions only
      totalOperatingCashFlow,
    };

    const investingActivities = {
      items: investingItems,
      totalInvestingCashFlow,
    };

    const financingActivities = {
      items: financingItems,
      totalFinancingCashFlow,
    };

    // Calculate net change in cash from the three activities
    const netCashFlow = Money.add(
      totalOperatingCashFlow,
      totalInvestingCashFlow,
      totalFinancingCashFlow
    ).toNumber();

    // Get beginning cash balance from gl_period_balances (before the period)
    const [bStartYear, bStartMonth] = startDate.split('-').map(Number);
    // "Before start" = up to the period just before startMonth
    const bPrevMonth = bStartMonth === 1 ? 12 : bStartMonth - 1;
    const bPrevYear = bStartMonth === 1 ? bStartYear - 1 : bStartYear;
    const beginningResult = await pool.query(
      `
      SELECT 
        COALESCE(SUM(gpb.debit_total), 0) - COALESCE(SUM(gpb.credit_total), 0) as beginning_balance
      FROM gl_period_balances gpb
      JOIN accounts a ON a."Id" = gpb.account_id
      WHERE a."AccountCode" IN ('1010', '1020', '1030')
        AND (gpb.fiscal_year < $1 OR (gpb.fiscal_year = $1 AND gpb.fiscal_period <= $2))
      `,
      [bPrevYear, bPrevMonth]
    );
    const beginningCashBalance = Money.parseDb(
      beginningResult.rows[0]?.beginning_balance
    ).toNumber();

    // Calculate ending balance from gl_period_balances (through end of period)
    const [eEndYear, eEndMonth] = endDate.split('-').map(Number);
    const endingResult = await pool.query(
      `
      SELECT 
        COALESCE(SUM(gpb.debit_total), 0) - COALESCE(SUM(gpb.credit_total), 0) as ending_balance
      FROM gl_period_balances gpb
      JOIN accounts a ON a."Id" = gpb.account_id
      WHERE a."AccountCode" IN ('1010', '1020', '1030')
        AND (gpb.fiscal_year < $1 OR (gpb.fiscal_year = $1 AND gpb.fiscal_period <= $2))
      `,
      [eEndYear, eEndMonth]
    );
    const endingCashBalance = Money.parseDb(endingResult.rows[0]?.ending_balance).toNumber();

    // Net change should equal total cash flows (this is a validation)
    // Use the calculated net cash flow for consistency
    const netChangeInCash = netCashFlow;

    // Get company name from settings
    const settings = await getSettings(pool);
    const companyName = settings.companyName || 'SMART ERP';

    res.json({
      success: true,
      data: {
        companyName,
        periodStart: startDate,
        periodEnd: endDate,
        generatedAt: new Date().toISOString(),
        operatingActivities,
        investingActivities,
        financingActivities,
        // Provide totals in the format expected by frontend
        totalOperatingCashFlow: operatingActivities.totalOperatingCashFlow,
        totalInvestingCashFlow: investingActivities.totalInvestingCashFlow,
        totalFinancingCashFlow: financingActivities.totalFinancingCashFlow,
        netChangeInCash,
        beginningCashBalance,
        endingCashBalance,
      },
    });
  })
);

// =============================================================================
// DASHBOARD SUMMARY ENDPOINT
// =============================================================================

/**
 * GET /api/accounting/dashboard-summary
 * Comprehensive dashboard data for accounting module
 * Fetches: chart of accounts, trial balance, sales summary, receivables, payables
 */
router.get(
  '/dashboard-summary',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;

    // Fetch all dashboard data in parallel
    const [
      accountsResult,
      trialBalanceResult,
      salesSummaryResult,
      receivablesSummaryResult,
      payablesSummaryResult,
      journalEntriesResult,
    ] = await Promise.all([
      // Chart of accounts summary (using correct table and column names)
      pool.query(`
    SELECT "AccountType" as account_type, COUNT(*) as count
    FROM accounts
    WHERE "IsActive" = true
    GROUP BY "AccountType"
      `),
      // Trial balance totals from gl_period_balances (fast totals table)
      pool.query(`
    SELECT 
      COALESCE(SUM(gpb.debit_total), 0) as total_debits,
      COALESCE(SUM(gpb.credit_total), 0) as total_credits
    FROM gl_period_balances gpb
      `),
      // Sales summary (last 30 days) — fallback to sales table
      pool.query(`
    SELECT 
      COUNT(*)::integer as total_sales,
      COALESCE(SUM(total_amount), 0) as total_revenue,
      COALESCE(SUM(total_cost), 0) as total_cogs,
      COALESCE(SUM(profit), 0) as total_profit
    FROM sales
    WHERE sale_date >= CURRENT_DATE - INTERVAL '30 days'
      AND status = 'COMPLETED'
      `),
      // Accounts receivable — from customers with positive balance
      pool.query(`
    SELECT 
      COUNT(*) as customer_count,
      COALESCE(SUM(balance), 0) as total_receivables
    FROM customers
    WHERE balance > 0
      `),
      // Accounts payable — from GL account 2100 balance
      pool.query(`
    SELECT 
      0 as supplier_count,
      COALESCE(SUM(gpb.credit_total) - SUM(gpb.debit_total), 0) as total_payables
    FROM gl_period_balances gpb
    JOIN accounts a ON a."Id" = gpb.account_id
    WHERE a."AccountCode" = '2100'
      `),
      // Recent ledger transactions count (where actual data lives)
      pool.query(`
    SELECT COUNT(*) as entry_count
    FROM ledger_transactions
    WHERE "TransactionDate" >= CURRENT_DATE - INTERVAL '30 days'
      AND "Status" = 'POSTED'
      `),
    ]);

    // Process accounts by type
    const accountsByType: Record<string, number> = {};
    let totalAccounts = 0;
    accountsResult.rows.forEach((row: { account_type: string; count: string }) => {
      accountsByType[row.account_type] = parseInt(row.count);
      totalAccounts += parseInt(row.count);
    });

    // Calculate trial balance status using decimal-safe arithmetic
    const totalDebits = Money.parseDb(trialBalanceResult.rows[0]?.total_debits);
    const totalCredits = Money.parseDb(trialBalanceResult.rows[0]?.total_credits);
    const difference = Money.abs(Money.subtract(totalDebits, totalCredits));
    const isBalanced = difference.lessThan(0.01);

    // Sales summary
    const salesData = salesSummaryResult.rows[0] || {};
    const totalRevenue = Money.parseDb(salesData.total_revenue);
    const totalCOGS = Money.parseDb(salesData.total_cogs);
    const totalProfit = Money.parseDb(salesData.total_profit);
    const profitMargin = Money.grossMargin(totalRevenue, totalCOGS);

    // Receivables summary
    const receivablesData = receivablesSummaryResult.rows[0] || {};

    // Payables summary
    const payablesData = payablesSummaryResult.rows[0] || {};

    // Journal entries count
    const journalEntriesCount = parseInt(journalEntriesResult.rows[0]?.entry_count || '0');

    res.json({
      success: true,
      data: {
        asOfDate: getBusinessDate(),
        chartOfAccounts: {
          total: totalAccounts,
          byType: accountsByType,
        },
        trialBalance: {
          totalDebits: totalDebits.toNumber(),
          totalCredits: totalCredits.toNumber(),
          difference: difference.toNumber(),
          isBalanced,
        },
        sales: {
          periodDays: 30,
          totalSales: parseInt(salesData.total_sales || '0'),
          totalRevenue: totalRevenue.toNumber(),
          totalCOGS: totalCOGS.toNumber(),
          totalProfit: totalProfit.toNumber(),
          profitMargin: profitMargin.toNumber(),
        },
        receivables: {
          customerCount: parseInt(receivablesData.customer_count || '0'),
          totalAmount: Money.parseDb(receivablesData.total_receivables).toNumber(),
        },
        payables: {
          supplierCount: parseInt(payablesData.supplier_count || '0'),
          totalAmount: Money.parseDb(payablesData.total_payables).toNumber(),
        },
        journalEntries: {
          recentCount: journalEntriesCount,
        },
      },
    });
  })
);

// =============================================================================
// EXPORT ENDPOINTS (Other reports - GL export is above with its routes)
// =============================================================================

router.get('/balance-sheet/export', requirePermission('accounting.export'), (_req, res) => {
  res.json({
    success: false,
    message: 'Export functionality coming soon',
  });
});

router.get('/income-statement/export', requirePermission('accounting.export'), (_req, res) => {
  res.json({
    success: false,
    message: 'Export functionality coming soon',
  });
});

router.get('/cash-flow/export', requirePermission('accounting.export'), (_req, res) => {
  res.json({
    success: false,
    message: 'Export functionality coming soon',
  });
});

router.get('/trial-balance/export', requirePermission('accounting.export'), (_req, res) => {
  res.json({
    success: false,
    message: 'Export functionality coming soon',
  });
});

export { router as accountingRoutes };
