import express from 'express';
import Decimal from 'decimal.js';
import prisma from '../config/database.js';
import { postLedger } from '../services/accounting/postLedger.js';
import type { TransactionInput } from '../services/accounting/models.js';
import { validatePositiveAmount } from '../services/accounting/validation.js';
import { formatErrorResponse } from '../services/accounting/errorHandling.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication to all accounting routes
router.use(authenticate);

/**
 * POST /api/accounting/invoice
 * Create an invoice and post accounting entries
 */
router.post('/invoice', async (req, res) => {
  try {
    const {
      invoiceId,
      customerId,
      amount,
      currency,
      description,
      accountsReceivableId,
      revenueAccountId,
    } = req.body;

    // Validate input
    const invoiceAmount = new Decimal(amount);
    validatePositiveAmount(invoiceAmount, 'Invoice amount');

    // Create ledger transaction
    const transaction: TransactionInput = {
      date: new Date(),
      description: description || `Invoice ${invoiceId} for customer ${customerId}`,
      refType: 'invoice',
      refId: invoiceId,
      entries: [
        {
          transactionId: '', // Will be set by postLedger
          accountId: accountsReceivableId,
          amount: invoiceAmount,
          type: 'debit',
          currency,
        },
        {
          transactionId: '', // Will be set by postLedger
          accountId: revenueAccountId,
          amount: invoiceAmount,
          type: 'credit',
          currency,
        },
      ],
    };

    const entries = await postLedger(transaction);

    res.status(201).json({
      success: true,
      message: 'Invoice created and posted to ledger',
      invoiceId,
      entries,
    });
  } catch (error) {
    const errorResponse = formatErrorResponse(error);
    res.status(errorResponse.error.statusCode).json(errorResponse);
  }
});

/**
 * POST /api/accounting/payment
 * Record a payment against an invoice
 */
router.post('/payment', async (req, res) => {
  try {
    const {
      paymentId,
      invoiceId,
      customerId,
      amount,
      currency,
      description,
      cashAccountId,
      accountsReceivableId,
    } = req.body;

    // Validate input
    const paymentAmount = new Decimal(amount);
    validatePositiveAmount(paymentAmount, 'Payment amount');

    // Create ledger transaction
    const transaction: TransactionInput = {
      date: new Date(),
      description:
        description ||
        `Payment ${paymentId} for invoice ${invoiceId} from customer ${customerId}`,
      refType: 'payment',
      refId: paymentId,
      entries: [
        {
          transactionId: '',
          accountId: cashAccountId,
          amount: paymentAmount,
          type: 'debit',
          currency,
        },
        {
          transactionId: '',
          accountId: accountsReceivableId,
          amount: paymentAmount,
          type: 'credit',
          currency,
        },
      ],
    };

    const entries = await postLedger(transaction);

    res.status(201).json({
      success: true,
      message: 'Payment recorded and posted to ledger',
      paymentId,
      invoiceId,
      entries,
    });
  } catch (error) {
    const errorResponse = formatErrorResponse(error);
    res.status(errorResponse.error.statusCode).json(errorResponse);
  }
});

/**
 * POST /api/accounting/deposit
 * Record a bank deposit
 */
router.post('/deposit', async (req, res) => {
  try {
    const {
      depositId,
      amount,
      currency,
      description,
      bankAccountId,
      sourceAccountId,
    } = req.body;

    // Validate input
    const depositAmount = new Decimal(amount);
    validatePositiveAmount(depositAmount, 'Deposit amount');

    // Create ledger transaction
    const transaction: TransactionInput = {
      date: new Date(),
      description: description || `Bank deposit ${depositId}`,
      refType: 'deposit',
      refId: depositId,
      entries: [
        {
          transactionId: '',
          accountId: bankAccountId,
          amount: depositAmount,
          type: 'debit',
          currency,
        },
        {
          transactionId: '',
          accountId: sourceAccountId,
          amount: depositAmount,
          type: 'credit',
          currency,
        },
      ],
    };

    const entries = await postLedger(transaction);

    res.status(201).json({
      success: true,
      message: 'Deposit recorded and posted to ledger',
      depositId,
      entries,
    });
  } catch (error) {
    const errorResponse = formatErrorResponse(error);
    res.status(errorResponse.error.statusCode).json(errorResponse);
  }
});

/**
 * POST /api/accounting/transfer
 * Record an inter-account transfer
 */
router.post('/transfer', async (req, res) => {
  try {
    const {
      transferId,
      amount,
      currency,
      description,
      fromAccountId,
      toAccountId,
    } = req.body;

    // Validate input
    const transferAmount = new Decimal(amount);
    validatePositiveAmount(transferAmount, 'Transfer amount');

    if (fromAccountId === toAccountId) {
      throw new Error('Cannot transfer to the same account');
    }

    // Create ledger transaction
    const transaction: TransactionInput = {
      date: new Date(),
      description: description || `Transfer ${transferId} from ${fromAccountId} to ${toAccountId}`,
      refType: 'transfer',
      refId: transferId,
      entries: [
        {
          transactionId: '',
          accountId: toAccountId,
          amount: transferAmount,
          type: 'debit',
          currency,
        },
        {
          transactionId: '',
          accountId: fromAccountId,
          amount: transferAmount,
          type: 'credit',
          currency,
        },
      ],
    };

    const entries = await postLedger(transaction);

    res.status(201).json({
      success: true,
      message: 'Transfer recorded and posted to ledger',
      transferId,
      entries,
    });
  } catch (error) {
    const errorResponse = formatErrorResponse(error);
    res.status(errorResponse.error.statusCode).json(errorResponse);
  }
});

