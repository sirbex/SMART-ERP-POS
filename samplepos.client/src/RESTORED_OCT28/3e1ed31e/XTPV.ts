import type { Request, Response } from 'express';
import Decimal from 'decimal.js';
import { postLedger } from '../postLedger';
import type { TransactionInput } from '../models';
import { validatePositiveAmount } from '../helpers/validation';
import { formatErrorResponse } from '../helpers/errorHandling';

/**
 * POST /api/accounting/invoice
 * Create an invoice and post accounting entries
 *
 * Body:
 * {
 *   invoiceId: string,
 *   customerId: string,
 *   amount: number,
 *   currency: string,
 *   description: string,
 *   accountsReceivableId: string,
 *   revenueAccountId: string
 * }
 */
export async function createInvoice(req: Request, res: Response) {
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
}

/**
 * GET /api/accounting/invoice/:invoiceId
 * Get invoice accounting entries
 */
export async function getInvoice(req: Request, res: Response) {
  try {
    const { invoiceId } = req.params;

    // TODO: Query ledger entries by refType='invoice' and refId=invoiceId
    // For now, return a placeholder

    res.status(200).json({
      success: true,
      invoiceId,
      message: 'Invoice retrieval not yet implemented',
    });
  } catch (error) {
    const errorResponse = formatErrorResponse(error);
    res.status(errorResponse.error.statusCode).json(errorResponse);
  }
}
