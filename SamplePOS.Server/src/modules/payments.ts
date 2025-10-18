import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { Decimal } from '@prisma/client/runtime/library';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface PaymentAllocation {
  saleId: string;
  amount: number;
  description?: string;
}

interface SplitPaymentItem {
  method: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CHECK' | 'MOBILE_MONEY';
  amount: number;
  reference?: string;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const recordPaymentValidation = [
  body('customerId').isString().trim().notEmpty().withMessage('Valid customer ID required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Payment amount must be positive'),
  body('paymentMethod').isIn(['CASH', 'CARD', 'BANK_TRANSFER', 'CHECK', 'MOBILE_MONEY']).withMessage('Invalid payment method'),
  body('paymentDate').optional().isISO8601().withMessage('Invalid payment date'),
  body('reference').optional().isString().trim().notEmpty().withMessage('Reference must be non-empty string'),
  body('notes').optional().isString().trim().withMessage('Notes must be a string'),
  body('applyToDeposit').optional().isBoolean().withMessage('applyToDeposit must be boolean')
];

const splitPaymentValidation = [
  body('customerId').isString().trim().notEmpty().withMessage('Valid customer ID required'),
  body('totalAmount').isFloat({ min: 0.01 }).withMessage('Total amount must be positive'),
  body('payments').isArray({ min: 1 }).withMessage('At least one payment method required'),
  body('payments.*.method').isIn(['CASH', 'CARD', 'BANK_TRANSFER', 'CHECK', 'MOBILE_MONEY']).withMessage('Invalid payment method'),
  body('payments.*.amount').isFloat({ min: 0.01 }).withMessage('Each payment amount must be positive'),
  body('payments.*.reference').optional().isString().trim().notEmpty().withMessage('Reference must be non-empty string'),
  body('paymentDate').optional().isISO8601().withMessage('Invalid payment date'),
  body('notes').optional().isString().trim().withMessage('Notes must be a string')
];

const refundPaymentValidation = [
  param('id').isString().trim().notEmpty().withMessage('Valid transaction ID required'),
  body('amount').optional().isFloat({ min: 0.01 }).withMessage('Refund amount must be positive'),
  body('reason').isString().trim().notEmpty().withMessage('Refund reason is required'),
  body('refundMethod').optional().isIn(['CASH', 'CARD', 'BANK_TRANSFER', 'CHECK', 'MOBILE_MONEY']).withMessage('Invalid refund method')
];

const allocatePaymentValidation = [
  body('customerId').isString().trim().notEmpty().withMessage('Valid customer ID required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
  body('allocations').isArray({ min: 1 }).withMessage('At least one allocation required'),
  body('allocations.*.saleId').isString().trim().notEmpty().withMessage('Valid sale ID required'),
  body('allocations.*.amount').isFloat({ min: 0.01 }).withMessage('Allocation amount must be positive'),
  body('allocations.*.description').optional().isString().trim().withMessage('Description must be a string'),
  body('paymentMethod').isIn(['CASH', 'CARD', 'BANK_TRANSFER', 'CHECK', 'MOBILE_MONEY']).withMessage('Invalid payment method'),
  body('paymentDate').optional().isISO8601().withMessage('Invalid payment date'),
  body('reference').optional().isString().trim().notEmpty().withMessage('Reference must be non-empty string')
];

// ============================================================================
// HELPER FUNCTIONS (Reusable logic to avoid duplication)
// ============================================================================

/**
 * Calculate customer's current balance from database
 */
async function calculateCustomerBalance(customerId: string): Promise<Decimal> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { currentBalance: true }
  });
  return customer?.currentBalance || new Decimal(0);
}

/**
 * Find and allocate payment to outstanding sales (oldest first)
 */
