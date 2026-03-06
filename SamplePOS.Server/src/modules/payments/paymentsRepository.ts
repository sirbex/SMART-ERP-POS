/**
 * Payments Repository - Raw SQL operations for split payment system
 * Handles sale_payments, payment_methods, and customer_credit_transactions tables
 * 
 * ARCHITECTURE: Repository layer - SQL queries ONLY, no business logic
 */

import { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';

// ============================================================================
// TYPES
// ============================================================================

export interface PaymentMethodRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  requires_reference: boolean;
  created_at: string;
  updated_at: string;
}

export interface SalePaymentRow {
  id: string;
  sale_id: string;
  payment_method_code: string;
  amount: string; // Decimal as string from PostgreSQL
  reference_number: string | null;
  notes: string | null;
  processed_at: string;
  processed_by: string | null;
  created_at: string;
}

export interface CustomerCreditTransactionRow {
  id: string;
  customer_id: string;
  transaction_type: string;
  amount: string; // Decimal as string
  balance_after: string; // Decimal as string
  sale_id: string | null;
  payment_id: string | null;
  reference_number: string | null;
  notes: string | null;
  processed_by: string | null;
  created_at: string;
}

export interface CreateSalePaymentData {
  saleId: string;
  paymentMethodCode: string;
  amount: number;
  referenceNumber?: string | null;
  notes?: string | null;
  processedBy?: string | null;
}

export interface CreateCreditTransactionData {
  customerId: string;
  transactionType: 'CREDIT_SALE' | 'PAYMENT' | 'CREDIT_NOTE' | 'ADJUSTMENT';
  amount: number;
  balanceAfter: number;
  saleId?: string | null;
  paymentId?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
  processedBy?: string | null;
}

// ============================================================================
// PAYMENT METHODS REPOSITORY
// ============================================================================

