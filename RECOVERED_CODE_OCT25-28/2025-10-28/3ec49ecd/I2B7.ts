import api from './api';

export interface Account {
  id: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  balance: string;
  currency: string;
  description?: string;
  isActive: boolean;
}

export interface LedgerEntry {
  id: string;
  transactionId: string;
  accountId: string;
  amount: string;
  type: 'debit' | 'credit';
  currency: string;
  exchangeRate?: string;
  refType?: string;
  refId?: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  refType?: string;
  refId?: string;
  createdAt: string;
  ledgerEntries: LedgerEntry[];
}

export interface InvoiceRequest {
  invoiceId: string;
  customerId: string;
  amount: number;
  currency: string;
  description?: string;
  accountsReceivableId: string;
  revenueAccountId: string;
}

export interface PaymentRequest {
  paymentId: string;
  invoiceId: string;
  customerId: string;
  amount: number;
  currency: string;
  description?: string;
  cashAccountId: string;
  accountsReceivableId: string;
}

export interface DepositRequest {
  depositId: string;
  amount: number;
  currency: string;
  description?: string;
  bankAccountId: string;
  sourceAccountId: string;
}

export interface TransferRequest {
  transferId: string;
  amount: number;
  currency: string;
  description?: string;
  fromAccountId: string;
  toAccountId: string;
}

export interface LoanRequest {
  loanId: string;
  amount: number;
  currency: string;
  description?: string;
  loanAccountId: string;
  cashAccountId: string;
}

export interface DeliveryRequest {
  deliveryId: string;
  invoiceId: string;
  amount: number;
  currency: string;
  description?: string;
  deliveryExpenseAccountId: string;
  payableAccountId: string;
}

/**
 * Accounting Service
 * Handles all accounting-related API calls
 */
class AccountingService {
  private baseUrl = '/api/accounting';

  // ============================================================================
  // POST - Create Transactions
  // ============================================================================

  /**
   * Create an invoice
   */
  async createInvoice(data: InvoiceRequest) {
    const response = await api.post(`${this.baseUrl}/invoice`, data);
    return response.data;
  }

  /**
   * Record a payment
   */
  async createPayment(data: PaymentRequest) {
    const response = await api.post(`${this.baseUrl}/payment`, data);
    return response.data;
  }

  /**
   * Record a bank deposit
   */
  async createDeposit(data: DepositRequest) {
    const response = await api.post(`${this.baseUrl}/deposit`, data);
    return response.data;
  }

  /**
   * Record an inter-account transfer
   */
  async createTransfer(data: TransferRequest) {
    const response = await api.post(`${this.baseUrl}/transfer`, data);
    return response.data;
  }

  /**
   * Create a loan
   */
  async createLoan(data: LoanRequest) {
    const response = await api.post(`${this.baseUrl}/loan`, data);
    return response.data;
  }

  /**
   * Repay a loan
   */
  async repayLoan(
    loanId: string,
    data: {
      repaymentId: string;
      amount: number;
      currency: string;
      description?: string;
      loanAccountId: string;
      cashAccountId: string;
    }
  ) {
    const response = await api.post(`${this.baseUrl}/loan/${loanId}/repay`, data);
    return response.data;
  }

  /**
   * Record a delivery
   */
  async createDelivery(data: DeliveryRequest) {
    const response = await api.post(`${this.baseUrl}/delivery`, data);
    return response.data;
  }

  // ============================================================================
  // GET - Retrieve Data
  // ============================================================================

  /**
   * Get all accounts (chart of accounts)
   */
  async getAccounts(filters?: { type?: string; isActive?: boolean }) {
    const params = new URLSearchParams();
    if (filters?.type) params.append('type', filters.type);
    if (filters?.isActive !== undefined) params.append('isActive', String(filters.isActive));

    const response = await api.get(`${this.baseUrl}/accounts?${params.toString()}`);
    return response.data;
  }

  /**
   * Get a specific account by ID
   */
  async getAccount(accountId: string) {
    const response = await api.get(`${this.baseUrl}/accounts/${accountId}`);
    return response.data;
  }

  /**
   * Get account balance
   */
  async getAccountBalance(accountId: string) {
    const response = await api.get(`${this.baseUrl}/balance/${accountId}`);
    return response.data;
  }

  /**
   * Get all transactions
   */
  async getTransactions(filters?: {
    refType?: string;
    refId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }) {
    const params = new URLSearchParams();
    if (filters?.refType) params.append('refType', filters.refType);
    if (filters?.refId) params.append('refId', filters.refId);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.limit) params.append('limit', String(filters.limit));

    const response = await api.get(`${this.baseUrl}/transactions?${params.toString()}`);
    return response.data;
  }

  /**
   * Get a specific transaction by ID
   */
  async getTransaction(transactionId: string) {
    const response = await api.get(`${this.baseUrl}/transactions/${transactionId}`);
    return response.data;
  }

  /**
   * Get trial balance
   */
  async getTrialBalance() {
    const response = await api.get(`${this.baseUrl}/trial-balance`);
    return response.data;
  }
}

export const accountingService = new AccountingService();
export default accountingService;
