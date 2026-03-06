/**
 * Accounting API Client - Integration with C# Accounting Service
 * 
 * This service handles communication with the C# accounting API
 * for financial ledger postings. It extends existing Node.js workflows
 * without modifying core business logic.
 * 
 * RESPONSIBILITIES:
 * - Invoice posting to accounting ledger
 * - Payment posting to accounting ledger  
 * - COGS posting integration
 * - Error handling and fallback logic
 * - API key authentication
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import Decimal from 'decimal.js';
import logger from '../utils/logger.js';

interface AccountingApiConfig {
  baseUrl: string;
  apiKey: string;
  timeout: number;
  retryAttempts: number;
}

interface InvoicePostingRequest {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName?: string;
  totalAmount: number;
  taxAmount: number;
  subtotal: number;
  issueDate: string;
  dueDate?: string;
  items: InvoiceItemPosting[];
  reference?: string;
}

interface InvoiceItemPosting {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  taxAmount?: number;
}

interface PaymentPostingRequest {
  paymentId: string;
  invoiceId: string;
  invoiceNumber?: string;
  customerId: string;
  customerName?: string;
  amount: number;
  paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CREDIT';
  paymentDate: string;
  reference?: string;
  notes?: string;
}

interface COGSPostingRequest {
  saleId: string;
  saleNumber?: string;
  customerId?: string;
  saleDate: string;
  items: COGSItemPosting[];
  reference?: string;
}

interface COGSItemPosting {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  salesAmount: number;
}

interface AccountingApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

class AccountingApiClient {
  private client: AxiosInstance;
  private config: AccountingApiConfig;
  private isHealthy: boolean = true;
  private lastHealthCheck: Date | null = null;

  constructor() {
    this.config = {
      baseUrl: process.env.ACCOUNTING_API_URL || 'http://localhost:5062',
      apiKey: process.env.ACCOUNTING_API_KEY || 'your_shared_secret_key_here',
      timeout: 10000,
      retryAttempts: 3
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.apiKey
      }
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => this.handleApiError(error)
    );
  }

  /**
   * Post invoice to accounting ledger
   * Creates: DR Accounts Receivable, CR Sales Revenue, CR Tax Payable
   */
  async postInvoice(invoiceData: InvoicePostingRequest): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info('Posting invoice to accounting system', {
        invoiceId: invoiceData.invoiceId,
        invoiceNumber: invoiceData.invoiceNumber,
        amount: invoiceData.totalAmount,
        customerId: invoiceData.customerId
      });

      const response = await this.client.post<AccountingApiResponse>(
        '/api/ledger/invoice',
        invoiceData
      );

      if (response.data.success) {
        logger.info('Invoice posted to accounting successfully', {
          invoiceId: invoiceData.invoiceId,
          invoiceNumber: invoiceData.invoiceNumber
        });
        return { success: true };
      } else {
        logger.error('Failed to post invoice to accounting', {
          invoiceId: invoiceData.invoiceId,
          error: response.data.error || response.data.message
        });
        return { success: false, error: response.data.error || response.data.message };
      }
    } catch (error: unknown) {
      logger.error('Error posting invoice to accounting system', {
        invoiceId: invoiceData.invoiceId,
        error: (error instanceof Error ? error.message : String(error)),
        stack: (error instanceof Error ? error.stack : undefined)
      });

      // Non-blocking - invoice creation continues even if accounting fails
      return { success: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  /**
   * Post payment to accounting ledger
   * Creates: DR Cash/Bank, CR Accounts Receivable
   */
  async postPayment(paymentData: PaymentPostingRequest): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info('Posting payment to accounting system', {
        paymentId: paymentData.paymentId,
        invoiceId: paymentData.invoiceId,
        amount: paymentData.amount,
        method: paymentData.paymentMethod
      });

      const response = await this.client.post<AccountingApiResponse>(
        '/api/ledger/payment',
        paymentData
      );

      if (response.data.success) {
        logger.info('Payment posted to accounting successfully', {
          paymentId: paymentData.paymentId,
          invoiceId: paymentData.invoiceId
        });
        return { success: true };
      } else {
        logger.error('Failed to post payment to accounting', {
          paymentId: paymentData.paymentId,
          error: response.data.error || response.data.message
        });
        return { success: false, error: response.data.error || response.data.message };
      }
    } catch (error: unknown) {
      logger.error('Error posting payment to accounting system', {
        paymentId: paymentData.paymentId,
        error: (error instanceof Error ? error.message : String(error)),
        stack: (error instanceof Error ? error.stack : undefined)
      });

      // Non-blocking - payment processing continues even if accounting fails
      return { success: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  /**
   * Post COGS to accounting ledger
   * Creates: DR Cost of Goods Sold, CR Inventory
   */
  async postCOGS(cogsData: COGSPostingRequest): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info('Posting COGS to accounting system', {
        saleId: cogsData.saleId,
        itemCount: cogsData.items.length,
        totalCost: cogsData.items.reduce((sum, item) => sum.plus(item.totalCost), new Decimal(0)).toNumber()
      });

      const response = await this.client.post<AccountingApiResponse>(
        '/api/ledger/cogs',
        cogsData
      );

      if (response.data.success) {
        logger.info('COGS posted to accounting successfully', {
          saleId: cogsData.saleId,
          saleNumber: cogsData.saleNumber
        });
        return { success: true };
      } else {
        logger.error('Failed to post COGS to accounting', {
          saleId: cogsData.saleId,
          error: response.data.error || response.data.message
        });
        return { success: false, error: response.data.error || response.data.message };
      }
    } catch (error: unknown) {
      logger.error('Error posting COGS to accounting system', {
        saleId: cogsData.saleId,
        error: (error instanceof Error ? error.message : String(error)),
        stack: (error instanceof Error ? error.stack : undefined)
      });

      // Non-blocking - sale completion continues even if accounting fails
      return { success: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  /**
   * Health check for accounting API
   */
  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      const response = await this.client.get('/health', { timeout: 5000 });
      this.isHealthy = true;
      this.lastHealthCheck = new Date();

      logger.info('Accounting API health check passed');
      return { healthy: true };
    } catch (error: unknown) {
      this.isHealthy = false;
      this.lastHealthCheck = new Date();

      logger.warn('Accounting API health check failed', {
        error: (error instanceof Error ? error.message : String(error)),
        baseUrl: this.config.baseUrl
      });

      return { healthy: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus(): { healthy: boolean; lastCheck?: Date } {
    return {
      healthy: this.isHealthy,
      lastCheck: this.lastHealthCheck || undefined
    };
  }

  /**
   * Handle API errors with proper logging
   */
  private handleApiError(error: AxiosError): Promise<never> {
    if (error.response) {
      // Server responded with error status
      logger.error('Accounting API responded with error', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        url: error.config?.url
      });
    } else if (error.request) {
      // Request made but no response
      logger.error('No response from accounting API', {
        baseUrl: this.config.baseUrl,
        timeout: this.config.timeout,
        url: error.config?.url
      });
    } else {
      // Error in request setup
      logger.error('Error setting up accounting API request', {
        message: (error instanceof Error ? error.message : String(error)),
        url: error.config?.url
      });
    }

    return Promise.reject(error);
  }
}

// Export singleton instance
export const accountingApiClient = new AccountingApiClient();

// Export types for use in other modules
export type {
  InvoicePostingRequest,
  InvoiceItemPosting,
  PaymentPostingRequest,
  COGSPostingRequest,
  COGSItemPosting,
  AccountingApiResponse
};