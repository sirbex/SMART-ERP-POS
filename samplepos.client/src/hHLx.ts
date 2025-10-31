import type { Request, Response } from 'express';
import Decimal from 'decimal.js';
import { postLedger } from '../postLedger';
import type { TransactionInput } from '../models';
import { validatePositiveAmount } from '../helpers/validation';
import { formatErrorResponse } from '../helpers/errorHandling';

/**
 * POST /api/accounting/deposit
 * Record a bank deposit
 *
 * Body:
 * {
 *   depositId: string,
 *   amount: number,
 *   currency: string,
 *   description: string,
 *   bankAccountId: string,
 *   sourceAccountId: string (e.g., cash or undeposited funds account)
 * }
 */
export async function createDeposit(req: Request, res: Response) {
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
          transactionId: '', // Will be set by postLedger
          accountId: bankAccountId,
          amount: depositAmount,
          type: 'debit',
          currency,
        },
        {
          transactionId: '', // Will be set by postLedger
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
}

/**
 * GET /api/accounting/deposit/:depositId
 * Get deposit accounting entries
 */
export async function getDeposit(req: Request, res: Response) {
  try {
    const { depositId } = req.params;

    // TODO: Query ledger entries by refType='deposit' and refId=depositId

    res.status(200).json({
      success: true,
      depositId,
      message: 'Deposit retrieval not yet implemented',
    });
  } catch (error) {
    const errorResponse = formatErrorResponse(error);
    res.status(errorResponse.error.statusCode).json(errorResponse);
  }
}