async function autoAllocateToSales(
  customerId: string,
  amount: number,
  tx: any
): Promise<{ allocations: PaymentAllocation[]; remainingAmount: number }> {
  // Find outstanding sales for this customer (oldest first)
  const outstandingSales = await tx.sale.findMany({
    where: {
      customerId: customerId,
      paymentStatus: { in: ['PENDING', 'PARTIAL', 'INSTALLMENT'] },
      amountOutstanding: { gt: 0 }
    },
    orderBy: { saleDate: 'asc' },
    select: {
      id: true,
      amountOutstanding: true,
      saleNumber: true
    }
  });

  const allocations: PaymentAllocation[] = [];
  let remainingAmount = amount;

  for (const sale of outstandingSales) {
    if (remainingAmount <= 0) break;

    const outstanding = parseFloat(sale.amountOutstanding.toString());
    const amountToAllocate = Math.min(remainingAmount, outstanding);

    allocations.push({
      saleId: sale.id,
      amount: amountToAllocate,
      description: `Payment allocated to sale ${sale.saleNumber}`
    });

    remainingAmount -= amountToAllocate;
  }

  return { allocations, remainingAmount };
}

/**
 * Apply payment allocation to sales (update sale records)
 */
async function applySaleAllocations(
  allocations: PaymentAllocation[],
  tx: any
): Promise<void> {
  for (const allocation of allocations) {
    const sale = await tx.sale.findUnique({
      where: { id: allocation.saleId },
      select: { amountPaid: true, amountOutstanding: true }
    });

    if (!sale) continue;

    const newAmountPaid = new Decimal(sale.amountPaid || 0).plus(allocation.amount);
    const newAmountOutstanding = new Decimal(sale.amountOutstanding).minus(allocation.amount);
    const isPaid = newAmountOutstanding.lte(0);

    await tx.sale.update({
      where: { id: allocation.saleId },
      data: {
        amountPaid: newAmountPaid,
        amountOutstanding: isPaid ? new Decimal(0) : newAmountOutstanding,
        paymentStatus: isPaid ? 'PAID' : 'PARTIAL'
      }
    });
  }
}

/**
 * Create customer transaction record
 */
async function createCustomerTransaction(
  data: {
    customerId: string;
    type: 'PAYMENT' | 'REFUND' | 'ADJUSTMENT' | 'DEPOSIT' | 'CREDIT';
    amount: number;
    balance: Decimal;
    description: string;
    reference: string;
    notes?: string;
    createdById: string;
  },
  tx: any
) {
  return await tx.customerTransaction.create({
    data: {
      customerId: data.customerId,
      type: data.type,
      amount: new Decimal(data.amount),
      balance: data.balance,
      description: data.description,
      referenceId: data.reference,
      documentNumber: data.notes,
      createdBy: data.createdById
    }
  });
}

/**
 * Update customer financial stats
 */
async function updateCustomerStats(
  customerId: string,
  paymentAmount: number,
  tx: any
): Promise<void> {
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: { totalPayments: true, currentBalance: true }
  });

  if (!customer) return;

  await tx.customer.update({
    where: { id: customerId },
    data: {
      totalPayments: new Decimal(customer.totalPayments || 0).plus(paymentAmount),
      currentBalance: new Decimal(customer.currentBalance || 0).minus(paymentAmount),
      lastPaymentDate: new Date()
    }
  });
}

// ============================================================================
// ENDPOINT 1: RECORD PAYMENT
// POST /api/payments/record
// ============================================================================

