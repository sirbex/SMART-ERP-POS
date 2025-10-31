import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import logger from '../utils/logger.js';
import Decimal from 'decimal.js';
import {
  createBankTransfer,
  recordBankTransaction,
  startReconciliation,
  reconcileTransactions,
  completeReconciliation,
  getUnreconciledTransactions,
  getReconciliationSummary,
} from '../services/bank/bankService.js';

const router = Router();

// Configure Decimal.js for bank-grade precision
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

// ===================================================================
// POST /api/bank/accounts - Create bank account
// ===================================================================
router.post(
  '/accounts',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        accountNumber,
        bankName,
        accountName,
        accountType,
        currency,
        balance,
        bookBalance,
        bankBalance,
        notes,
      } = req.body;

      const userId = (req as any).user?.id;

      // Validation
      if (!accountNumber || !bankName || !accountName) {
        return res.status(400).json({ error: 'Account number, bank name, and account name are required' });
      }

      // Check for duplicate account number
      const existingAccount = await prisma.bankAccount.findUnique({
        where: { accountNumber },
      });

      if (existingAccount) {
        return res.status(400).json({ error: 'Account number already exists' });
      }

      const bankAccount = await prisma.bankAccount.create({
        data: {
          accountNumber,
          bankName,
          accountName,
          accountType: accountType || 'CHECKING',
          currency: currency || 'USD',
          balance: balance ? new Decimal(balance.toString()) : new Decimal(0),
          bookBalance: bookBalance ? new Decimal(bookBalance.toString()) : new Decimal(0),
          bankBalance: bankBalance ? new Decimal(bankBalance.toString()) : new Decimal(0),
          notes,
          createdById: userId,
        },
      });

      logger.info(`Bank account created: ${bankAccount.accountNumber}`, { userId, accountId: bankAccount.id });

      res.status(201).json({
        success: true,
        message: 'Bank account created successfully',
        account: {
          id: bankAccount.id,
          accountNumber: bankAccount.accountNumber,
          bankName: bankAccount.bankName,
          accountName: bankAccount.accountName,
          accountType: bankAccount.accountType,
          currency: bankAccount.currency,
          balance: bankAccount.balance.toString(),
          bookBalance: bankAccount.bookBalance.toString(),
          bankBalance: bankAccount.bankBalance.toString(),
          status: bankAccount.status,
          createdAt: bankAccount.createdAt,
        },
      });
    } catch (error: any) {
      logger.error('Error creating bank account:', error);
      next(error);
    }
  }
);

// ===================================================================
// GET /api/bank/accounts - List all bank accounts
// ===================================================================
router.get(
  '/accounts',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, accountType } = req.query;

      const where: any = {};

      if (status) {
        where.status = status;
      }

      if (accountType) {
        where.accountType = accountType;
      }

      const accounts = await prisma.bankAccount.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              transactions: true,
              reconciliations: true,
            },
          },
        },
      });

      const formattedAccounts = accounts.map((account: any) => ({
        id: account.id,
        accountNumber: account.accountNumber,
        bankName: account.bankName,
        accountName: account.accountName,
        accountType: account.accountType,
        currency: account.currency,
        balance: account.balance.toString(),
        bookBalance: account.bookBalance.toString(),
        bankBalance: account.bankBalance.toString(),
        status: account.status,
        lastReconciled: account.lastReconciled,
        transactionsCount: account._count.transactions,
        reconciliationsCount: account._count.reconciliations,
        createdAt: account.createdAt,
      }));

      logger.info(`Listed ${accounts.length} bank accounts`, { userId: (req as any).user?.id });

      res.json({
        success: true,
        accounts: formattedAccounts,
      });
    } catch (error) {
      logger.error('Error listing bank accounts:', error);
      next(error);
    }
  }
);

