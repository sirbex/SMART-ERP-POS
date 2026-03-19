/**
 * BANKING ROUTES
 *
 * REST API endpoints for banking module
 * Follows existing API patterns:
 *   - { success: true, data: ... } for success
 *   - { success: false, error: ... } for errors
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { BankingService } from '../services/bankingService.js';
import logger from '../utils/logger.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../rbac/middleware.js';
import { pool as globalPool } from '../db/pool.js';
import type { Pool } from 'pg';

const router = Router();

// All banking routes require authentication
router.use(authenticate);

/** Resolve tenant pool (multi-tenant) or fall back to global pool */
function p(req: Request): Pool {
  return (req as unknown as { tenantPool?: Pool }).tenantPool || globalPool;
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const CreateBankAccountSchema = z.object({
  name: z.string().min(1).max(100),
  accountNumber: z.string().max(50).optional(),
  bankName: z.string().max(100).optional(),
  branch: z.string().max(100).optional(),
  glAccountId: z.string().uuid(),
  openingBalance: z.number().optional(),
  isDefault: z.boolean().optional(),
});

const CreateBankTransactionSchema = z.object({
  bankAccountId: z.string().uuid(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'TRANSFER_IN', 'TRANSFER_OUT', 'FEE', 'INTEREST']),
  categoryId: z.string().uuid().optional(),
  description: z.string().min(1).max(500),
  reference: z.string().max(100).optional(),
  amount: z.number().positive(),
  contraAccountId: z.string().uuid().optional(),
  sourceType: z
    .enum([
      'SALE',
      'EXPENSE',
      'CUSTOMER_PAYMENT',
      'SUPPLIER_PAYMENT',
      'STATEMENT_IMPORT',
      'MANUAL',
      'TRANSFER',
    ])
    .optional(),
  sourceId: z.string().uuid().optional(),
});

const CreateTransferSchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  description: z.string().max(500).optional(),
  reference: z.string().max(100).optional(),
});

const ReverseTransactionSchema = z.object({
  reason: z.string().min(1).max(500),
});

const ReconcileSchema = z.object({
  bankAccountId: z.string().uuid(),
  transactionIds: z.array(z.string().uuid()),
  statementBalance: z.number(),
});

const UpdateAlertStatusSchema = z.object({
  status: z.enum(['REVIEWED', 'DISMISSED', 'RESOLVED']),
  notes: z.string().max(500).optional(),
});

const LearnPatternSchema = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
  direction: z.enum(['IN', 'OUT']),
  categoryId: z.string().uuid().nullable(),
  contraAccountId: z.string().uuid().nullable(),
});

const PatternFeedbackSchema = z.object({
  accepted: z.boolean(),
});

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  bankName: z.string().max(100).optional(),
  columnMappings: z.object({
    dateColumn: z.number().int().min(0),
    dateFormat: z.string().min(1),
    descriptionColumn: z.number().int().min(0),
    amountColumn: z.number().int().min(0).optional(),
    debitColumn: z.number().int().min(0).optional(),
    creditColumn: z.number().int().min(0).optional(),
    balanceColumn: z.number().int().min(0).optional(),
    referenceColumn: z.number().int().min(0).optional(),
    negativeIsDebit: z.boolean().optional(),
  }),
  skipHeaderRows: z.number().int().min(0).optional(),
  skipFooterRows: z.number().int().min(0).optional(),
  delimiter: z.string().max(5).optional(),
});