router.post(
  '/record',
  recordPaymentValidation,
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const {
      customerId,
      amount,
      paymentMethod,
      paymentDate,
      reference,
      notes,
      applyToDeposit = false
    } = req.body;

    const userId = (req as any).user.userId;

    try {
      // Verify customer exists
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          name: true,
          currentBalance: true,
          depositBalance: true,
          autoApplyDeposit: true
        }
      });

      if (!customer) {
        res.status(404).json({ error: 'Customer not found' });
        return;
      }

      const paidDate = paymentDate ? new Date(paymentDate) : new Date();
      const paymentReference = reference || `PAY-${Date.now()}-${customerId}`;

      // Process payment in transaction
      const result = await prisma.$transaction(async (tx) => {
        const currentBalance = customer.currentBalance || new Decimal(0);
        
        let allocations: PaymentAllocation[] = [];
        let remainingAmount = amount;
        let appliedToDeposit = false;

        // Option 1: Apply to deposit if requested or auto-apply is enabled
        if (applyToDeposit || customer.autoApplyDeposit) {
          const newDepositBalance = new Decimal(customer.depositBalance || 0).plus(amount);
          
          await tx.customer.update({
            where: { id: customerId },
            data: {
              depositBalance: newDepositBalance,
              lastPaymentDate: paidDate
            }
          });

          appliedToDeposit = true;
          remainingAmount = 0;
        } else {
          // Option 2: Auto-allocate to outstanding sales
          const allocationResult = await autoAllocateToSales(customerId, amount, tx);
          allocations = allocationResult.allocations;
          remainingAmount = allocationResult.remainingAmount;

          // Apply allocations to sales
          if (allocations.length > 0) {
            await applySaleAllocations(allocations, tx);
          }

          // Update customer stats
          await updateCustomerStats(customerId, amount, tx);
        }

        // Create transaction record
        const newBalance = appliedToDeposit 
          ? currentBalance 
          : currentBalance.minus(amount);

        const transaction = await createCustomerTransaction({
          customerId,
          type: 'PAYMENT',
          amount,
          balance: newBalance,
          description: appliedToDeposit 
            ? `Payment applied to deposit balance`
            : allocations.length > 0
              ? `Payment allocated to ${allocations.length} sale(s)`
              : 'Payment recorded (no outstanding sales)',
          reference: paymentReference,
          notes: `Payment method: ${paymentMethod}${notes ? ' - ' + notes : ''}`,
          createdById: userId
        }, tx);

        return {
          transaction,
          allocations,
          remainingAmount,
          appliedToDeposit,
          newBalance
        };
      });

      logger.info(`Payment recorded: ${amount} for customer ${customerId}`, {
        customerId,
        amount,
        paymentMethod,
        allocations: result.allocations.length,
        appliedToDeposit: result.appliedToDeposit,
        userId
      });

      res.status(201).json({
        message: 'Payment recorded successfully',
        payment: {
          transactionId: result.transaction.id,
          amount,
          paymentMethod,
          paymentDate: paidDate,
          reference: paymentReference,
          appliedToDeposit: result.appliedToDeposit,
          allocations: result.allocations,
          remainingAmount: result.remainingAmount,
          newBalance: result.newBalance.toString()
        }
      });
    } catch (error: any) {
      logger.error('Error recording payment:', error);
      res.status(500).json({ error: 'Failed to record payment' });
    }
  }
);

// ============================================================================
// ENDPOINT 2: SPLIT PAYMENT
// POST /api/payments/split
// ============================================================================

router.post(
  '/split',
  splitPaymentValidation,
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const {
      customerId,
      totalAmount,
      payments,
      paymentDate,
      notes
    } = req.body;

    const userId = (req as any).user.userId;

    try {
      // Validate: Sum of split payments must equal total amount
      const paymentSum = payments.reduce(
        (sum: number, p: SplitPaymentItem) => sum + p.amount, 
        0
      );

      if (Math.abs(paymentSum - totalAmount) > 0.01) {
        res.status(400).json({ 
          error: 'Sum of split payments must equal total amount',
          expected: totalAmount,
          actual: paymentSum
        });
        return;
      }

      // Verify customer exists
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          name: true,
          currentBalance: true
        }
      });

      if (!customer) {
        res.status(404).json({ error: 'Customer not found' });
        return;
      }

      const paidDate = paymentDate ? new Date(paymentDate) : new Date();

      // Process split payment in transaction
      const result = await prisma.$transaction(async (tx) => {
        const currentBalance = customer.currentBalance || new Decimal(0);

        // Auto-allocate total amount to outstanding sales
        const { allocations, remainingAmount } = await autoAllocateToSales(
          customerId, 
          totalAmount, 
          tx
        );

        // Apply allocations to sales
        if (allocations.length > 0) {
          await applySaleAllocations(allocations, tx);
        }

        // Update customer stats
        await updateCustomerStats(customerId, totalAmount, tx);

        // Create individual transaction records for each payment method
        const transactions = [];
        for (let i = 0; i < payments.length; i++) {
          const payment = payments[i];
          const paymentReference = payment.reference || `SPLIT-${Date.now()}-${customerId}-${i + 1}`;
          
          const transaction = await createCustomerTransaction({
            customerId,
            type: 'PAYMENT',
            amount: payment.amount,
            balance: i === payments.length - 1 
              ? currentBalance.minus(totalAmount)
              : currentBalance.minus((i + 1) * payment.amount),
            description: `Split payment (${i + 1}/${payments.length}) - ${payment.method}`,
            reference: paymentReference,
            notes: notes,
            createdById: userId
          }, tx);

          transactions.push({
            id: transaction.id,
            method: payment.method,
            amount: payment.amount,
            reference: paymentReference
          });
        }

        return {
          transactions,
          allocations,
          remainingAmount,
          newBalance: currentBalance.minus(totalAmount)
        };
      });

      logger.info(`Split payment recorded: ${totalAmount} for customer ${customerId}`, {
        customerId,
        totalAmount,
        splitCount: payments.length,
        methods: payments.map((p: SplitPaymentItem) => p.method),
        userId
      });

      res.status(201).json({
        message: 'Split payment recorded successfully',
        payment: {
          totalAmount,
          splitCount: payments.length,
          transactions: result.transactions,
          allocations: result.allocations,
          remainingAmount: result.remainingAmount,
          newBalance: result.newBalance.toString()
        }
      });
    } catch (error: any) {
      logger.error('Error recording split payment:', error);
      res.status(500).json({ error: 'Failed to record split payment' });
    }
  }
);

