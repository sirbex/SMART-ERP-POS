/**
 * Transaction Service API Client
 * 
 * This service interacts with the backend API for transaction management.
 */

import api from '../config/api.config';
import { v4 as uuidv4 } from 'uuid';
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
   * Get all transactions
   */
  async getTransactions(limit: number = 100, offset: number = 0): Promise<Transaction[]> {
    try {
      const response = await api.get('/transactions', {
        params: { limit, offset }
      });
      return response.data;
    } catch (error) {
      console.error('Error getting transactions via API:', error);
      return [];
    }
  }

  /**
   * Get transactions by customer ID
   */
  async getTransactionsByCustomer(customerId: string): Promise<Transaction[]> {
    try {
      const response = await api.get(`/transactions/customer/${customerId}`);
      return response.data;
    } catch (error) {
      console.error(`Error getting transactions for customer ${customerId} via API:`, error);
      return [];
    }
  }

  /**
   * Get transactions by date range
   */
  async getTransactionsByDateRange(startDate: string, endDate: string): Promise<Transaction[]> {
    try {
      const response = await api.get('/transactions/range', {
        params: { startDate, endDate }
      });
      return response.data;
    } catch (error) {
      console.error(`Error getting transactions for date range ${startDate} to ${endDate} via API:`, error);
      return [];
    }
  }

  /**
   * Void transaction
   */
  async voidTransaction(id: string, reason: string): Promise<boolean> {
    try {
      const response = await api.post(`/transactions/${id}/void`, { reason });
      return response.status === 200;
    } catch (error) {
      console.error(`Error voiding transaction ${id} via API:`, error);
      return false;
    }
  }

  /**
   * Record customer payment
   */
  async recordPayment(payment: CustomerPayment): Promise<string | null> {
    try {
      const paymentWithId = {
        ...payment,
        id: payment.id || uuidv4()
      };
      
      const response = await api.post('/transactions/payment', paymentWithId);
      return response.data.id;
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
      const response = await api.get('/transactions/payment-methods');
      // Map API response to string literals required by PaymentMethod type
      return response.data.map((pm: any) => pm.id as PaymentMethod);
    } catch (error) {
      console.error('Error getting payment methods via API:', error);
      // Return some default payment methods if API call fails
      return ['cash', 'card', 'credit'] as PaymentMethod[];
    }
  }

  /**
   * Get sales summary for a date range
   */
  async getSalesSummary(startDate: string, endDate: string): Promise<any> {
    try {
      const response = await api.get('/transactions/summary', {
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