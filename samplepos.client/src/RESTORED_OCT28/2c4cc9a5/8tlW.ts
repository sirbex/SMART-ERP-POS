import type { Request, Response } from 'express';
import Decimal from 'decimal.js';
import { postLedger } from '../postLedger';
import type { TransactionInput } from '../models';
import { validatePositiveAmount } from '../helpers/validation';
import { formatErrorResponse } from '../helpers/errorHandling';

/**
 * POST /api/accounting/payment
 * Record a payment against an invoice
 *
 * Body:
 * {
 *   paymentId: string,
 *   invoiceId: string,
 *   customerId: string,
 *   amount: number,
 *   currency: string,
 *   description: string,
 *   cashAccountId: string,
 *   accountsReceivableId: string
 * }
 */
export async function createPayment(req: Request, res: Response) {
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
          transactionId: '', // Will be set by postLedger
          accountId: cashAccountId,
          amount: paymentAmount,
          type: 'debit',
          currency,
        },
        {
          transactionId: '', // Will be set by postLedger
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
}

/**
 * GET /api/accounting/payment/:paymentId
 * Get payment accounting entries
 */
export async function getPayment(req: Request, res: Response) {
  try {
    const { paymentId } = req.params;

    // TODO: Query ledger entries by refType='payment' and refId=paymentId

    res.status(200).json({
      success: true,
      paymentId,
      message: 'Payment retrieval not yet implemented',
    });
  } catch (error) {
    const errorResponse = formatErrorResponse(error);
    res.status(errorResponse.error.statusCode).json(errorResponse);
  }
}