// ===================================================================
// GET /api/bank/accounts/:id - Get bank account details
// ===================================================================
router.get(
  '/accounts/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const account = await prisma.bankAccount.findUnique({
        where: { id },
        include: {
          transactions: {
            orderBy: { transactionDate: 'desc' },
            take: 50,
          },
          reconciliations: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!account) {
        return res.status(404).json({ error: 'Bank account not found' });
      }

      logger.info(`Bank account details retrieved: ${account.accountNumber}`, {
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        account: {
          id: account.id,
          accountNumber: account.accountNumber,
          bankName: account.bankName,
          accountName: account.accountName,
          accountType: account.accountType,
          currency: account.currency,
          balance: account.balance.toString(),
          bookBalance: account.bookBalance.toString(),
          bankBalance: account.bankBalance.toString(),
          status: account.status,
          lastReconciled: account.lastReconciled,
          notes: account.notes,
          transactions: account.transactions.map((t: any) => ({
            id: t.id,
            transactionDate: t.transactionDate,
            description: t.description,
            amount: t.amount.toString(),
            type: t.type,
            reference: t.reference,
            isReconciled: t.isReconciled,
            reconciledDate: t.reconciledDate,
          })),
          reconciliations: account.reconciliations.map((r: any) => ({
            id: r.id,
            reconciliationNumber: r.reconciliationNumber,
            startDate: r.startDate,
            endDate: r.endDate,
            statementBalance: r.statementBalance.toString(),
            bookBalance: r.bookBalance.toString(),
            difference: r.difference.toString(),
            status: r.status,
            createdAt: r.createdAt,
          })),
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        },
      });
    } catch (error) {
      logger.error('Error retrieving bank account:', error);
      next(error);
    }
  }
);

// ===================================================================
// POST /api/bank/transfer - Transfer between accounts
// ===================================================================
router.post(
  '/transfer',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { fromAccountId, toAccountId, amount, description, transactionDate, reference } = req.body;
      const userId = (req as any).user?.id;

      // Validation
      if (!fromAccountId || !toAccountId) {
        return res.status(400).json({ error: 'From and to account IDs are required' });
      }

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' });
      }

      if (fromAccountId === toAccountId) {
        return res.status(400).json({ error: 'Cannot transfer to the same account' });
      }

      const result = await createBankTransfer({
        fromAccountId,
        toAccountId,
        amount: new Decimal(amount.toString()),
        description: description || 'Bank transfer',
        transferDate: transactionDate ? new Date(transactionDate) : new Date(),
        reference,
      });

      logger.info(`Bank transfer created: ${reference || 'N/A'}`, {
        userId,
        fromAccountId,
        toAccountId,
        amount: amount.toString(),
      });

      res.status(201).json({
        success: true,
        message: 'Transfer completed successfully',
        transfer: {
          fromAccount: {
            id: result.fromAccount.id,
            accountNumber: result.fromAccount.accountNumber,
            newBalance: result.fromAccount.balance.toString(),
          },
          toAccount: {
            id: result.toAccount.id,
            accountNumber: result.toAccount.accountNumber,
            newBalance: result.toAccount.balance.toString(),
          },
          withdrawal: {
            id: result.withdrawal.id,
            amount: result.withdrawal.amount.toString(),
            transactionDate: result.withdrawal.transactionDate,
          },
          deposit: {
            id: result.deposit.id,
            amount: result.deposit.amount.toString(),
            transactionDate: result.deposit.transactionDate,
          },
        },
      });
    } catch (error: any) {
      if (error.message.includes('not found') || error.message.includes('Insufficient')) {
        return res.status(400).json({ error: error.message });
      }
      logger.error('Error creating bank transfer:', error);
      next(error);
    }
  }
);

// ===================================================================
// POST /api/bank/transactions - Record bank transaction
// ===================================================================
router.post(
  '/transactions',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        bankAccountId,
        transactionDate,
        description,
        amount,
        type,
        reference,
        checkNumber,
        notes,
      } = req.body;
      const userId = (req as any).user?.id;

      // Validation
      if (!bankAccountId) {
        return res.status(400).json({ error: 'Bank account ID is required' });
      }

      if (!amount || amount === 0) {
        return res.status(400).json({ error: 'Amount must be non-zero' });
      }

      if (!type || !['DEPOSIT', 'WITHDRAWAL', 'FEE', 'INTEREST'].includes(type)) {
        return res.status(400).json({ error: 'Invalid transaction type' });
      }

      const transaction = await recordBankTransaction({
        bankAccountId,
        transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
        description: description || 'Bank transaction',
        amount: new Decimal(amount.toString()),
        type,
        reference,
        checkNumber,
        notes,
      });

      logger.info(`Bank transaction recorded: ${transaction.reference || 'N/A'}`, {
        userId,
        transactionId: transaction.id,
      });

      res.status(201).json({
        success: true,
        message: 'Transaction recorded successfully',
        transaction: {
          id: transaction.id,
          bankAccountId: transaction.bankAccountId,
          transactionDate: transaction.transactionDate,
          description: transaction.description,
          amount: transaction.amount.toString(),
          type: transaction.type,
          reference: transaction.reference,
          checkNumber: transaction.checkNumber,
          isReconciled: transaction.isReconciled,
          createdAt: transaction.createdAt,
        },
      });
    } catch (error: any) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
      logger.error('Error recording bank transaction:', error);
      next(error);
    }
  }
);

