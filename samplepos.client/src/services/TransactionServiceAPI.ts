/**
 * Transaction Service API Client
 * 
 * This service interacts with the backend API for transaction management.
 */

import api from '../config/api.config';
import type { 
  Transaction, 
  PaymentMethod
} from '../models/Transaction';
import type {
  POSTransaction,
  CustomerPayment
} from '../models/APITransactions';

class TransactionServiceAPI {
  /**
   * Create a new transaction
   */
  async createTransaction(transaction: POSTransaction): Promise<string | null> {
    try {
      const response = await api.post('/transactions', transaction);
      return response.data.id;
    } catch (error) {
      console.error('Error creating transaction via API:', error);
      return null;
    }
  }

  /**
   * Get transaction by ID
   */
  async getTransaction(id: string): Promise<Transaction | null> {
    try {
      const response = await api.get(`/transactions/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error getting transaction ${id} via API:`, error);
      return null;
    }
  }

  /**
   * Get all transactions (uses /sales endpoint)
   */
  async getTransactions(limit: number = 100, offset: number = 0): Promise<Transaction[]> {
    try {
      // Convert offset to page number for new API
      const page = Math.floor(offset / limit) + 1;
      const response = await api.get('/sales', {
        params: { limit, page }
      });
      // New API returns { data: [], pagination: {} }
      return response.data?.data || [];
    } catch (error) {
      console.error('Error getting transactions via API:', error);
      return [];
    }
  }

  /**
   * Get transactions by customer ID (uses /sales endpoint with filter)
   */
  async getTransactionsByCustomer(customerId: string): Promise<Transaction[]> {
    try {
      const response = await api.get('/sales', {
        params: { customerId }
      });
      // New API returns { data: [], pagination: {} }
      return response.data?.data || [];
    } catch (error) {
      console.error(`Error getting transactions for customer ${customerId} via API:`, error);
      return [];
    }
  }

  /**
   * Get transactions by date range (uses /sales endpoint with filters)
   */
  async getTransactionsByDateRange(startDate: string, endDate: string): Promise<Transaction[]> {
    try {
      const response = await api.get('/sales', {
        params: { startDate, endDate }
      });
      // New API returns { data: [], pagination: {} }
      return response.data?.data || [];
    } catch (error) {
      console.error(`Error getting transactions for date range ${startDate} to ${endDate} via API:`, error);
      return [];
    }
  }

  /**
   * Void/Cancel transaction (uses /sales/:id/cancel endpoint)
   */
  async voidTransaction(id: string, reason: string): Promise<boolean> {
    try {
      const response = await api.post(`/sales/${id}/cancel`, { reason });
      return response.status === 200;
    } catch (error) {
      console.error(`Error cancelling transaction ${id} via API:`, error);
      return false;
    }
  }

  /**
   * Record customer payment (uses /customers/:id/payment endpoint)
   */
  async recordPayment(payment: CustomerPayment): Promise<string | null> {
    try {
      if (!payment.customerId) {
        console.error('Customer ID is required for payment');
        return null;
      }
      
      const response = await api.post(`/customers/${payment.customerId}/payment`, {
        amount: payment.amount,
        method: (payment.paymentMethod || payment.method || 'CASH').toUpperCase(), // Backend expects CASH, CARD, etc.
        reference: payment.reference,
        notes: payment.notes
      });
      return response.data.id || response.data.payment?.id;
    } catch (error) {
      console.error('Error recording payment via API:', error);
      return null;
    }
  }

  /**
   * Get payment methods
   */
  async getPaymentMethods(): Promise<PaymentMethod[]> {
    try {
      // New backend uses hardcoded payment methods: CASH, CARD, MOBILE_MONEY, CREDIT, BANK_TRANSFER
      // Return them directly since there's no dedicated endpoint
      return ['cash', 'card', 'credit', 'mobile', 'bank'] as PaymentMethod[];
    } catch (error) {
      console.error('Error getting payment methods via API:', error);
      // Return some default payment methods if API call fails
      return ['cash', 'card', 'credit'] as PaymentMethod[];
    }
  }

  /**
   * Get sales summary for a date range (uses /sales/stats/summary)
   */
  async getSalesSummary(startDate: string, endDate: string): Promise<any> {
    try {
      const response = await api.get('/sales/stats/summary', {
        params: { startDate, endDate }
      });
      return response.data;
    } catch (error) {
      console.error(`Error getting sales summary for date range ${startDate} to ${endDate} via API:`, error);
      return null;
    }
  }
}

export default TransactionServiceAPI;