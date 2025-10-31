import Decimal from 'decimal.js';
import prisma from '../../config/database.js';

/**
 * Bank Service
 * Handles bank account management, transfers, and reconciliation with bank-grade precision
 */

// Configure Decimal.js for bank-grade precision
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

/**
 * Create bank transfer between two bank accounts
 */
export async function createBankTransfer(params: {
  fromAccountId: string;
  toAccountId: string;
  amount: Decimal;
  description: string;
  reference?: string;
  transferDate: Date;
}) {
  const { fromAccountId, toAccountId, amount, description, reference, transferDate } = params;

  if (amount.lessThanOrEqualTo(0)) {
    throw new Error('Transfer amount must be positive');
  }

  // Verify both accounts exist
  const [fromAccount, toAccount] = await Promise.all([
    prisma.bankAccount.findUnique({ where: { id: fromAccountId } }),
    prisma.bankAccount.findUnique({ where: { id: toAccountId } }),
  ]);

  if (!fromAccount) throw new Error('Source bank account not found');
  if (!toAccount) throw new Error('Destination bank account not found');
  if (!fromAccount.isActive) throw new Error('Source account is inactive');
  if (!toAccount.isActive) throw new Error('Destination account is inactive');

  // Create both transactions atomically
  const result = await prisma.$transaction(async (tx: any) => {
    // Debit from source account
    const debitTransaction = await tx.bankTransaction.create({
      data: {
        bankAccountId: fromAccountId,
        transactionDate: transferDate,
        description: `Transfer to ${toAccount.accountName} - ${description}`,
        amount: amount.negated().toString(),
        type: 'DEBIT',
        reference: reference || `XFER-${Date.now()}`,
      },
    });

    // Credit to destination account
    const creditTransaction = await tx.bankTransaction.create({
      data: {
        bankAccountId: toAccountId,
        transactionDate: transferDate,
        description: `Transfer from ${fromAccount.accountName} - ${description}`,
        amount: amount.toString(),
        type: 'CREDIT',
        reference: reference || `XFER-${Date.now()}`,
      },
    });

    // Update balances
    await tx.bankAccount.update({
      where: { id: fromAccountId },
      data: {
        bookBalance: { decrement: amount.toString() },
        balance: { decrement: amount.toString() },
      },
    });

    await tx.bankAccount.update({
      where: { id: toAccountId },
      data: {
        bookBalance: { increment: amount.toString() },
        balance: { increment: amount.toString() },
      },
    });

    return { debitTransaction, creditTransaction };
  });

  return result;
}

/**
 * Record a bank transaction (from statement import or manual entry)
 */
export async function recordBankTransaction(params: {
  bankAccountId: string;
  transactionDate: Date;
  description: string;
  amount: Decimal;
  type: 'DEBIT' | 'CREDIT' | 'FEE' | 'INTEREST';
  reference?: string;
  checkNumber?: string;
  notes?: string;
}) {
  const { bankAccountId, transactionDate, description, amount, type, reference, checkNumber, notes } = params;

  const bankAccount = await prisma.bankAccount.findUnique({ where: { id: bankAccountId } });

  if (!bankAccount) throw new Error('Bank account not found');

  // Determine if this increases or decreases balance
  const isIncrease = type === 'CREDIT' || type === 'INTEREST';
  const actualAmount = isIncrease ? amount : amount.negated();

  const transaction = await prisma.$transaction(async (tx: any) => {
    // Create transaction record
    const record = await tx.bankTransaction.create({
      data: {
        bankAccountId,
        transactionDate,
        description,
        amount: actualAmount.toString(),
        type,
        reference,
        checkNumber,
        notes,
      },
    });

    // Update bank balance
    await tx.bankAccount.update({
      where: { id: bankAccountId },
      data: {
        bankBalance: { increment: actualAmount.toString() },
      },
    });

    return record;
  });

  return transaction;
}

/**
 * Start a new bank reconciliation
 */
export async function startReconciliation(params: {
  bankAccountId: string;
  startDate: Date;
  endDate: Date;
  statementBalance: Decimal;
  reconciledBy: string;
}) {
  const { bankAccountId, startDate, endDate, statementBalance, reconciledBy } = params;

  const bankAccount = await prisma.bankAccount.findUnique({ where: { id: bankAccountId } });

  if (!bankAccount) throw new Error('Bank account not found');

  const reconciliationNumber = `RECON-${Date.now()}`;

  const reconciliation = await prisma.bankReconciliation.create({
    data: {
      bankAccountId,
      reconciliationNumber,
      startDate,
      endDate,
      openingBalance: bankAccount.balance.toString(),
      closingBalance: '0', // Will be calculated as transactions are reconciled
      statementBalance: statementBalance.toString(),
      bookBalance: bankAccount.bookBalance.toString(),
      difference: '0',
      status: 'IN_PROGRESS',
      reconciledBy,
    },
  });

  return reconciliation;
}