// ============================================================================
// ENDPOINT 3: GET CUSTOMER PAYMENT HISTORY
// GET /api/payments/customer/:id/history
// ============================================================================

router.get(
  '/customer/:id/history',
  param('id').isString().trim().notEmpty().withMessage('Valid customer ID required'),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const customerId = req.params.id;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const type = req.query.type as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    try {
      // Build where clause
      const whereClause: any = { customerId };

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) whereClause.createdAt.gte = new Date(startDate);
        if (endDate) whereClause.createdAt.lte = new Date(endDate);
      }

      if (type) {
        if (!['PAYMENT', 'REFUND', 'ADJUSTMENT', 'DEPOSIT', 'CREDIT'].includes(type)) {
          res.status(400).json({ error: 'Invalid transaction type' });
          return;
        }
        whereClause.type = type;
      }

      // Get transactions with pagination
      const [transactions, totalCount] = await Promise.all([
        prisma.customerTransaction.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset
        }),
        prisma.customerTransaction.count({ where: whereClause })
      ]);

      // Calculate summary statistics
      const summary = await prisma.customerTransaction.aggregate({
        where: whereClause,
        _sum: { amount: true },
        _count: true
      });

      res.json({
        customerId,
        transactions: transactions.map(t => ({
          id: t.id,
          type: t.type,
          amount: t.amount.toString(),
          balance: t.balance.toString(),
          description: t.description,
          reference: t.referenceId,
          documentNumber: t.documentNumber,
          createdAt: t.createdAt,
          createdBy: t.createdBy
        })),
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount
        },
        summary: {
          totalTransactions: summary._count,
          totalAmount: summary._sum.amount?.toString() || '0'
        }
      });
    } catch (error: any) {
      logger.error('Error fetching payment history:', error);
      res.status(500).json({ error: 'Failed to fetch payment history' });
    }
  }
);

// ============================================================================
// ENDPOINT 4: REFUND PAYMENT
// POST /api/payments/:id/refund
// ============================================================================