// ===================================================================
// POST /api/bank/reconciliations - Start reconciliation
// ===================================================================
router.post(
  '/reconciliations',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        bankAccountId,
        startDate,
        endDate,
        openingBalance,
        closingBalance,
        statementBalance,
      } = req.body;
      const userId = (req as any).user?.id;

      // Validation
      if (!bankAccountId) {
        return res.status(400).json({ error: 'Bank account ID is required' });
      }

      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'Start date and end date are required' });
      }

      if (!statementBalance) {
        return res.status(400).json({ error: 'Statement balance is required' });
      }

      const reconciliation = await startReconciliation({
        bankAccountId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        statementBalance: new Decimal(statementBalance.toString()),
        reconciledBy: userId,
      });

      logger.info(`Reconciliation started: ${reconciliation.reconciliationNumber}`, {
        userId,
        reconciliationId: reconciliation.id,
      });

      res.status(201).json({
        success: true,
        message: 'Reconciliation started successfully',
        reconciliation: {
          id: reconciliation.id,
          reconciliationNumber: reconciliation.reconciliationNumber,
          bankAccountId: reconciliation.bankAccountId,
          startDate: reconciliation.startDate,
          endDate: reconciliation.endDate,
          openingBalance: reconciliation.openingBalance.toString(),
          closingBalance: reconciliation.closingBalance.toString(),
          statementBalance: reconciliation.statementBalance.toString(),
          bookBalance: reconciliation.bookBalance.toString(),
          difference: reconciliation.difference.toString(),
          status: reconciliation.status,
          createdAt: reconciliation.createdAt,
        },
      });
    } catch (error: any) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
      logger.error('Error starting reconciliation:', error);
      next(error);
    }
  }
);

// ===================================================================
// PUT /api/bank/reconciliations/:id/reconcile - Reconcile transactions
// ===================================================================
router.put(
  '/reconciliations/:id/reconcile',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { transactionIds } = req.body;

      // Validation
      if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
        return res.status(400).json({ error: 'Transaction IDs array is required' });
      }

      const result = await reconcileTransactions(id, transactionIds);

      logger.info(`Transactions reconciled: ${transactionIds.length}`, {
        userId: (req as any).user?.id,
        reconciliationId: id,
      });

      res.json({
        success: true,
        message: `${result.reconciledCount} transactions reconciled successfully`,
        reconciliation: {
          id: result.reconciliation.id,
          reconciliationNumber: result.reconciliation.reconciliationNumber,
          bookBalance: result.reconciliation.bookBalance.toString(),
          statementBalance: result.reconciliation.statementBalance.toString(),
          difference: result.reconciliation.difference.toString(),
          status: result.reconciliation.status,
          updatedAt: result.reconciliation.updatedAt,
        },
        reconciledCount: result.reconciledCount,
      });
    } catch (error: any) {
      if (error.message.includes('not found') || error.message.includes('cannot be reconciled')) {
        return res.status(400).json({ error: error.message });
      }
      logger.error('Error reconciling transactions:', error);
      next(error);
    }
  }
);

// ===================================================================
// PUT /api/bank/reconciliations/:id/complete - Complete reconciliation
// ===================================================================
router.put(
  '/reconciliations/:id/complete',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      const result = await completeReconciliation(id, notes);

      logger.info(`Reconciliation completed: ${result.reconciliation.reconciliationNumber}`, {
        userId: (req as any).user?.id,
        reconciliationId: id,
      });

      res.json({
        success: true,
        message: 'Reconciliation completed successfully',
        reconciliation: {
          id: result.reconciliation.id,
          reconciliationNumber: result.reconciliation.reconciliationNumber,
          bookBalance: result.reconciliation.bookBalance.toString(),
          statementBalance: result.reconciliation.statementBalance.toString(),
          difference: result.reconciliation.difference.toString(),
          status: result.reconciliation.status,
          completedAt: result.reconciliation.updatedAt,
        },
        bankAccount: {
          id: result.bankAccount.id,
          accountNumber: result.bankAccount.accountNumber,
          lastReconciled: result.bankAccount.lastReconciled,
        },
      });
    } catch (error: any) {
      if (error.message.includes('not found') || error.message.includes('Reconciliation difference')) {
        return res.status(400).json({ error: error.message });
      }
      logger.error('Error completing reconciliation:', error);
      next(error);
    }
  }
);