/**
 * POST /api/accounting/loan
 * Create a loan
 */
router.post('/loan', async (req, res) => {
  try {
    const {
      loanId,
      amount,
      currency,
      description,
      loanAccountId,
      cashAccountId,
    } = req.body;

    // Validate input
    const loanAmount = new Decimal(amount);
    validatePositiveAmount(loanAmount, 'Loan amount');

    // Create ledger transaction
    const transaction: TransactionInput = {
      date: new Date(),
      description: description || `Loan ${loanId} received`,
      refType: 'loan',
      refId: loanId,
      entries: [
        {
          transactionId: '',
          accountId: cashAccountId,
          amount: loanAmount,
          type: 'debit',
          currency,
        },
        {
          transactionId: '',
          accountId: loanAccountId,
          amount: loanAmount,
          type: 'credit',
          currency,
        },
      ],
    };

    const entries = await postLedger(transaction);

    res.status(201).json({
      success: true,
      message: 'Loan created and posted to ledger',
      loanId,
      entries,
    });
  } catch (error) {
    const errorResponse = formatErrorResponse(error);
    res.status(errorResponse.error.statusCode).json(errorResponse);
  }
});

/**
 * POST /api/accounting/loan/:loanId/repay
 * Record a loan repayment
 */
router.post('/loan/:loanId/repay', async (req, res) => {
  try {
    const { loanId } = req.params;
    const {
      repaymentId,
      amount,
      currency,
      description,
      loanAccountId,
      cashAccountId,
    } = req.body;

    // Validate input
    const repaymentAmount = new Decimal(amount);
    validatePositiveAmount(repaymentAmount, 'Repayment amount');

    // Create ledger transaction
    const transaction: TransactionInput = {
      date: new Date(),
      description: description || `Loan ${loanId} repayment ${repaymentId}`,
      refType: 'loan-repayment',
      refId: repaymentId,
      entries: [
        {
          transactionId: '',
          accountId: loanAccountId,
          amount: repaymentAmount,
          type: 'debit',
          currency,
        },
        {
          transactionId: '',
          accountId: cashAccountId,
          amount: repaymentAmount,
          type: 'credit',
          currency,
        },
      ],
    };

    const entries = await postLedger(transaction);

    res.status(201).json({
      success: true,
      message: 'Loan repayment recorded and posted to ledger',
      loanId,
      repaymentId,
      entries,
    });
  } catch (error) {
    const errorResponse = formatErrorResponse(error);
    res.status(errorResponse.error.statusCode).json(errorResponse);
  }
});

/**
 * POST /api/accounting/delivery
 * Record a delivery and related costs
 */
router.post('/delivery', async (req, res) => {
  try {
    const {
      deliveryId,
      invoiceId,
      amount,
      currency,
      description,
      deliveryExpenseAccountId,
      payableAccountId,
    } = req.body;

    // Validate input
    const deliveryAmount = new Decimal(amount);
    validatePositiveAmount(deliveryAmount, 'Delivery amount');

    // Create ledger transaction
    const transaction: TransactionInput = {
      date: new Date(),
      description:
        description || `Delivery ${deliveryId} for invoice ${invoiceId}`,
      refType: 'delivery',
      refId: deliveryId,
      entries: [
        {
          transactionId: '',
          accountId: deliveryExpenseAccountId,
          amount: deliveryAmount,
          type: 'debit',
          currency,
        },
        {
          transactionId: '',
          accountId: payableAccountId,
          amount: deliveryAmount,
          type: 'credit',
          currency,
        },
      ],
    };

    const entries = await postLedger(transaction);

    res.status(201).json({
      success: true,
      message: 'Delivery recorded and posted to ledger',
      deliveryId,
      invoiceId,
      entries,
    });
  } catch (error) {
    const errorResponse = formatErrorResponse(error);
    res.status(errorResponse.error.statusCode).json(errorResponse);
  }
});

// ============================================================================
// GET ENDPOINTS - Query and Retrieve Data
// ============================================================================

/**
 * GET /api/accounting/accounts
 * Get all accounts (chart of accounts)
 */
