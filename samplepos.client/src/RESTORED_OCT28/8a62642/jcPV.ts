import prisma from '../../config/database.js';
import Decimal from 'decimal.js';
import type { TransactionInput } from './models.js';
import { TransactionSchema, LedgerEntrySchema } from './models.js';

/**
 * Atomic double-entry ledger posting
 * @param transaction TransactionInput
 * @returns Array of created LedgerEntry records
 */
export async function postLedger(transaction: TransactionInput): Promise<any[]> {
  // Validate input
  const parsed = TransactionSchema.safeParse(transaction);
  if (!parsed.success) {
    throw new Error('Invalid transaction input: ' + JSON.stringify(parsed.error.issues));
  }
  const tx = parsed.data;

  // Double-entry enforcement: sum of debits == sum of credits
  const debitTotal = tx.entries
    .filter(e => e.type === 'debit')
    .reduce((sum, e) => sum.plus(e.amount), new Decimal(0));
  const creditTotal = tx.entries
    .filter(e => e.type === 'credit')
    .reduce((sum, e) => sum.plus(e.amount), new Decimal(0));
  if (!debitTotal.equals(creditTotal)) {
    throw new Error(`Double-entry violation: debits (${debitTotal}) != credits (${creditTotal})`);
  }

  // Atomic DB transaction
  return await prisma.$transaction(async (db: any) => {
    // Create Transaction record
    const transactionRecord = await db.transaction.create({
      data: {
        date: tx.date,
        description: tx.description,
        refType: tx.refType,
        refId: tx.refId,
      },
    });

    // Create LedgerEntry records and update account balances
    const entries = await Promise.all(
      tx.entries.map(async (entry: any) => {
        // Validate each entry
        const entryParsed = LedgerEntrySchema.safeParse(entry);
        if (!entryParsed.success) {
          throw new Error('Invalid ledger entry: ' + JSON.stringify(entryParsed.error.issues));
        }
        const e = entryParsed.data;

        // Get account to determine its type
        const account = await db.account.findUnique({
          where: { id: e.accountId },
        });

        if (!account) {
          throw new Error(`Account not found: ${e.accountId}`);
        }

        // Calculate balance adjustment based on account type
        const amount = new Decimal(e.amount.toString());
        let balanceAdjustment = new Decimal(0);

        if (e.type === 'debit') {
          // Debit increases: Assets, Expenses
          // Debit decreases: Liabilities, Equity, Income
          if (account.type === 'asset' || account.type === 'expense') {
            balanceAdjustment = amount;
          } else {
            balanceAdjustment = amount.negated();
          }
        } else {
          // Credit increases: Liabilities, Equity, Income
          // Credit decreases: Assets, Expenses
          if (account.type === 'liability' || account.type === 'equity' || account.type === 'income') {
            balanceAdjustment = amount;
          } else {
            balanceAdjustment = amount.negated();
          }
        }

        // Update account balance
        await db.account.update({
          where: { id: e.accountId },
          data: {
            balance: {
              increment: balanceAdjustment.toString(),
            },
          },
        });

        // Create ledger entry
        return db.ledgerEntry.create({
          data: {
            transactionId: transactionRecord.id,
            accountId: e.accountId,
            amount: e.amount.toString(), // Store as string for Decimal
            type: e.type,
            currency: e.currency,
            exchangeRate: e.exchangeRate?.toString(),
            refType: e.refType,
            refId: e.refId,
            createdAt: new Date(),
          },
        });
      })
    );
    return entries;
  });
}
