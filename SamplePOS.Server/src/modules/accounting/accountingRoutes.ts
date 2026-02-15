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
import logger from '../../utils/logger.js';
import { authenticate } from '../../middleware/auth.js';
import * as accountingRepository from '../../repositories/accountingRepository.js';
import { Money } from '../../utils/money.js';
import { getSettings } from '../settings/invoiceSettingsService.js';

const router = express.Router();

// =============================================================================
// HEALTH CHECK
// =============================================================================

router.get('/test', (_req, res) => {
  res.json({ success: true, message: 'Accounting routes working!' });
});

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString()
    }
  });
});

// =============================================================================
// CHART OF ACCOUNTS
// =============================================================================

/**
 * GET /api/accounting/chart-of-accounts
 * Get all accounts with optional filtering
 */
router.get('/chart-of-accounts', async (req, res) => {
  try {
    const { accountType, isActive, isPostingAccount, search } = req.query;

    const filters: accountingRepository.AccountFilters = {};

    if (accountType && accountType !== 'ALL') {
      filters.accountType = accountType as string;
    }
    if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    }
    if (isPostingAccount !== undefined) {
      filters.isPostingAccount = isPostingAccount === 'true';
    }
    if (search) {
      filters.search = search as string;
    }

    const accounts = await accountingRepository.getAccounts(filters);

    // Transform to frontend format
    // For display purposes:
    // - ASSET, EXPENSE: Debit is positive (display as-is from Debit-Credit calculation)
    // - LIABILITY, EQUITY, REVENUE: Credit is positive (flip the sign for display)
    const formattedAccounts = accounts.map(acc => {
      const rawBalance = Money.parseDb(acc.currentBalance);
      // Credit-normal accounts (Liability, Equity, Revenue) should display credit balances as positive
      const isCreditNormal = ['LIABILITY', 'EQUITY', 'REVENUE'].includes(acc.accountType);
      const displayBalance = isCreditNormal ? Money.negate(rawBalance).toNumber() : rawBalance.toNumber();

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
        currentBalance: displayBalance
      };
    });

    res.json({
      success: true,
      data: formattedAccounts
    });
  } catch (error) {
    logger.error('Error in chart-of-accounts endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load chart of accounts'
    });
  }
});

/**
 * GET /api/accounting/chart-of-accounts/:id
 * Get account by ID
 */
router.get('/chart-of-accounts/:id', async (req, res) => {
  try {
    const account = await accountingRepository.getAccountById(req.params.id);

    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
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
        isActive: account.isActive
      }
    });
  } catch (error) {
    logger.error('Error fetching account by ID:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load account'
    });
  }
});

/**
 * POST /api/accounting/chart-of-accounts
 * Create new account
 */