// ===================================================================
// GET /api/bank/reconciliations/:id - Get reconciliation details
// ===================================================================
router.get(
  '/reconciliations/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const summary = await getReconciliationSummary(id);

      logger.info(`Reconciliation summary retrieved: ${summary.reconciliation.reconciliationNumber}`, {
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        reconciliation: {
          id: summary.reconciliation.id,
          reconciliationNumber: summary.reconciliation.reconciliationNumber,
          bankAccountId: summary.reconciliation.bankAccountId,
          startDate: summary.reconciliation.startDate,
          endDate: summary.reconciliation.endDate,
          openingBalance: summary.reconciliation.openingBalance.toString(),
          closingBalance: summary.reconciliation.closingBalance.toString(),
          statementBalance: summary.reconciliation.statementBalance.toString(),
          bookBalance: summary.reconciliation.bookBalance.toString(),
          difference: summary.reconciliation.difference.toString(),
          status: summary.reconciliation.status,
          notes: summary.reconciliation.notes,
          createdAt: summary.reconciliation.createdAt,
          updatedAt: summary.reconciliation.updatedAt,
        },
        summary: {
          totalDebits: summary.totalDebits.toString(),
          totalCredits: summary.totalCredits.toString(),
          netChange: summary.netChange.toString(),
          transactionCount: summary.transactionCount,
          reconciledCount: summary.reconciledCount,
          unreconciledCount: summary.unreconciledCount,
        },
        transactions: summary.transactions.map((t: any) => ({
          id: t.id,
          transactionDate: t.transactionDate,
          description: t.description,
          amount: t.amount.toString(),
          type: t.type,
          reference: t.reference,
          isReconciled: t.isReconciled,
          reconciledDate: t.reconciledDate,
        })),
      });
    } catch (error: any) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
      logger.error('Error retrieving reconciliation summary:', error);
      next(error);
    }
  }
);

// ===================================================================
// GET /api/bank/accounts/:accountId/unreconciled - Get unreconciled transactions
// ===================================================================
router.get(
  '/accounts/:accountId/unreconciled',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { accountId } = req.params;
      const { startDate, endDate } = req.query;

      const transactions = await getUnreconciledTransactions(
        accountId,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );

      const totalDebits = transactions
        .filter((t: any) => ['WITHDRAWAL', 'FEE'].includes(t.type))
        .reduce((sum: Decimal, t: any) => sum.plus(new Decimal(t.amount.toString()).abs()), new Decimal(0));

      const totalCredits = transactions
        .filter((t: any) => ['DEPOSIT', 'INTEREST'].includes(t.type))
        .reduce((sum: Decimal, t: any) => sum.plus(new Decimal(t.amount.toString())), new Decimal(0));

      const formattedTransactions = transactions.map((t: any) => ({
        id: t.id,
        transactionDate: t.transactionDate,
        description: t.description,
        amount: t.amount.toString(),
        type: t.type,
        reference: t.reference,
        checkNumber: t.checkNumber,
        createdAt: t.createdAt,
      }));

      logger.info(`Retrieved ${transactions.length} unreconciled transactions`, {
        userId: (req as any).user?.id,
        accountId,
      });

      res.json({
        success: true,
        transactions: formattedTransactions,
        summary: {
          count: transactions.length,
          totalDebits: totalDebits.toString(),
          totalCredits: totalCredits.toString(),
          netChange: totalCredits.minus(totalDebits).toString(),
        },
      });
    } catch (error) {
      logger.error('Error retrieving unreconciled transactions:', error);
      next(error);
    }
  }
);

// ===================================================================
// PATCH /api/bank/accounts/:id/status - Update account status
// ===================================================================
router.patch(
  '/accounts/:id/status',
  authenticate,
  authorize(['ADMIN']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;
      const userId = (req as any).user?.id;

      if (!status || !['ACTIVE', 'INACTIVE', 'CLOSED'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const account = await prisma.bankAccount.update({
        where: { id },
        data: {
          status,
          notes: notes ? `${status} - ${notes}` : undefined,
        },
      });

      logger.info(`Bank account status updated: ${account.accountNumber} -> ${status}`, {
        userId,
        accountId: id,
      });

      res.json({
        success: true,
        message: 'Bank account status updated successfully',
        account: {
          id: account.id,
          accountNumber: account.accountNumber,
          status: account.status,
          updatedAt: account.updatedAt,
        },
      });
    } catch (error) {
      logger.error('Error updating bank account status:', error);
      next(error);
    }
  }
);

export default router;
