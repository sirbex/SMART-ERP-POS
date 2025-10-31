import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';

const prisma = new PrismaClient();

/**
 * Reporting and query utilities for accounting operations
 */

export interface AccountBalance {
  accountId: string;
  accountName: string;
  balance: Decimal;
  currency: string;
}

export interface LedgerStatement {
  accountId: string;
  accountName: string;
  entries: Array<{
    date: Date;
    transactionId: string;
    description: string;
    debit: Decimal | null;
    credit: Decimal | null;
    balance: Decimal;
  }>;
  openingBalance: Decimal;
  closingBalance: Decimal;
}

/**
 * Calculate account balance from ledger entries
 */
export async function getAccountBalance(
  accountId: string,
  asOfDate?: Date
): Promise<AccountBalance> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  const entries = await prisma.ledgerEntry.findMany({
    where: {
      accountId,
      ...(asOfDate && {
        createdAt: {
          lte: asOfDate,
        },
      }),
    },
  });

  let balance = new Decimal(0);

  for (const entry of entries) {
    const amount = new Decimal(entry.amount);
    if (entry.type === 'debit') {
      // Asset/Expense accounts increase with debits
      if (account.type === 'asset' || account.type === 'expense') {
        balance = balance.plus(amount);
      } else {
        balance = balance.minus(amount);
      }
    } else {
      // Liability/Equity/Income accounts increase with credits
      if (
        account.type === 'liability' ||
        account.type === 'equity' ||
        account.type === 'income'
      ) {
        balance = balance.plus(amount);
      } else {
        balance = balance.minus(amount);
      }
    }
  }

  return {
    accountId: account.id,
    accountName: account.name,
    balance,
    currency: entries[0]?.currency || 'UGX',
  };
}

/**
 * Generate a ledger statement for an account
 */
export async function generateLedgerStatement(
  accountId: string,
  startDate?: Date,
  endDate?: Date
): Promise<LedgerStatement> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  // Get opening balance
  const openingBalance = startDate
    ? (await getAccountBalance(accountId, startDate)).balance
    : new Decimal(0);

  // Get entries in date range
  const entries = await prisma.ledgerEntry.findMany({
    where: {
      accountId,
      ...(startDate && {
        createdAt: {
          gte: startDate,
          ...(endDate && { lte: endDate }),
        },
      }),
    },
    include: {
      transaction: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  let runningBalance = openingBalance;
  const statementEntries = entries.map((entry: any) => {
    const amount = new Decimal(entry.amount);
    const isDebit = entry.type === 'debit';

    // Update running balance based on account type
    if (isDebit) {
      if (account.type === 'asset' || account.type === 'expense') {
        runningBalance = runningBalance.plus(amount);
      } else {
        runningBalance = runningBalance.minus(amount);
      }
    } else {
      if (
        account.type === 'liability' ||
        account.type === 'equity' ||
        account.type === 'income'
      ) {
        runningBalance = runningBalance.plus(amount);
      } else {
        runningBalance = runningBalance.minus(amount);
      }
    }

    return {
      date: entry.transaction.date,
      transactionId: entry.transactionId,
      description: entry.transaction.description,
      debit: isDebit ? amount : null,
      credit: !isDebit ? amount : null,
      balance: runningBalance,
    };
  });

  return {
    accountId: account.id,
    accountName: account.name,
    entries: statementEntries,
    openingBalance,
    closingBalance: runningBalance,
  };
}

/**
 * Get trial balance (all accounts with their balances)
 */
export async function getTrialBalance(asOfDate?: Date): Promise<{
  accounts: AccountBalance[];
  totalDebits: Decimal;
  totalCredits: Decimal;
  balanced: boolean;
}> {
  const accounts = await prisma.account.findMany();

  const balances = await Promise.all(
    accounts.map((account: any) => getAccountBalance(account.id, asOfDate))
  );

  let totalDebits = new Decimal(0);
  let totalCredits = new Decimal(0);

  for (const balance of balances) {
    const account = accounts.find((a: any) => a.id === balance.accountId);
    if (!account) continue;

    // Debit balances: Asset and Expense accounts
    if (
      (account.type === 'asset' || account.type === 'expense') &&
      balance.balance.greaterThan(0)
    ) {
      totalDebits = totalDebits.plus(balance.balance);
    }
    // Credit balances: Liability, Equity, and Income accounts
    else if (
      (account.type === 'liability' ||
        account.type === 'equity' ||
        account.type === 'income') &&
      balance.balance.greaterThan(0)
    ) {
      totalCredits = totalCredits.plus(balance.balance);
    }
  }

  return {
    accounts: balances,
    totalDebits,
    totalCredits,
    balanced: totalDebits.equals(totalCredits),
  };
}

/**
 * Get transaction history for a reference (e.g., invoice, payment)
 */
export async function getTransactionHistory(
  refType: string,
  refId: string
): Promise<
  Array<{
    id: string;
    date: Date;
    description: string;
    entries: Array<{
      accountId: string;
      accountName: string;
      type: 'debit' | 'credit';
      amount: Decimal;
    }>;
  }>
> {
  const transactions = await prisma.transaction.findMany({
    where: {
      refType,
      refId,
    },
    include: {
      entries: {
        include: {
          account: true,
        },
      },
    },
    orderBy: {
      date: 'desc',
    },
  });

  return transactions.map((tx: any) => ({
    id: tx.id,
    date: tx.date,
    description: tx.description,
    entries: tx.entries.map((entry: any) => ({
      accountId: entry.accountId,
      accountName: entry.account.name,
      type: entry.type,
      amount: new Decimal(entry.amount),
    })),
  }));
}