export const paymentsRepository = {
  /**
   * Get all active payment methods
   */
  async getPaymentMethods(pool: Pool | PoolClient): Promise<PaymentMethodRow[]> {
    const query = `
      SELECT 
        id, code, name, description, is_active, requires_reference,
        created_at, updated_at
      FROM payment_methods
      WHERE is_active = true
      ORDER BY 
        CASE code
          WHEN 'CASH' THEN 1
          WHEN 'CARD' THEN 2
          WHEN 'MOBILE_MONEY' THEN 3
          WHEN 'CUSTOMER_CREDIT' THEN 4
          ELSE 5
        END
    `;

    const result = await pool.query<PaymentMethodRow>(query);
    return result.rows;
  },

  /**
   * Get payment method by code
   */
  async getPaymentMethodByCode(pool: Pool | PoolClient, code: string): Promise<PaymentMethodRow | null> {
    const query = `
      SELECT 
        id, code, name, description, is_active, requires_reference,
        created_at, updated_at
      FROM payment_methods
      WHERE code = $1
    `;

    const result = await pool.query<PaymentMethodRow>(query, [code]);
    return result.rows[0] || null;
  },

  // ============================================================================
  // SALE PAYMENTS REPOSITORY
  // ============================================================================

  /**
   * Create a single sale payment record
   */
  async createSalePayment(
    pool: Pool | PoolClient,
    data: CreateSalePaymentData
  ): Promise<SalePaymentRow> {
    const query = `
      INSERT INTO sale_payments (
        sale_id, payment_method_code, amount, reference_number,
        notes, processed_by
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING 
        id, sale_id, payment_method_code, amount::text, reference_number,
        notes, processed_at, processed_by, created_at
    `;

    const values = [
      data.saleId,
      data.paymentMethodCode,
      data.amount,
      data.referenceNumber || null,
      data.notes || null,
      data.processedBy || null,
    ];

    const result = await pool.query<SalePaymentRow>(query, values);
    return result.rows[0];
  },

  /**
   * Create multiple sale payment records (for split payments)
   * Uses UNNEST for batch insert efficiency
   */
  async createSalePayments(
    pool: Pool | PoolClient,
    payments: CreateSalePaymentData[]
  ): Promise<SalePaymentRow[]> {
    if (payments.length === 0) return [];

    const saleIds = payments.map(p => p.saleId);
    const methodCodes = payments.map(p => p.paymentMethodCode);
    const amounts = payments.map(p => p.amount);
    const references = payments.map(p => p.referenceNumber || null);
    const notes = payments.map(p => p.notes || null);
    const processedBy = payments.map(p => p.processedBy || null);

    const query = `
      INSERT INTO sale_payments (
        sale_id, payment_method_code, amount, reference_number,
        notes, processed_by
      )
      SELECT * FROM UNNEST(
        $1::uuid[], $2::varchar[], $3::decimal[], $4::varchar[],
        $5::text[], $6::uuid[]
      )
      RETURNING 
        id, sale_id, payment_method_code, amount::text, reference_number,
        notes, processed_at, processed_by, created_at
    `;

    const result = await pool.query<SalePaymentRow>(query, [
      saleIds,
      methodCodes,
      amounts,
      references,
      notes,
      processedBy,
    ]);

    return result.rows;
  },

  /**
   * Get all payments for a sale
   */
  async getSalePayments(pool: Pool | PoolClient, saleId: string): Promise<SalePaymentRow[]> {
    const query = `
      SELECT 
        id, sale_id, payment_method_code, amount::text, reference_number,
        notes, processed_at, processed_by, created_at
      FROM sale_payments
      WHERE sale_id = $1
      ORDER BY processed_at ASC
    `;

    const result = await pool.query<SalePaymentRow>(query, [saleId]);
    return result.rows;
  },

  /**
   * Get total paid amount for a sale
   */
  async getTotalPaid(pool: Pool | PoolClient, saleId: string): Promise<number> {
    const query = `
      SELECT COALESCE(SUM(amount), 0) as total
      FROM sale_payments
      WHERE sale_id = $1
    `;

    const result = await pool.query<{ total: string }>(query, [saleId]);
    return parseFloat(result.rows[0].total);
  },

  /**
   * Delete sale payments (for transaction rollback scenarios)
   */
  async deleteSalePayments(pool: Pool | PoolClient, saleId: string): Promise<void> {
    const query = `DELETE FROM sale_payments WHERE sale_id = $1`;
    await pool.query(query, [saleId]);
  },

  // ============================================================================
  // CUSTOMER CREDIT REPOSITORY
  // ============================================================================

  /**
   * Get customer current credit balance
   */
  async getCustomerBalance(pool: Pool | PoolClient, customerId: string): Promise<number> {
    const query = `
      SELECT COALESCE(balance_after, 0) as balance
      FROM customer_credit_transactions
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
    `;

    const result = await pool.query<{ balance: string }>(query, [customerId]);
    if (result.rows.length === 0) return 0;
    return parseFloat(result.rows[0].balance);
  },

  /**
   * Create customer credit transaction
   */
  async createCreditTransaction(
    pool: Pool | PoolClient,
    data: CreateCreditTransactionData
  ): Promise<CustomerCreditTransactionRow> {
    const query = `
      INSERT INTO customer_credit_transactions (
        customer_id, transaction_type, amount, balance_after,
        sale_id, payment_id, reference_number, notes, processed_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING 
        id, customer_id, transaction_type, amount::text, balance_after::text,
        sale_id, payment_id, reference_number, notes, processed_by, created_at
    `;

    const values = [
      data.customerId,
      data.transactionType,
      data.amount,
      data.balanceAfter,
      data.saleId || null,
      data.paymentId || null,
      data.referenceNumber || null,
      data.notes || null,
      data.processedBy || null,
    ];

    const result = await pool.query<CustomerCreditTransactionRow>(query, values);
    return result.rows[0];
  },

  /**
   * Get customer credit transaction history
   */
  async getCustomerCreditHistory(
    pool: Pool,
    customerId: string,
    limit: number = 50
  ): Promise<CustomerCreditTransactionRow[]> {
    const query = `
      SELECT 
        id, customer_id, transaction_type, amount::text, balance_after::text,
        sale_id, payment_id, reference_number, notes, processed_by, created_at
      FROM customer_credit_transactions
      WHERE customer_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await pool.query<CustomerCreditTransactionRow>(query, [customerId, limit]);
    return result.rows;
  },

  /**
   * Get credit transactions for a sale
   */
  async getSaleCreditTransactions(
    pool: Pool,
    saleId: string
  ): Promise<CustomerCreditTransactionRow[]> {
    const query = `
      SELECT 
        id, customer_id, transaction_type, amount::text, balance_after::text,
        sale_id, payment_id, reference_number, notes, processed_by, created_at
      FROM customer_credit_transactions
      WHERE sale_id = $1
      ORDER BY created_at DESC
    `;

    const result = await pool.query<CustomerCreditTransactionRow>(query, [saleId]);
    return result.rows;
  },
};
