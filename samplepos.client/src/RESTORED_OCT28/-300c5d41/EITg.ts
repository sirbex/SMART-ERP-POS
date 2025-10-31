import type { Request, Response } from 'express';
import Decimal from 'decimal.js';
import { postLedger } from '../postLedger';
import type { TransactionInput } from '../models';
import { validatePositiveAmount } from '../helpers/validation';
import { formatErrorResponse } from '../helpers/errorHandling';

/**
 * POST /api/accounting/loan
 * Create a loan
 *
 * Body:
 * {
 *   loanId: string,
 *   amount: number,
 *   currency: string,
 *   description: string,
 *   loanAccountId: string (liability account),
 *   cashAccountId: string (asset account receiving funds)
 * }
 */
export async function createLoan(req: Request, res: Response) {
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

    // Create ledger transaction: Cash increases (debit), Loan liability increases (credit)
    const transaction: TransactionInput = {
      date: new Date(),
      description: description || `Loan ${loanId} received`,
      refType: 'loan',
      refId: loanId,
      entries: [
        {
          transactionId: '', // Will be set by postLedger
          accountId: cashAccountId,
          amount: loanAmount,
          type: 'debit',
          currency,
        },
        {
          transactionId: '', // Will be set by postLedger
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
}

/**
 * POST /api/accounting/loan/:loanId/repay
 * Record a loan repayment
 *
 * Body:
 * {
 *   repaymentId: string,
 *   amount: number,
 *   currency: string,
 *   description: string,
 *   loanAccountId: string (liability account),
 *   cashAccountId: string (asset account making payment)
 * }
 */
export async function repayLoan(req: Request, res: Response) {
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

    // Create ledger transaction: Loan liability decreases (debit), Cash decreases (credit)
    const transaction: TransactionInput = {
      date: new Date(),
      description: description || `Loan ${loanId} repayment ${repaymentId}`,
      refType: 'loan-repayment',
      refId: repaymentId,
      entries: [
        {
          transactionId: '', // Will be set by postLedger
          accountId: loanAccountId,
          amount: repaymentAmount,
          type: 'debit',
          currency,
        },
        {
          transactionId: '', // Will be set by postLedger
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
}

/**
 * GET /api/accounting/loan/:loanId
 * Get loan accounting entries
 */
export async function getLoan(req: Request, res: Response) {
  try {
    const { loanId } = req.params;

    // TODO: Query ledger entries by refType='loan' and refId=loanId

    res.status(200).json({
      success: true,
      loanId,
      message: 'Loan retrieval not yet implemented',
    });
  } catch (error) {
    const errorResponse = formatErrorResponse(error);
    res.status(errorResponse.error.statusCode).json(errorResponse);
  }
}