const ImportStatementSchema = z.object({
  bankAccountId: z.string().uuid(),
  templateId: z.string().uuid(),
  csvContent: z.string().min(1),
  statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fileName: z.string().min(1).max(255),
  periodStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  periodEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const ProcessLineSchema = z.object({
  action: z.enum(['CREATE', 'MATCH', 'SKIP']),
  transactionId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  contraAccountId: z.string().uuid().optional(),
  skipReason: z.string().max(500).optional(),
});

// =============================================================================
// HELPER
// =============================================================================

function getUserId(req: Request): string {
  return req.user!.id;
}

// =============================================================================
// BANK ACCOUNTS
// =============================================================================

/**
 * GET /api/banking/accounts
 * Get all bank accounts
 */
router.get(
  '/accounts',
  requirePermission('banking.read'),
  asyncHandler(async (req, res) => {
    const includeInactive = req.query.includeInactive === 'true';
    const accounts = await BankingService.getAllAccounts(includeInactive, p(req));

    res.json({ success: true, data: accounts });
  })
);

/**
 * GET /api/banking/accounts/:id
 * Get single bank account
 */
router.get(
  '/accounts/:id',
  requirePermission('banking.read'),
  asyncHandler(async (req, res) => {
    const account = await BankingService.getAccountById(req.params.id, p(req));

    if (!account) {
      return res.status(404).json({ success: false, error: 'Bank account not found' });
    }

    res.json({ success: true, data: account });
  })
);

/**
 * POST /api/banking/accounts
 * Create new bank account
 */
router.post(
  '/accounts',
  requirePermission('banking.create'),
  asyncHandler(async (req, res) => {
    const dto = CreateBankAccountSchema.parse(req.body);
    const account = await BankingService.createAccount(dto, getUserId(req), p(req));

    res.status(201).json({ success: true, data: account });
  })
);

// =============================================================================
// BANK TRANSACTIONS
// =============================================================================

/**
 * GET /api/banking/accounts/:accountId/transactions
 * Get transactions for a bank account
 */
router.get(
  '/accounts/:accountId/transactions',
  requirePermission('banking.read'),
  asyncHandler(async (req, res) => {
    const { startDate, endDate, type, isReconciled, limit, offset } = req.query;

    const result = await BankingService.getTransactions(
      req.params.accountId,
      {
        startDate: startDate as string,
        endDate: endDate as string,
        type: type as string,
        isReconciled: isReconciled === 'true' ? true : isReconciled === 'false' ? false : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      },
      p(req)
    );

    res.json({
      success: true,
      data: {
        transactions: result.transactions,
        pagination: {
          total: result.total,
          limit: limit ? parseInt(limit as string) : 50,
          offset: offset ? parseInt(offset as string) : 0,
        },
      },
    });
  })
);

/**
 * GET /api/banking/transactions
 * Get transactions across all accounts (with optional filters)
 */
router.get(
  '/transactions',
  requirePermission('banking.read'),
  asyncHandler(async (req, res) => {
    const { bankAccountId, startDate, endDate, type, categoryId, isReconciled, limit, offset } =
      req.query;

    const options = {
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      type: type as string | undefined,
      categoryId: categoryId as string | undefined,
      isReconciled: isReconciled !== undefined ? isReconciled === 'true' : undefined,
      limit: limit ? parseInt(limit as string) : 100,
      offset: offset ? parseInt(offset as string) : 0,
    };

    // If bankAccountId provided, filter by that account
    // Otherwise, get transactions from all accounts
    const result = bankAccountId
      ? await BankingService.getTransactions(bankAccountId as string, options, p(req))
      : await BankingService.getAllTransactions(options, p(req));

    res.json({
      success: true,
      data: result.transactions,
      total: result.total,
    });
  })
);

/**
 * GET /api/banking/transactions/:id
 * Get single transaction
 */
router.get(
  '/transactions/:id',
  requirePermission('banking.read'),
  asyncHandler(async (req, res) => {
    const transaction = await BankingService.getTransactionById(req.params.id, p(req));

    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    res.json({ success: true, data: transaction });
  })
);

/**
 * POST /api/banking/transactions
 * Create new bank transaction (deposit or withdrawal)
 */
router.post(
  '/transactions',
  requirePermission('banking.create'),
  asyncHandler(async (req, res) => {
    const dto = CreateBankTransactionSchema.parse(req.body);
    const transaction = await BankingService.createTransaction(dto, getUserId(req), p(req));

    res.status(201).json({ success: true, data: transaction });
  })
);

/**
 * POST /api/banking/transfers
 * Create bank-to-bank transfer
 */
router.post(
  '/transfers',
  requirePermission('banking.create'),
  asyncHandler(async (req, res) => {
    const dto = CreateTransferSchema.parse(req.body);
    const result = await BankingService.createTransfer(dto, getUserId(req), p(req));

    res.status(201).json({
      success: true,
      data: result,
      message: 'Transfer created successfully',
    });
  })
);

/**
 * POST /api/banking/transactions/:id/reverse
 * Reverse a bank transaction
 */
router.post(
  '/transactions/:id/reverse',
  requirePermission('banking.delete'),
  asyncHandler(async (req, res) => {
    const { reason } = ReverseTransactionSchema.parse(req.body);

    const reversalTransaction = await BankingService.reverseTransaction(
      { transactionId: req.params.id, reason },
      getUserId(req),
      p(req)
    );

    res.json({
      success: true,
      data: reversalTransaction,
      message: 'Transaction reversed successfully',
    });
  })
);

// =============================================================================
// CATEGORIES
// =============================================================================

/**
 * GET /api/banking/categories
 * Get all bank categories
 */
router.get(
  '/categories',
  requirePermission('banking.read'),
  asyncHandler(async (req, res) => {
    const direction = req.query.direction as 'IN' | 'OUT' | undefined;
    const categories = await BankingService.getCategories(direction, p(req));

    res.json({ success: true, data: categories });
  })
);

// =============================================================================
// RECONCILIATION
// =============================================================================

/**
 * POST /api/banking/accounts/:accountId/reconcile
 * Mark transactions as reconciled
 */
router.post(
  '/accounts/:accountId/reconcile',
  requirePermission('banking.reconcile'),
  asyncHandler(async (req, res) => {
    const { transactionIds, statementBalance } = ReconcileSchema.parse(req.body);

    const result = await BankingService.reconcileTransactions(
      req.params.accountId,
      transactionIds,
      statementBalance,
      getUserId(req),
      p(req)
    );

    res.json({
      success: true,
      data: result,
      message: `${result.reconciledCount} transactions reconciled`,
    });
  })
);

/**
 * POST /api/banking/reconcile
 * Mark transactions as reconciled (alternative route with accountId in body)
 */
router.post(
  '/reconcile',
  requirePermission('banking.reconcile'),
  asyncHandler(async (req, res) => {
    const { bankAccountId, transactionIds, statementBalance } = ReconcileSchema.parse(req.body);

    const result = await BankingService.reconcileTransactions(
      bankAccountId,
      transactionIds,
      statementBalance,
      getUserId(req),
      p(req)
    );

    res.json({
      success: true,
      data: result,
      message: `${result.reconciledCount} transactions reconciled`,
    });
  })
);

// =============================================================================
// PATTERNS
// =============================================================================

/**
 * GET /api/banking/patterns/match
 * Find matching patterns for a description
 */
router.get(
  '/patterns/match',
  requirePermission('banking.read'),
  asyncHandler(async (req, res) => {
    const { description, amount, direction } = req.query;

    if (!description || !amount || !direction) {
      return res.status(400).json({
        success: false,
        error: 'description, amount, and direction are required',
      });
    }

    const patterns = await BankingService.findMatchingPatterns(
      description as string,
      parseFloat(amount as string),
      direction as 'IN' | 'OUT',
      p(req)
    );

    res.json({ success: true, data: patterns });
  })
);

/**
 * POST /api/banking/patterns
 * Learn a new pattern
 */
router.post(
  '/patterns',
  requirePermission('banking.create'),
  asyncHandler(async (req, res) => {
    const dto = LearnPatternSchema.parse(req.body);

    const pattern = await BankingService.learnPattern(
      dto.description,
      dto.amount,
      dto.direction,
      dto.categoryId,
      dto.contraAccountId,
      getUserId(req),
      p(req)
    );

    res.status(201).json({ success: true, data: pattern });
  })
);

/**
 * POST /api/banking/patterns/:id/feedback
 * Update pattern confidence based on user feedback
 */
router.post(
  '/patterns/:id/feedback',
  requirePermission('banking.update'),
  asyncHandler(async (req, res) => {
    const { accepted } = PatternFeedbackSchema.parse(req.body);

    await BankingService.updatePatternConfidence(req.params.id, accepted, p(req));

    res.json({
      success: true,
      message: accepted ? 'Pattern confidence increased' : 'Pattern confidence decreased',
    });
  })
);

// =============================================================================
// ALERTS
// =============================================================================

/**
 * GET /api/banking/alerts
 * Get bank alerts
 */
router.get(
  '/alerts',
  requirePermission('banking.read'),
  asyncHandler(async (req, res) => {
    const status = (req.query.status as 'NEW' | 'REVIEWED' | 'DISMISSED' | 'RESOLVED') || 'NEW';
    const alerts = await BankingService.getAlerts(status, p(req));

    res.json({ success: true, data: alerts });
  })
);

/**
 * PATCH /api/banking/alerts/:id
 * Update alert status
 */
router.patch(
  '/alerts/:id',
  requirePermission('banking.update'),
  asyncHandler(async (req, res) => {
    const { status, notes } = UpdateAlertStatusSchema.parse(req.body);

    await BankingService.updateAlertStatus(
      req.params.id,
      status,
      notes || null,
      getUserId(req),
      p(req)
    );

    res.json({ success: true, message: 'Alert updated' });
  })
);

// =============================================================================
// IMPORT TEMPLATES
// =============================================================================

/**
 * GET /api/banking/templates
 * Get all import templates
 */
router.get(
  '/templates',
  requirePermission('banking.read'),
  asyncHandler(async (req, res) => {
    const templates = await BankingService.getTemplates(p(req));
    res.json({ success: true, data: templates });
  })
);

/**
 * POST /api/banking/templates
 * Create import template
 */
router.post(
  '/templates',
  requirePermission('banking.create'),
  asyncHandler(async (req, res) => {
    const data = CreateTemplateSchema.parse(req.body);
    const template = await BankingService.createTemplate(data, p(req));
    res.status(201).json({ success: true, data: template });
  })
);

// =============================================================================
// STATEMENT IMPORT
// =============================================================================

/**
 * POST /api/banking/statements/import
 * Import bank statement from CSV
 */
router.post(
  '/statements/import',
  requirePermission('banking.import'),
  asyncHandler(async (req, res) => {
    const data = ImportStatementSchema.parse(req.body);

    const result = await BankingService.importStatement(
      data.bankAccountId,
      data.templateId,
      data.csvContent,
      data.statementDate,
      data.fileName,
      getUserId(req),
      {
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
      },
      p(req)
    );

    res.status(201).json({
      success: true,
      data: result,
      message: `Imported ${result.totalLines} transactions from statement`,
    });
  })
);

/**
 * GET /api/banking/statements/:id/lines
 * Get statement lines for processing
 */
router.get(
  '/statements/:id/lines',
  requirePermission('banking.read'),
  asyncHandler(async (req, res) => {
    const status = req.query.status as 'UNMATCHED' | 'MATCHED' | 'CREATED' | 'SKIPPED' | undefined;
    const lines = await BankingService.getStatementLines(req.params.id, status, p(req));
    res.json({ success: true, data: lines });
  })
);

/**
 * POST /api/banking/statements/lines/:id/process
 * Process a statement line
 */
router.post(
  '/statements/lines/:id/process',
  requirePermission('banking.import'),
  asyncHandler(async (req, res) => {
    const data = ProcessLineSchema.parse(req.body);

    const result = await BankingService.processStatementLine(
      req.params.id,
      data.action,
      getUserId(req),
      {
        transactionId: data.transactionId,
        categoryId: data.categoryId,
        contraAccountId: data.contraAccountId,
        skipReason: data.skipReason,
      },
      p(req)
    );

    res.json({ success: true, data: result });
  })
);

/**
 * POST /api/banking/statements/:id/complete
 * Complete statement processing
 */
router.post(
  '/statements/:id/complete',
  requirePermission('banking.import'),
  asyncHandler(async (req, res) => {
    await BankingService.completeStatement(req.params.id, getUserId(req), p(req));
    res.json({ success: true, message: 'Statement completed' });
  })
);

// =============================================================================
// RECURRING TRANSACTION RULES
// =============================================================================

const CreateRecurringRuleSchema = z.object({
  name: z.string().min(1).max(100),
  bankAccountId: z.string().uuid(),
  matchRules: z.object({
    descriptionContains: z.array(z.string()).optional(),
    descriptionRegex: z.string().optional(),
    amountMin: z.number().optional(),
    amountMax: z.number().optional(),
  }),
  frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']),
  expectedDay: z.number().int().min(1).max(31),
  expectedAmount: z.number().positive(),
  tolerancePercent: z.number().int().min(0).max(100).optional(),
  categoryId: z.string().uuid().optional(),
  contraAccountId: z.string().uuid().optional(),
});

const UpdateRecurringRuleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  matchRules: z
    .object({
      descriptionContains: z.array(z.string()).optional(),
      descriptionRegex: z.string().optional(),
      amountMin: z.number().optional(),
      amountMax: z.number().optional(),
    })
    .optional(),
  frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']).optional(),
  expectedDay: z.number().int().min(1).max(31).optional(),
  expectedAmount: z.number().positive().optional(),
  tolerancePercent: z.number().int().min(0).max(100).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  contraAccountId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/banking/recurring-rules
 * Get all recurring rules
 */
router.get(
  '/recurring-rules',
  requirePermission('banking.read'),
  asyncHandler(async (req, res) => {
    const bankAccountId = req.query.bankAccountId as string | undefined;
    const rules = await BankingService.getRecurringRules(bankAccountId, p(req));
    res.json({ success: true, data: rules });
  })
);

/**
 * GET /api/banking/recurring-rules/:id
 * Get a single recurring rule
 */
router.get(
  '/recurring-rules/:id',
  requirePermission('banking.read'),
  asyncHandler(async (req, res) => {
    const rule = await BankingService.getRecurringRuleById(req.params.id, p(req));
    if (!rule) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }
    res.json({ success: true, data: rule });
  })
);

/**
 * POST /api/banking/recurring-rules
 * Create a recurring rule
 */
router.post(
  '/recurring-rules',
  requirePermission('banking.create'),
  asyncHandler(async (req, res) => {
    const data = CreateRecurringRuleSchema.parse(req.body);
    const rule = await BankingService.createRecurringRule(data, getUserId(req), p(req));
    res.status(201).json({ success: true, data: rule });
  })
);

/**
 * PATCH /api/banking/recurring-rules/:id
 * Update a recurring rule
 */
router.patch(
  '/recurring-rules/:id',
  requirePermission('banking.update'),
  asyncHandler(async (req, res) => {
    const data = UpdateRecurringRuleSchema.parse(req.body);
    const rule = await BankingService.updateRecurringRule(req.params.id, data, p(req));
    res.json({ success: true, data: rule });
  })
);

/**
 * DELETE /api/banking/recurring-rules/:id
 * Delete (deactivate) a recurring rule
 */
router.delete(
  '/recurring-rules/:id',
  requirePermission('banking.delete'),
  asyncHandler(async (req, res) => {
    await BankingService.deleteRecurringRule(req.params.id, p(req));
    res.json({ success: true, message: 'Rule deleted' });
  })
);

/**
 * POST /api/banking/recurring-rules/check-overdue
 * Check for overdue recurring transactions (creates alerts)
 */
router.post(
  '/recurring-rules/check-overdue',
  requirePermission('banking.update'),
  asyncHandler(async (req, res) => {
    const alertCount = await BankingService.checkOverdueRecurring(p(req));
    res.json({ success: true, data: { alertsCreated: alertCount } });
  })
);

// =============================================================================
// LOW BALANCE SETTINGS
// =============================================================================

const SetLowBalanceThresholdSchema = z.object({
  threshold: z.number().nonnegative(),
  enabled: z.boolean(),
});

/**
 * PUT /api/banking/accounts/:id/low-balance-settings
 * Set low balance threshold for an account
 */
router.put(
  '/accounts/:id/low-balance-settings',
  requirePermission('banking.update'),
  asyncHandler(async (req, res) => {
    const data = SetLowBalanceThresholdSchema.parse(req.body);
    await BankingService.setLowBalanceThreshold(
      req.params.id,
      data.threshold,
      data.enabled,
      p(req)
    );
    res.json({ success: true, message: 'Low balance settings updated' });
  })
);

/**
 * POST /api/banking/check-low-balances
 * Check all accounts for low balance (creates alerts)
 */
router.post(
  '/check-low-balances',
  requirePermission('banking.read'),
  asyncHandler(async (req, res) => {
    const alertCount = await BankingService.checkLowBalanceAlerts(p(req));
    res.json({ success: true, data: { alertsCreated: alertCount } });
  })
);

// =============================================================================
// REPORTS
// =============================================================================

/**
 * GET /api/banking/reports/account-summaries
 * Get summary of all bank accounts
 */
router.get(
  '/reports/account-summaries',
  requirePermission('banking.read'),
  asyncHandler(async (req, res) => {
    const summaries = await BankingService.getAccountSummaries(p(req));
    res.json({ success: true, data: summaries });
  })
);

/**
 * GET /api/banking/reports/activity/:accountId
 * Get activity report for a bank account
 */
router.get(
  '/reports/activity/:accountId',
  requirePermission('banking.read'),
  asyncHandler(async (req, res) => {
    const periodStart = req.query.periodStart as string;
    const periodEnd = req.query.periodEnd as string;

    if (!periodStart || !periodEnd) {
      return res.status(400).json({
        success: false,
        error: 'periodStart and periodEnd query params required',
      });
    }

    const report = await BankingService.getActivityReport(
      req.params.accountId,
      periodStart,
      periodEnd,
      p(req)
    );
    res.json({ success: true, data: report });
  })
);

/**
 * GET /api/banking/reports/cash-position
 * Get cash position report (all accounts)
 */
router.get(
  '/reports/cash-position',
  requirePermission('banking.read'),
  asyncHandler(async (req, res) => {
    const asOfDate = req.query.asOfDate as string | undefined;
    const report = await BankingService.getCashPositionReport(asOfDate, p(req));
    res.json({ success: true, data: report });
  })
);

export default router;
