import type { Request, Response } from 'express';
import Decimal from 'decimal.js';
import { postLedger } from '../postLedger';
import type { TransactionInput } from '../models';
import { validatePositiveAmount } from '../helpers/validation';
import { formatErrorResponse } from '../helpers/errorHandling';

/**
 * POST /api/accounting/transfer
 * Record an inter-account transfer
 *
 * Body:
 * {
 *   transferId: string,
 *   amount: number,
 *   currency: string,
 *   description: string,
 *   fromAccountId: string,
 *   toAccountId: string
 * }
 */
export async function createTransfer(req: Request, res: Response) {
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
          transactionId: '', // Will be set by postLedger
          accountId: toAccountId,
          amount: transferAmount,
          type: 'debit',
          currency,
        },
        {
          transactionId: '', // Will be set by postLedger
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
}

/**
 * GET /api/accounting/transfer/:transferId
 * Get transfer accounting entries
 */
export async function getTransfer(req: Request, res: Response) {
  try {
    const { transferId } = req.params;

    // TODO: Query ledger entries by refType='transfer' and refId=transferId

    res.status(200).json({
      success: true,
      transferId,
      message: 'Transfer retrieval not yet implemented',
    });
  } catch (error) {
    const errorResponse = formatErrorResponse(error);
    res.status(errorResponse.error.statusCode).json(errorResponse);
  }
}