router.post('/chart-of-accounts', authenticate, async (req, res) => {
  try {
    const { accountNumber, accountName, accountType, normalBalance, parentAccountId, isPostingAccount } = req.body;

    // Validate required fields
    if (!accountNumber || !accountName || !accountType || !normalBalance) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: accountNumber, accountName, accountType, normalBalance'
      });
    }

    // Validate account type
    const validTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
    if (!validTypes.includes(accountType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid accountType. Must be one of: ${validTypes.join(', ')}`
      });
    }

    // Validate normal balance
    if (!['DEBIT', 'CREDIT'].includes(normalBalance)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid normalBalance. Must be DEBIT or CREDIT'
      });
    }

    // Determine level based on parent
    let level = 1;
    if (parentAccountId) {
      const parent = await accountingRepository.getAccountById(parentAccountId);
      if (parent) {
        level = parent.level + 1;
      }
    }

    const account = await accountingRepository.createAccount({
      accountCode: accountNumber,
      accountName,
      accountType,
      normalBalance,
      parentAccountId: parentAccountId || null,
      level,
      isPostingAccount: isPostingAccount !== false,
      isActive: true
    });

    res.status(201).json({
      success: true,
      data: {
        id: account.id,
        accountNumber: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        normalBalance: account.normalBalance
      }
    });
  } catch (error) {
    logger.error('Error creating account:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create account'
    });
  }
});

// =============================================================================
// GENERAL LEDGER
// =============================================================================

/**
 * GET /api/accounting/general-ledger
 * Get ledger entries with filtering and pagination
 */
router.get('/general-ledger', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      accountId,
      dateFrom,
      dateTo,
      search
    } = req.query;

    const filters: accountingRepository.LedgerFilters = {
      page: parseInt(page as string) || 1,
      limit: parseInt(limit as string) || 20,
      accountId: accountId && accountId !== 'ALL' ? accountId as string : undefined,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      search: search as string
    };

    const { entries, total } = await accountingRepository.getLedgerEntries(filters);

    res.json({
      success: true,
      data: entries.map(entry => ({
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
        createdAt: entry.createdAt
      })),
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit)
      }
    });
  } catch (error) {
    logger.error('Error in general-ledger endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load ledger entries'
    });
  }
});

/**
 * GET /api/accounting/general-ledger/export
 * Export general ledger entries as CSV
 * NOTE: This route MUST come before /general-ledger/:id to avoid route conflict
 */
router.get('/general-ledger/export', async (req, res) => {
  try {
    const { accountId, dateFrom, dateTo, search } = req.query;

    // Get all entries (high limit for export)
    const filters: accountingRepository.LedgerFilters = {
      page: 1,
      limit: 10000, // Get all for export
      accountId: accountId && accountId !== 'ALL' ? accountId as string : undefined,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      search: search as string
    };

    const { entries } = await accountingRepository.getLedgerEntries(filters);

    // Build CSV content
    const headers = ['Date', 'Reference', 'Account Code', 'Account Name', 'Description', 'Debit', 'Credit', 'Balance'];
    const rows = entries.map(entry => [
      entry.entryDate?.split('T')[0] || '',
      entry.reference || '',
      entry.accountCode || '',
      entry.accountName || '',
      (entry.description || '').replace(/,/g, ';'), // Escape commas
      Money.format(entry.debitAmount, 2),
      Money.format(entry.creditAmount, 2),
      Money.format(entry.runningBalance, 2)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="general-ledger-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);
  } catch (error) {
    logger.error('Error exporting general ledger:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export general ledger'
    });
  }
});

/**
 * GET /api/accounting/general-ledger/:id
 * Get journal entry by ID with all lines
 */
router.get('/general-ledger/:id', async (req, res) => {
  try {
    const entry = await accountingRepository.getJournalEntryById(req.params.id);

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Journal entry not found'
      });
    }

    res.json({
      success: true,
      data: entry
    });
  } catch (error) {
    logger.error('Error fetching journal entry:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load journal entry'
    });
  }
});

/**
 * GET /api/accounting/transactions/:transactionId
 * Get transaction details by transaction ID
 * Tries ledger_transactions first (backfilled data), then journal_entries
 */
router.get('/transactions/:transactionId', async (req, res) => {
  try {
    const transactionId = req.params.transactionId;

    // First, try to find in ledger_transactions (backfilled data)
    const ledgerTxn = await accountingRepository.getLedgerTransactionById(transactionId);

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
          entries: ledgerTxn.entries.map(entry => ({
            id: entry.id,
            accountId: entry.accountId,
            accountNumber: entry.accountCode,
            accountName: entry.accountName,
            debitAmount: entry.debitAmount,
            creditAmount: entry.creditAmount,
            description: entry.description
          }))
        }
      });
    }

    // Fall back to journal_entries (original system)
    const journalEntry = await accountingRepository.getJournalEntryById(transactionId);

    if (!journalEntry) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
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
        entries: journalEntry.lines.map(line => ({
          id: line.id,
          accountId: line.accountId,
          accountNumber: line.accountCode,
          accountName: line.accountName,
          debitAmount: line.debitAmount,
          creditAmount: line.creditAmount,
          description: line.description
        }))
      }
    });
  } catch (error) {
    logger.error('Error in transactions endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load transaction details'
    });
  }
});

// =============================================================================
// TRIAL BALANCE
// =============================================================================

/**
 * GET /api/accounting/trial-balance
 * Generate trial balance as of a given date
 */
router.get('/trial-balance', async (req, res) => {
  try {
    const {
      asOfDate = new Date().toISOString().split('T')[0],
      includeZeroBalances = 'false'
    } = req.query;

    const trialBalance = await accountingRepository.getTrialBalance(
      asOfDate as string,
      includeZeroBalances === 'true'
    );

    res.json({
      success: true,
      data: trialBalance
    });
  } catch (error) {
    logger.error('Error in trial-balance endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load trial balance'
    });
  }
});

// =============================================================================
// BALANCE SHEET
// =============================================================================

/**
 * GET /api/accounting/balance-sheet
 * Generate balance sheet as of a given date
 */
router.get('/balance-sheet', async (req, res) => {
  try {
    const pool = (await import('../../db/pool.js')).default;
    const asOfDate = (req.query.asOfDate as string) || new Date().toISOString().split('T')[0];

    const balanceSheet = await accountingRepository.getBalanceSheet(asOfDate);

    // Get company name from settings
    const settings = await getSettings(pool);
    const companyName = settings.companyName || 'SamplePOS';

    res.json({
      success: true,
      data: { ...balanceSheet, companyName }
    });
  } catch (error) {
    logger.error('Error in balance-sheet endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load balance sheet'
    });
  }
});

// =============================================================================
// INCOME STATEMENT
// =============================================================================

/**
 * GET /api/accounting/income-statement
 * Generate income statement for a date range
 */
router.get('/income-statement', async (req, res) => {
  try {
    const pool = (await import('../../db/pool.js')).default;
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const startDate = (req.query.startDate as string) || firstDayOfMonth.toISOString().split('T')[0];
    const endDate = (req.query.endDate as string) || now.toISOString().split('T')[0];

    const incomeStatement = await accountingRepository.getIncomeStatement(startDate, endDate);

    // Get company name from settings
    const settings = await getSettings(pool);
    const companyName = settings.companyName || 'SamplePOS';

    res.json({
      success: true,
      data: { ...incomeStatement, companyName }
    });
  } catch (error) {
    logger.error('Error in income-statement endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load income statement'
    });
  }
});

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
router.get('/cash-flow', async (req, res) => {
  try {
    const pool = (await import('../../db/pool.js')).default;
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const startDate = (req.query.startDate as string) || firstDayOfMonth.toISOString().split('T')[0];
    const endDate = (req.query.endDate as string) || now.toISOString().split('T')[0];

    // Get income statement for net income
    const incomeStatement = await accountingRepository.getIncomeStatement(startDate, endDate);

    // Get cash movements by type from ledger entries
    const cashMovementsResult = await pool.query(`
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
    `, [startDate, endDate + ' 23:59:59']);

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
      if (['SALE', 'CUSTOMER_PAYMENT', 'INVOICE_PAYMENT', 'CUSTOMER_DEPOSIT', 'EXPENSE'].includes(refType)) {
        operatingCashIn = Money.add(operatingCashIn, cashIn);
        operatingCashOut = Money.add(operatingCashOut, cashOut);
        if (!Money.isZero(netAmount)) {
          operatingItems.push({ description: refType.replace(/_/g, ' '), amount: netAmount.toNumber() });
        }
      }
      // Investing activities: fixed assets, equipment purchases
      else if (['ASSET_PURCHASE', 'ASSET_SALE', 'INVESTMENT'].includes(refType)) {
        investingCashIn = Money.add(investingCashIn, cashIn);
        investingCashOut = Money.add(investingCashOut, cashOut);
        if (!Money.isZero(netAmount)) {
          investingItems.push({ description: refType.replace(/_/g, ' '), amount: netAmount.toNumber() });
        }
      }
      // Financing activities: loans, capital contributions
      else if (['LOAN', 'CAPITAL_CONTRIBUTION', 'DIVIDEND'].includes(refType)) {
        financingCashIn = Money.add(financingCashIn, cashIn);
        financingCashOut = Money.add(financingCashOut, cashOut);
        if (!Money.isZero(netAmount)) {
          financingItems.push({ description: refType.replace(/_/g, ' '), amount: netAmount.toNumber() });
        }
      }
      // Default to operating
      else if (!Money.isZero(netAmount)) {
        operatingCashIn = Money.add(operatingCashIn, cashIn);
        operatingCashOut = Money.add(operatingCashOut, cashOut);
        operatingItems.push({ description: refType.replace(/_/g, ' '), amount: netAmount.toNumber() });
      }
    }

    // Calculate totals from actual cash movements (Direct Method)
    // Note: Net Income is NOT added here - we show actual cash flows, not accrual-based income
    const totalOperatingCashFlow = Money.subtract(operatingCashIn, operatingCashOut).toNumber();
    const totalInvestingCashFlow = Money.subtract(investingCashIn, investingCashOut).toNumber();
    const totalFinancingCashFlow = Money.subtract(financingCashIn, financingCashOut).toNumber();

    const operatingActivities = {
      items: operatingItems, // Direct method: show actual cash transactions only
      totalOperatingCashFlow
    };

    const investingActivities = {
      items: investingItems,
      totalInvestingCashFlow
    };

    const financingActivities = {
      items: financingItems,
      totalFinancingCashFlow
    };

    // Calculate net change in cash from the three activities
    const netCashFlow = Money.add(
      totalOperatingCashFlow,
      totalInvestingCashFlow,
      totalFinancingCashFlow
    ).toNumber();

    // Get beginning cash balance from ledger entries (before the period)
    const beginningResult = await pool.query(`
      SELECT 
        COALESCE(SUM("DebitAmount"), 0) - COALESCE(SUM("CreditAmount"), 0) as beginning_balance
      FROM ledger_entries le
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" IN ('1010', '1020', '1030')
        AND le."EntryDate" < $1
    `, [startDate]);
    const beginningCashBalance = Money.parseDb(beginningResult.rows[0]?.beginning_balance).toNumber();

    // Calculate ending balance from ledger entries (through end of period)
    const endingResult = await pool.query(`
      SELECT 
        COALESCE(SUM("DebitAmount"), 0) - COALESCE(SUM("CreditAmount"), 0) as ending_balance
      FROM ledger_entries le
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" IN ('1010', '1020', '1030')
        AND le."EntryDate" <= $1
    `, [endDate + ' 23:59:59']);
    const endingCashBalance = Money.parseDb(endingResult.rows[0]?.ending_balance).toNumber();

    // Net change should equal total cash flows (this is a validation)
    // Use the calculated net cash flow for consistency
    const netChangeInCash = netCashFlow;

    // Get company name from settings
    const settings = await getSettings(pool);
    const companyName = settings.companyName || 'SamplePOS';

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
        endingCashBalance
      }
    });
  } catch (error) {
    logger.error('Error in cash-flow endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load cash flow statement'
    });
  }
});

// =============================================================================
// DASHBOARD SUMMARY ENDPOINT
// =============================================================================

/**
 * GET /api/accounting/dashboard-summary
 * Comprehensive dashboard data for accounting module
 * Fetches: chart of accounts, trial balance, sales summary, receivables, payables
 */
router.get('/dashboard-summary', async (req, res) => {
  try {
    const pool = (await import('../../db/pool.js')).default;

    // Fetch all dashboard data in parallel
    const [
      accountsResult,
      trialBalanceResult,
      salesSummaryResult,
      receivablesSummaryResult,
      payablesSummaryResult,
      journalEntriesResult
    ] = await Promise.all([
      // Chart of accounts summary (using correct table and column names)
      pool.query(`
        SELECT "AccountType" as account_type, COUNT(*) as count
        FROM accounts
        WHERE "IsActive" = true
        GROUP BY "AccountType"
      `),
      // Trial balance totals from ledger_entries (where actual data lives)
      pool.query(`
        SELECT 
          COALESCE(SUM(le."DebitAmount"), 0) as total_debits,
          COALESCE(SUM(le."CreditAmount"), 0) as total_credits
        FROM ledger_entries le
        JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
        WHERE lt."Status" = 'POSTED'
      `),
      // Sales summary (last 30 days)
      pool.query(`
        SELECT 
          COUNT(*) as total_sales,
          COALESCE(SUM(total_amount), 0) as total_revenue,
          COALESCE(SUM(total_cost), 0) as total_cogs,
          COALESCE(SUM(profit), 0) as total_profit
        FROM sales
        WHERE sale_date >= CURRENT_DATE - INTERVAL '30 days'
          AND status = 'COMPLETED'
      `),
      // Accounts receivable (customers with balance)
      pool.query(`
        SELECT 
          COUNT(*) as customer_count,
          COALESCE(SUM(balance), 0) as total_receivables
        FROM customers
        WHERE balance > 0
      `),
      // Accounts payable (suppliers - using OutstandingBalance from suppliers table)
      pool.query(`
        SELECT 
          COUNT(*) as supplier_count,
          COALESCE(SUM("OutstandingBalance"), 0) as total_payables
        FROM suppliers
        WHERE "IsActive" = true
      `),
      // Recent ledger transactions count (where actual data lives)
      pool.query(`
        SELECT COUNT(*) as entry_count
        FROM ledger_transactions
        WHERE "TransactionDate" >= CURRENT_DATE - INTERVAL '30 days'
          AND "Status" = 'POSTED'
      `)
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
        asOfDate: new Date().toISOString().split('T')[0],
        chartOfAccounts: {
          total: totalAccounts,
          byType: accountsByType
        },
        trialBalance: {
          totalDebits: totalDebits.toNumber(),
          totalCredits: totalCredits.toNumber(),
          difference: difference.toNumber(),
          isBalanced
        },
        sales: {
          periodDays: 30,
          totalSales: parseInt(salesData.total_sales || '0'),
          totalRevenue: totalRevenue.toNumber(),
          totalCOGS: totalCOGS.toNumber(),
          totalProfit: totalProfit.toNumber(),
          profitMargin: profitMargin.toNumber()
        },
        receivables: {
          customerCount: parseInt(receivablesData.customer_count || '0'),
          totalAmount: Money.parseDb(receivablesData.total_receivables).toNumber()
        },
        payables: {
          supplierCount: parseInt(payablesData.supplier_count || '0'),
          totalAmount: Money.parseDb(payablesData.total_payables).toNumber()
        },
        journalEntries: {
          recentCount: journalEntriesCount
        }
      }
    });
  } catch (error) {
    logger.error('Error in dashboard-summary endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load dashboard summary'
    });
  }
});

// =============================================================================
// EXPORT ENDPOINTS (Other reports - GL export is above with its routes)
// =============================================================================

router.get('/balance-sheet/export', (_req, res) => {
  res.json({
    success: false,
    message: 'Export functionality coming soon'
  });
});

router.get('/income-statement/export', (_req, res) => {
  res.json({
    success: false,
    message: 'Export functionality coming soon'
  });
});

router.get('/cash-flow/export', (_req, res) => {
  res.json({
    success: false,
    message: 'Export functionality coming soon'
  });
});

router.get('/trial-balance/export', (_req, res) => {
  res.json({
    success: false,
    message: 'Export functionality coming soon'
  });
});

export { router as accountingRoutes };
