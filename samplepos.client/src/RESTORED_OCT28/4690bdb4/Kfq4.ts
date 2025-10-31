import api from './api';

export interface BankAccount {
  id: string;
  accountNumber: string;
  bankName: string;
  accountName: string;
  accountType: string;
  currency: string;
  balance: string;
  bookBalance: string;
  bankBalance: string;
  status: string;
  lastReconciled?: string;
  transactionsCount?: number;
  reconciliationsCount?: number;
  createdAt: string;
}

export interface BankTransaction {
  id: string;
  transactionDate: string;
  description: string;
  amount: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'FEE' | 'INTEREST';
  reference?: string;
  checkNumber?: string;
  isReconciled: boolean;
  reconciledDate?: string;
}

export interface BankReconciliation {
  id: string;
  reconciliationNumber: string;
  bankAccountId: string;
  startDate: string;
  endDate: string;
  openingBalance: string;
  closingBalance: string;
  statementBalance: string;
  bookBalance: string;
  difference: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReconciliationSummary {
  totalDebits: string;
  totalCredits: string;
  netChange: string;
  transactionCount: number;
  reconciledCount: number;
  unreconciledCount: number;
}

export interface CreateBankAccountRequest {
  accountNumber: string;
  bankName: string;
  accountName: string;
  accountType?: 'CHECKING' | 'SAVINGS' | 'MONEY_MARKET';
  currency?: string;
  balance?: number;
  bookBalance?: number;
  bankBalance?: number;
  notes?: string;
}

export interface CreateTransferRequest {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  description?: string;
  transactionDate?: string;
  reference?: string;
}

export interface RecordTransactionRequest {
  bankAccountId: string;
  transactionDate?: string;
  description: string;
  amount: number;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'FEE' | 'INTEREST';
  reference?: string;
  checkNumber?: string;
  notes?: string;
}

export interface StartReconciliationRequest {
  bankAccountId: string;
  startDate: string;
  endDate: string;
  statementBalance: number;
}

class BankService {
  /**
   * Create a new bank account
   */
  async createBankAccount(data: CreateBankAccountRequest) {
    const response = await api.post('/bank/accounts', data);
    return response.data;
  }

  /**
   * List all bank accounts
   */
  async getBankAccounts(params?: { status?: string; accountType?: string }) {
    const response = await api.get('/bank/accounts', { params });
    return response.data;
  }

  /**
   * Get bank account details with transactions
   */
  async getBankAccount(id: string) {
    const response = await api.get(`/bank/accounts/${id}`);
    return response.data;
  }

  /**
   * Transfer funds between accounts
   */
  async createTransfer(data: CreateTransferRequest) {
    const response = await api.post('/bank/transfer', data);
    return response.data;
  }

  /**
   * Record a bank transaction
   */
  async recordTransaction(data: RecordTransactionRequest) {
    const response = await api.post('/bank/transactions', data);
    return response.data;
  }

  /**
   * Start a new reconciliation
   */
  async startReconciliation(data: StartReconciliationRequest) {
    const response = await api.post('/bank/reconciliations', data);
    return response.data;
  }

  /**
   * Mark transactions as reconciled
   */
  async reconcileTransactions(reconciliationId: string, transactionIds: string[]) {
    const response = await api.put(`/bank/reconciliations/${reconciliationId}/reconcile`, {
      transactionIds,
    });
    return response.data;
  }

  /**
   * Complete a reconciliation
   */
  async completeReconciliation(reconciliationId: string, notes?: string) {
    const response = await api.put(`/bank/reconciliations/${reconciliationId}/complete`, {
      notes,
    });
    return response.data;
  }

  /**
   * Get reconciliation details
   */
  async getReconciliation(
    reconciliationId: string
  ): Promise<{
    success: boolean;
    reconciliation: BankReconciliation;
    summary: ReconciliationSummary;
    transactions: BankTransaction[];
  }> {
    const response = await api.get(`/bank/reconciliations/${reconciliationId}`);
    return response.data;
  }

  /**
   * Get unreconciled transactions
   */
  async getUnreconciledTransactions(
    accountId: string,
    startDate?: string,
    endDate?: string
  ) {
    const response = await api.get(`/bank/accounts/${accountId}/unreconciled`, {
      params: { startDate, endDate },
    });
    return response.data;
  }

  /**
   * Update bank account status
   */
  async updateAccountStatus(
    accountId: string,
    status: 'ACTIVE' | 'INACTIVE' | 'CLOSED',
    notes?: string
  ) {
    const response = await api.patch(`/bank/accounts/${accountId}/status`, { status, notes });
    return response.data;
  }
}

export default new BankService();
