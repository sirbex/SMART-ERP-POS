/**
 * Payments Service - Business logic for split payment system
 * Handles atomic transactions for split payments and customer credit
 *
 * ARCHITECTURE: Service layer - Business logic orchestration, uses repository for data access
 */

import { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';
import {
  paymentsRepository,
  CreateSalePaymentData,
} from './paymentsRepository.js';
import * as auditService from '../audit/auditService.js';
import type { AuditContext } from '../../../../shared/types/audit.js';
import { accountingApiClient } from '../../services/accountingApiClient.js';
import * as arPaymentService from '../ar-payments/arPaymentService.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import logger from '../../utils/logger.js';
import { Money } from '../../utils/money.js';
import * as stateTablesRepo from '../../repositories/stateTablesRepository.js';
import { getBusinessDate } from '../../utils/dateRange.js';

// Payment segment type (local definition)
interface PaymentSegment {
  method: string;
  amount: number;
  reference?: string;
  notes?: string;
}

// ============================================================================
// TYPES
// ============================================================================

export interface ProcessSplitPaymentInput {
  saleId: string;
  totalAmount: number;
  payments: PaymentSegment[];
  customerId?: string | null;
  processedBy?: string | null;
  saleNumber?: string; // For audit trail
  auditContext?: AuditContext; // For audit logging
}

export interface ProcessSplitPaymentResult {
  success: boolean;
  salePayments: Array<{
    id: string;
    method: string;
    amount: number;
    reference: string | null;
  }>;
  creditTransaction?: {
    id: string;
    newBalance: number;
  };
  totalPaid: number;
  changeAmount: number;
}

export interface PaymentMethodInfo {
  code: string;
  name: string;
  requiresReference: boolean;
  isActive: boolean;
}

// ============================================================================
// PAYMENTS SERVICE
// ============================================================================

export const paymentsService = {
  /**
   * Get all available payment methods
   */
  async getPaymentMethods(pool: Pool): Promise<PaymentMethodInfo[]> {
    const methods = await paymentsRepository.getPaymentMethods(pool);

    return methods.map((m) => ({
      code: m.code,
      name: m.name,
      requiresReference: m.requires_reference,
      isActive: m.is_active,
    }));
  },

  /**
   * Get customer current credit balance
   */
  async getCustomerCreditBalance(pool: Pool, customerId: string): Promise<number> {
    const balance = await paymentsRepository.getCustomerBalance(pool, customerId);
    return balance;
  },

  /**
   * Process split payment with atomic transaction
   * This is the core function that handles:
   * - Creating multiple payment records
   * - Updating customer credit balance if applicable
   * - Calculating change
   * - All within a database transaction for atomicity
   */
  async processSplitPayment(
    pool: Pool,
    input: ProcessSplitPaymentInput
  ): Promise<ProcessSplitPaymentResult> {
    // Calculate totals upfront for validation
    const totalPaid = input.payments
      .reduce((sum, p) => sum.plus(p.amount), new Decimal(0))
      .toNumber();
    const totalAmount = new Decimal(input.totalAmount);
    const paidDecimal = new Decimal(totalPaid);

    // Validate payment amount
    const hasCreditPayment = input.payments.some((p) => p.method === 'CUSTOMER_CREDIT');
    if (!hasCreditPayment && paidDecimal.lessThan(totalAmount.minus(0.01))) {
      throw new Error('Insufficient payment amount');
    }

    const txResult = await UnitOfWork.run(pool, async (client) => {
      // Process each payment segment
      const paymentRecords: CreateSalePaymentData[] = input.payments.map((p) => ({
        saleId: input.saleId,
        paymentMethodCode: p.method,
        amount: p.amount,
        referenceNumber: p.reference || null,
        notes: p.notes || null,
        processedBy: input.processedBy || null,
      }));

      const createdPayments = await paymentsRepository.createSalePayments(client, paymentRecords);

      // Handle customer credit if applicable
      let creditTransaction: { id: string; newBalance: number } | undefined;

      const creditPayment = input.payments.find((p) => p.method === 'CUSTOMER_CREDIT');
      if (creditPayment) {
        if (!input.customerId) {
          throw new Error('Customer ID required for credit payment');
        }

        // Layer 2: Lock customer row to serialize concurrent credit transactions
        await client.query('SELECT id FROM customers WHERE id = $1 FOR UPDATE', [input.customerId]);

        // Get current balance (already uses FOR UPDATE on customer_credit_transactions)
        const currentBalance = await paymentsRepository.getCustomerBalance(
          client,
          input.customerId
        );
        const creditAmount = new Decimal(creditPayment.amount);
        const newBalance = new Decimal(currentBalance).plus(creditAmount);

        // Find the payment ID for this credit payment
        const creditPaymentRecord = createdPayments.find(
          (p) => p.payment_method_code === 'CUSTOMER_CREDIT'
        );

        // Create credit transaction record
        const creditTxn = await paymentsRepository.createCreditTransaction(client, {
          customerId: input.customerId,
          transactionType: 'CREDIT_SALE',
          amount: creditPayment.amount,
          balanceAfter: newBalance.toNumber(),
          saleId: input.saleId,
          paymentId: creditPaymentRecord?.id || null,
          notes: `Credit payment for sale`,
          processedBy: input.processedBy || null,
        });

        creditTransaction = {
          id: creditTxn.id,
          newBalance: newBalance.toNumber(),
        };
      }

      return { createdPayments, creditTransaction };
    });

    // Calculate change (only from cash overpayment)
    const changeAmount = this.calculateChange(input.payments, input.totalAmount);

    // Log payment to audit trail (non-blocking, after transaction committed)
    if (input.auditContext) {
      try {
        for (const payment of txResult.createdPayments) {
          await auditService.logPaymentRecorded(
            pool,
            payment.id,
            {
              saleId: input.saleId,
              saleNumber: input.saleNumber || input.saleId,
              paymentMethod: payment.payment_method_code,
              amount: Money.toNumber(Money.parseDb(payment.amount)),
              referenceNumber: payment.reference_number,
              isSplitPayment: txResult.createdPayments.length > 1,
              processedBy: input.processedBy,
            },
            input.auditContext
          );
        }
      } catch (auditError) {
        logger.error('Audit logging failed for payment (non-fatal)', { error: auditError });
      }
    }

    const result: ProcessSplitPaymentResult = {
      success: true,
      salePayments: txResult.createdPayments.map((p) => ({
        id: p.id,
        method: p.payment_method_code,
        amount: Money.toNumber(Money.parseDb(p.amount)),
        reference: p.reference_number,
      })),
      creditTransaction: txResult.creditTransaction,
      totalPaid: paidDecimal.toNumber(),
      changeAmount: changeAmount,
    };

    // ============================================================
    // GL POSTING: NOT needed here. Sale GL is posted by salesService
    // via recordSaleToGL(). These sale_payments records are just
    // the payment breakdown detail — not independent financial events.
    // ============================================================

    return result;
  },

  /**
   * Record a customer credit payment (customer paying down their balance).
   *
   * @deprecated Internal callers should use arPaymentService.createCustomerPayment directly.
   * Kept as a thin SSOT redirect for legacy modules and POST /api/payments/customer/:id/payment.
   */
  async recordCustomerPayment(
    pool: Pool,
    input: {
      customerId: string;
      amount: number;
      paymentMethod: string;
      reference?: string;
      notes?: string;
      processedBy?: string;
    }
  ): Promise<{ newBalance: number; transactionId: string }> {
    // SSOT redirect: reuse AR payment workflow to avoid duplicate posting/balance logic.
    const arResult = await arPaymentService.createCustomerPayment(pool, {
      customerId: input.customerId,
      amount: input.amount,
      paymentDate: getBusinessDate(),
      paymentMethod: input.paymentMethod,
      reference: input.reference,
      notes: input.notes,
      createdById: input.processedBy || '00000000-0000-0000-0000-000000000001',
      autoAllocate: true,
      allocationType: 'FIFO',
    });
    const balanceRow = await pool.query<{ balance: string }>(
      `SELECT COALESCE(balance, 0)::text AS balance FROM customers WHERE id = $1`,
      [input.customerId],
    );
    return {
      newBalance: Number(balanceRow.rows[0]?.balance ?? 0),
      transactionId: arResult.payment?.id || '',
    };
  },

  /**
   * Get payment breakdown for a sale
   */
  async getSalePaymentBreakdown(pool: Pool, saleId: string) {
    const payments = await paymentsRepository.getSalePayments(pool, saleId);
    const creditTransactions = await paymentsRepository.getSaleCreditTransactions(pool, saleId);

    const totalPaid = payments.reduce((sum, p) => sum.plus(p.amount), new Decimal(0)).toNumber();

    return {
      payments: payments.map((p) => ({
        id: p.id,
        method: p.payment_method_code,
        amount: Money.toNumber(Money.parseDb(p.amount)),
        reference: p.reference_number,
        processedAt: p.processed_at,
      })),
      creditTransactions: creditTransactions.map((t) => ({
        id: t.id,
        type: t.transaction_type,
        amount: Money.toNumber(Money.parseDb(t.amount)),
        balanceAfter: Money.toNumber(Money.parseDb(t.balance_after)),
        createdAt: t.created_at,
      })),
      totalPaid,
      isSplitPayment: payments.length > 1,
    };
  },

  /**
   * Get customer credit history
   */
  async getCustomerCreditHistory(pool: Pool, customerId: string, limit: number = 50) {
    const transactions = await paymentsRepository.getCustomerCreditHistory(pool, customerId, limit);

    return transactions.map((t) => ({
      id: t.id,
      type: t.transaction_type,
      amount: Money.toNumber(Money.parseDb(t.amount)),
      balanceAfter: Money.toNumber(Money.parseDb(t.balance_after)),
      saleId: t.sale_id,
      reference: t.reference_number,
      notes: t.notes,
      createdAt: t.created_at,
    }));
  },

  /**
   * Calculate change from split payments
   * Only cash overpayments generate change
   */
  calculateChange(payments: PaymentSegment[], totalDue: number): number {
    const cashPayments = payments.filter((p) => p.method === 'CASH');
    const totalCash = cashPayments
      .reduce((sum, p) => sum.plus(p.amount), new Decimal(0));

    const nonCashPayments = payments.filter((p) => p.method !== 'CASH');
    const totalNonCash = nonCashPayments
      .reduce((sum, p) => sum.plus(p.amount), new Decimal(0));

    const remainingAfterNonCash = new Decimal(totalDue).minus(totalNonCash);

    if (totalCash.greaterThan(remainingAfterNonCash) && remainingAfterNonCash.greaterThan(0)) {
      return totalCash.minus(remainingAfterNonCash).toDecimalPlaces(2).toNumber();
    }

    return 0;
  },

  /**
   * Validate payment distribution before processing
   */
  validatePayments(
    payments: PaymentSegment[],
    totalDue: number,
    customerId?: string | null
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (payments.length === 0) {
      errors.push('At least one payment method required');
      return { valid: false, errors };
    }

    const totalPaid = payments.reduce((sum, p) => sum.plus(p.amount), new Decimal(0)).toNumber();
    const hasCreditPayment = payments.some((p) => p.method === 'CUSTOMER_CREDIT');

    // Check individual payments
    for (const payment of payments) {
      if (payment.amount <= 0) {
        errors.push(`${payment.method} amount must be positive`);
      }
    }

    // Check total
    if (!hasCreditPayment && totalPaid < new Decimal(totalDue).minus(0.01).toNumber()) {
      errors.push(`Insufficient payment: ${totalPaid.toFixed(2)} < ${totalDue.toFixed(2)}`);
    }

    // Check customer ID for credit
    if (hasCreditPayment && !customerId) {
      errors.push('Customer required for credit payment');
    }

    // Check for duplicate methods (except cash)
    const methodCounts = payments.reduce(
      (acc, p) => {
        acc[p.method] = (acc[p.method] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    for (const [method, count] of Object.entries(methodCounts)) {
      if (method !== 'CASH' && (count as number) > 1) {
        errors.push(`Duplicate payment method: ${method}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },
};