router.post(
  '/:id/refund',
  refundPaymentValidation,
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const transactionId = req.params.id;
    const { amount, reason, refundMethod } = req.body;
    const userId = (req as any).user.userId;

    try {
      // Get original transaction
      const originalTransaction = await prisma.customerTransaction.findUnique({
        where: { id: transactionId }
      });

      if (!originalTransaction) {
        res.status(404).json({ error: 'Transaction not found' });
        return;
      }

      if (originalTransaction.type !== 'PAYMENT') {
        res.status(400).json({ error: 'Can only refund payment transactions' });
        return;
      }

      // Get customer for balance
      const customer = await prisma.customer.findUnique({
        where: { id: originalTransaction.customerId },
        select: { currentBalance: true }
      });

      if (!customer) {
        res.status(404).json({ error: 'Customer not found' });
        return;
      }

      const originalAmount = parseFloat(originalTransaction.amount.toString());
      const refundAmount = amount || originalAmount;

      // Validate refund amount
      if (refundAmount > originalAmount) {
        res.status(400).json({ 
          error: 'Refund amount cannot exceed original payment amount',
          originalAmount,
          requestedRefund: refundAmount
        });
        return;
      }

      // Check if already refunded
      const existingRefunds = await prisma.customerTransaction.findMany({
        where: {
          customerId: originalTransaction.customerId,
          type: 'REFUND',
          description: { contains: `Transaction #${transactionId}` }
        }
      });

      const totalRefunded = existingRefunds.reduce(
        (sum, t) => sum + parseFloat(t.amount.toString()), 
        0
      );

      if (totalRefunded + refundAmount > originalAmount) {
        res.status(400).json({ 
          error: 'Total refund would exceed original payment',
          originalAmount,
          alreadyRefunded: totalRefunded,
          requestedRefund: refundAmount,
          maxRefundable: originalAmount - totalRefunded
        });
        return;
      }

      // Process refund in transaction
      const result = await prisma.$transaction(async (tx) => {
        const currentBalance = customer.currentBalance || new Decimal(0);
        const newBalance = currentBalance.plus(refundAmount);

        // Create refund transaction
        const refundTransaction = await createCustomerTransaction({
          customerId: originalTransaction.customerId,
          type: 'REFUND',
          amount: refundAmount,
          balance: newBalance,
          description: `Refund for Transaction #${transactionId}: ${reason}`,
          reference: `REFUND-${transactionId}-${Date.now()}`,
          notes: `Refund method: ${refundMethod || 'CASH'}`,
          createdById: userId
        }, tx);

        // Update customer balance
        await tx.customer.update({
          where: { id: originalTransaction.customerId },
          data: {
            currentBalance: newBalance
          }
        });

        // Note: Payment allocations reversal logic removed as we don't store allocations in schema
        // In production, you would track this in a separate PaymentAllocation table

        return {
          refundTransaction,
          newBalance
        };
      });

      logger.info(`Payment refunded: ${refundAmount} for transaction ${transactionId}`, {
        transactionId,
        customerId: originalTransaction.customerId,
        refundAmount,
        reason,
        userId
      });

      res.json({
        message: 'Payment refunded successfully',
        refund: {
          transactionId: result.refundTransaction.id,
          originalTransactionId: transactionId,
          originalAmount,
          refundAmount,
          totalRefunded: totalRefunded + refundAmount,
          newBalance: result.newBalance.toString(),
          reason
        }
      });
    } catch (error: any) {
      logger.error('Error processing refund:', error);
      res.status(500).json({ error: 'Failed to process refund' });
    }
  }
);

// ============================================================================
// ENDPOINT 5: GET PAYMENT DETAILS
// GET /api/payments/:id
// ============================================================================

router.get(
  '/:id',
  param('id').isString().trim().notEmpty().withMessage('Valid transaction ID required'),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const transactionId = req.params.id;

    try {
      const transaction = await prisma.customerTransaction.findUnique({
        where: { id: transactionId }
      });

      if (!transaction) {
        res.status(404).json({ error: 'Transaction not found' });
        return;
      }

      // Get customer details
      const customer = await prisma.customer.findUnique({
        where: { id: transaction.customerId },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true
        }
      });

      // Get related refunds if this is a payment
      const refunds: any[] = [];
      if (transaction.type === 'PAYMENT') {
        const foundRefunds = await prisma.customerTransaction.findMany({
          where: {
            customerId: transaction.customerId,
            type: 'REFUND',
            description: { contains: `Transaction #${transactionId}` }
          },
          orderBy: { createdAt: 'desc' }
        });
        refunds.push(...foundRefunds);
      }

      res.json({
        transaction: {
          id: transaction.id,
          type: transaction.type,
          amount: transaction.amount.toString(),
          balance: transaction.balance.toString(),
          description: transaction.description,
          reference: transaction.referenceId,
          documentNumber: transaction.documentNumber,
          createdAt: transaction.createdAt,
          customer: customer,
          createdBy: transaction.createdBy
        },
        refunds: refunds.map(r => ({
          id: r.id,
          amount: r.amount.toString(),
          description: r.description,
          createdAt: r.createdAt,
          createdBy: r.createdBy
        })),
        summary: {
          totalRefunded: refunds.reduce(
            (sum, r) => sum + parseFloat(r.amount.toString()), 
            0
          ),
          isFullyRefunded: transaction.type === 'PAYMENT' && 
            refunds.reduce((sum, r) => sum + parseFloat(r.amount.toString()), 0) >= 
            parseFloat(transaction.amount.toString())
        }
      });
    } catch (error: any) {
      logger.error('Error fetching payment details:', error);
      res.status(500).json({ error: 'Failed to fetch payment details' });
    }
  }
);

