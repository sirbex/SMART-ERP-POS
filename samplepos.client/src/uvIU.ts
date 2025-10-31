import type { Request, Response } from 'express';
import Decimal from 'decimal.js';
import { postLedger } from '../postLedger';
import type { TransactionInput } from '../models';
import { validatePositiveAmount } from '../helpers/validation';
import { formatErrorResponse } from '../helpers/errorHandling';

/**
 * POST /api/accounting/delivery
 * Record a delivery and related costs
 *
 * Body:
 * {
 *   deliveryId: string,
 *   invoiceId: string,
 *   amount: number (delivery cost),
 *   currency: string,
 *   description: string,
 *   deliveryExpenseAccountId: string,
 *   payableAccountId: string (or cash if paid immediately)
 * }
 */
export async function createDelivery(req: Request, res: Response) {
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

    // Create ledger transaction: Delivery expense increases (debit), Payable increases (credit)
    const transaction: TransactionInput = {
      date: new Date(),
      description:
        description || `Delivery ${deliveryId} for invoice ${invoiceId}`,
      refType: 'delivery',
      refId: deliveryId,
      entries: [
        {
          transactionId: '', // Will be set by postLedger
          accountId: deliveryExpenseAccountId,
          amount: deliveryAmount,
          type: 'debit',
          currency,
        },
        {
          transactionId: '', // Will be set by postLedger
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
}

/**
 * GET /api/accounting/delivery/:deliveryId
 * Get delivery accounting entries
 */
export async function getDelivery(req: Request, res: Response) {
  try {
    const { deliveryId } = req.params;

    // TODO: Query ledger entries by refType='delivery' and refId=deliveryId

    res.status(200).json({
      success: true,
      deliveryId,
      message: 'Delivery retrieval not yet implemented',
    });
  } catch (error) {
    const errorResponse = formatErrorResponse(error);
    res.status(errorResponse.error.statusCode).json(errorResponse);
  }
}