/**
 * Mark transactions as reconciled
 */
export async function reconcileTransactions(
  reconciliationId: string,
  transactionIds: string[]
) {
  const reconciliation = await prisma.bankReconciliation.findUnique({
    where: { id: reconciliationId },
  });

  if (!reconciliation) throw new Error('Reconciliation not found');
  if (reconciliation.status !== 'IN_PROGRESS') {
    throw new Error('Reconciliation is not in progress');
  }

  // Mark transactions as reconciled
  await prisma.bankTransaction.updateMany({
    where: {
      id: { in: transactionIds },
      bankAccountId: reconciliation.bankAccountId,
    },
    data: {
      isReconciled: true,
      reconciledDate: new Date(),
      reconciliationId,
    },
  });

  // Recalculate reconciliation totals
  const reconciledTransactions = await prisma.bankTransaction.findMany({
    where: {
      reconciliationId,
      isReconciled: true,
    },
  });

  const closingBalance = reconciledTransactions.reduce(
    (sum, tx) => sum.plus(new Decimal(tx.amount.toString())),
    new Decimal(reconciliation.openingBalance.toString())
  );

  const statementBalance = new Decimal(reconciliation.statementBalance.toString());
  const difference = closingBalance.minus(statementBalance);

  // Update reconciliation
  await prisma.bankReconciliation.update({
    where: { id: reconciliationId },
    data: {
      closingBalance: closingBalance.toString(),
      difference: difference.toString(),
    },
  });

  return {
    closingBalance: closingBalance.toString(),
    statementBalance: statementBalance.toString(),
    difference: difference.toString(),
    isBalanced: difference.abs().lessThan('0.01'), // Allow 1 cent tolerance
  };
}

/**
 * Complete a reconciliation
 */
export async function completeReconciliation(reconciliationId: string) {
  const reconciliation = await prisma.bankReconciliation.findUnique({
    where: { id: reconciliationId },
    include: {
      transactions: true,
    },
  });

  if (!reconciliation) throw new Error('Reconciliation not found');

  const difference = new Decimal(reconciliation.difference.toString());
  const isBalanced = difference.abs().lessThan('0.01'); // 1 cent tolerance

  const updated = await prisma.bankReconciliation.update({
    where: { id: reconciliationId },
    data: {
      status: isBalanced ? 'RECONCILED' : 'DISCREPANCY',
      reconciledDate: new Date(),
    },
  });

  // Update bank account's last reconciled date if balanced
  if (isBalanced) {
    await prisma.bankAccount.update({
      where: { id: reconciliation.bankAccountId },
      data: {
        lastReconciled: reconciliation.endDate,
      },
    });
  }

  return updated;
}

/**
 * Get unreconciled transactions for a bank account
 */
export async function getUnreconciledTransactions(
  bankAccountId: string,
  startDate?: Date,
  endDate?: Date
) {
  const where: any = {
    bankAccountId,
    isReconciled: false,
  };

  if (startDate || endDate) {
    where.transactionDate = {};
    if (startDate) where.transactionDate.gte = startDate;
    if (endDate) where.transactionDate.lte = endDate;
  }

  const transactions = await prisma.bankTransaction.findMany({
    where,
    orderBy: { transactionDate: 'asc' },
  });

  return transactions;
}

/**
 * Get reconciliation summary
 */
export async function getReconciliationSummary(reconciliationId: string) {
  const reconciliation = await prisma.bankReconciliation.findUnique({
    where: { id: reconciliationId },
    include: {
      bankAccount: true,
      transactions: {
        orderBy: { transactionDate: 'asc' },
      },
    },
  });

  if (!reconciliation) throw new Error('Reconciliation not found');

  const transactions = reconciliation.transactions;
  const debits = transactions
    .filter(t => new Decimal(t.amount.toString()).lessThan(0))
    .reduce((sum, t) => sum.plus(new Decimal(t.amount.toString()).abs()), new Decimal(0));

  const credits = transactions
    .filter(t => new Decimal(t.amount.toString()).greaterThan(0))
    .reduce((sum, t) => sum.plus(new Decimal(t.amount.toString())), new Decimal(0));

  return {
    ...reconciliation,
    summary: {
      totalDebits: debits.toString(),
      totalCredits: credits.toString(),
      netChange: credits.minus(debits).toString(),
      transactionCount: transactions.length,
      reconciledCount: transactions.filter(t => t.isReconciled).length,
      unreconciledCount: transactions.filter(t => !t.isReconciled).length,
    },
  };
}