router.get('/accounts', async (req, res) => {
  try {
    const { type, isActive } = req.query;

    const accounts = await prisma.account.findMany({
      where: {
        ...(type && { type: type as string }),
        ...(isActive !== undefined && { isActive: isActive === 'true' }),
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    res.status(200).json({
      success: true,
      accounts: accounts.map((acc: any) => ({
        ...acc,
        balance: acc.balance.toString(),
      })),
    });
  } catch (error) {
    const errorResponse = formatErrorResponse(error);
    res.status(errorResponse.error.statusCode).json(errorResponse);
  }
});

/**
 * GET /api/accounting/accounts/:id
 * Get a specific account by ID
 */
router.get('/accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const account = await prisma.account.findUnique({
      where: { id },
      include: {
        ledgerEntries: {
          include: {
            transaction: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 50, // Last 50 entries
        },
      },
    });

    if (!account) {
      return res.status(404).json({
        error: {
          message: 'Account not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
    }

    res.status(200).json({
      success: true,
      account: {
        ...account,
        balance: account.balance.toString(),
        ledgerEntries: account.ledgerEntries.map((entry: any) => ({
          ...entry,
          amount: entry.amount.toString(),
          exchangeRate: entry.exchangeRate?.toString(),
        })),
      },
    });
  } catch (error) {
    const errorResponse = formatErrorResponse(error);
    res.status(errorResponse.error.statusCode).json(errorResponse);
  }
});

/**
 * GET /api/accounting/transactions
 * Get all transactions with filters
 */
router.get('/transactions', async (req, res) => {
  try {
    const { refType, refId, startDate, endDate, limit = '50' } = req.query;

    const transactions = await prisma.transaction.findMany({
      where: {
        ...(refType && { refType: refType as string }),
        ...(refId && { refId: refId as string }),
        ...(startDate && {
          date: {
            gte: new Date(startDate as string),
            ...(endDate && { lte: new Date(endDate as string) }),
          },
        }),
      },
      include: {
        ledgerEntries: {
          include: {
            account: true,
          },
        },
      },
      orderBy: { date: 'desc' },
      take: parseInt(limit as string),
    });

    res.status(200).json({
      success: true,
      transactions: transactions.map((tx: any) => ({
        ...tx,
        ledgerEntries: tx.ledgerEntries.map((entry: any) => ({
          ...entry,
          amount: entry.amount.toString(),
          exchangeRate: entry.exchangeRate?.toString(),
        })),
      })),
    });
  } catch (error) {
    const errorResponse = formatErrorResponse(error);
    res.status(errorResponse.error.statusCode).json(errorResponse);
  }
});

/**
 * GET /api/accounting/transactions/:id
 * Get a specific transaction by ID
 */
router.get('/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: {
        ledgerEntries: {
          include: {
            account: true,
          },
        },
      },
    });

    if (!transaction) {
      return res.status(404).json({
        error: {
          message: 'Transaction not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
    }

    res.status(200).json({
      success: true,
      transaction: {
        ...transaction,
        ledgerEntries: transaction.ledgerEntries.map((entry: any) => ({
          ...entry,
          amount: entry.amount.toString(),
          exchangeRate: entry.exchangeRate?.toString(),
        })),
      },
    });
  } catch (error) {
    const errorResponse = formatErrorResponse(error);
    res.status(errorResponse.error.statusCode).json(errorResponse);
  }
});

/**
 * GET /api/accounting/balance/:accountId
 * Get current balance for a specific account
 */
router.get('/balance/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;

    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return res.status(404).json({
        error: {
          message: 'Account not found',
          code: 'NOT_FOUND',
          statusCode: 404,
        },
      });
    }

    res.status(200).json({
      success: true,
      accountId: account.id,
      accountName: account.name,
      accountType: account.type,
      balance: account.balance.toString(),
      currency: account.currency,
    });
  } catch (error) {
    const errorResponse = formatErrorResponse(error);
    res.status(errorResponse.error.statusCode).json(errorResponse);
  }
});

/**
 * GET /api/accounting/trial-balance
 * Get trial balance (all account balances)
 */
router.get('/trial-balance', async (req, res) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { isActive: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    let totalDebits = new Decimal(0);
    let totalCredits = new Decimal(0);

    const balances = accounts.map((account: any) => {
      const balance = new Decimal(account.balance);
      
      // Determine normal balance side
      if (account.type === 'asset' || account.type === 'expense') {
        if (balance.greaterThanOrEqualTo(0)) {
          totalDebits = totalDebits.plus(balance);
        } else {
          totalCredits = totalCredits.plus(balance.abs());
        }
      } else {
        if (balance.greaterThanOrEqualTo(0)) {
          totalCredits = totalCredits.plus(balance);
        } else {
          totalDebits = totalDebits.plus(balance.abs());
        }
      }

      return {
        id: account.id,
        name: account.name,
        type: account.type,
        balance: balance.toString(),
        currency: account.currency,
      };
    });

    res.status(200).json({
      success: true,
      balances,
      totalDebits: totalDebits.toString(),
      totalCredits: totalCredits.toString(),
      balanced: totalDebits.equals(totalCredits),
    });
  } catch (error) {
    const errorResponse = formatErrorResponse(error);
    res.status(errorResponse.error.statusCode).json(errorResponse);
  }
});

export default router;