// ============================================================================
// ENDPOINT 6: ALLOCATE PAYMENT TO SPECIFIC SALES
// POST /api/payments/allocate
// ============================================================================

router.post(
  '/allocate',
  allocatePaymentValidation,
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const {
      customerId,
      amount,
      allocations,
      paymentMethod,
      paymentDate,
      reference
    } = req.body;

    const userId = (req as any).user.userId;

    try {
      // Validate: Sum of allocations must equal total amount
      const allocationSum = allocations.reduce(
        (sum: number, a: PaymentAllocation) => sum + a.amount,
        0
      );

      if (Math.abs(allocationSum - amount) > 0.01) {
        res.status(400).json({
          error: 'Sum of allocations must equal payment amount',
          expected: amount,
          actual: allocationSum
        });
        return;
      }

      // Verify customer exists
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          name: true,
          currentBalance: true
        }
      });

      if (!customer) {
        res.status(404).json({ error: 'Customer not found' });
        return;
      }

      // Verify all sales exist and belong to customer
      const saleIds = allocations.map((a: PaymentAllocation) => a.saleId);
      const sales = await prisma.sale.findMany({
        where: {
          id: { in: saleIds },
          customerId: customerId
        },
        select: {
          id: true,
          amountOutstanding: true,
          saleNumber: true
        }
      });

      if (sales.length !== saleIds.length) {
        res.status(400).json({ 
          error: 'One or more sales not found or do not belong to customer',
          requestedSales: saleIds.length,
          foundSales: sales.length
        });
        return;
      }

      // Validate: Each allocation doesn't exceed outstanding amount
      for (const allocation of allocations) {
        const sale = sales.find(s => s.id === allocation.saleId);
        if (!sale) continue;

        const outstanding = parseFloat(sale.amountOutstanding.toString());
        if (allocation.amount > outstanding) {
          res.status(400).json({
            error: `Allocation exceeds outstanding amount for sale ${sale.saleNumber}`,
            saleId: allocation.saleId,
            outstanding,
            requested: allocation.amount
          });
          return;
        }
      }

      const paidDate = paymentDate ? new Date(paymentDate) : new Date();
      const paymentReference = reference || `ALLOC-${Date.now()}-${customerId}`;

      // Process payment allocation in transaction
      const result = await prisma.$transaction(async (tx) => {
        const currentBalance = customer.currentBalance || new Decimal(0);

        // Apply allocations to sales
        await applySaleAllocations(allocations, tx);

        // Update customer stats
        await updateCustomerStats(customerId, amount, tx);

        // Create transaction record
        const transaction = await createCustomerTransaction({
          customerId,
          type: 'PAYMENT',
          amount,
          balance: currentBalance.minus(amount),
          description: `Payment manually allocated to ${allocations.length} sale(s)`,
          reference: paymentReference,
          notes: `Manual allocation - Payment method: ${paymentMethod}`,
          createdById: userId
        }, tx);

        return {
          transaction,
          newBalance: currentBalance.minus(amount)
        };
      });

      logger.info(`Payment allocated: ${amount} for customer ${customerId}`, {
        customerId,
        amount,
        allocations: allocations.length,
        userId
      });

      res.status(201).json({
        message: 'Payment allocated successfully',
        payment: {
          transactionId: result.transaction.id,
          amount,
          paymentMethod,
          paymentDate: paidDate,
          reference: paymentReference,
          allocations,
          newBalance: result.newBalance.toString()
        }
      });
    } catch (error: any) {
      logger.error('Error allocating payment:', error);
      res.status(500).json({ error: 'Failed to allocate payment' });
    }
  }
);

export default router;
