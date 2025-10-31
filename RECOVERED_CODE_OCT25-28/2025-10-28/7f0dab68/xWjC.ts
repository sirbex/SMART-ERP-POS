import api from '@/config/api.config';

export interface Loan {
  id: string;
  loanNumber: string;
  borrowerType: 'customer' | 'supplier' | 'employee';
  borrowerId: string;
  borrowerName: string;
  principal: string;
  interestRate: string;
  term: number;
  startDate: string;
  endDate: string;
  paymentFrequency: string;
  status: string;
  outstandingPrincipal: string;
  outstandingInterest: string;
  totalPaid: string;
  lastPaymentDate?: string;
  repaymentsCount?: number;
  accrualsCount?: number;
  createdAt: string;
}

export interface LoanDetails extends Loan {
  notes?: string;
  lastInterestAccrualDate?: string;
  summary: {
    principalPaidPercent: string;
    interestPaidPercent: string;
    daysActive: number;
    daysRemaining: number;
  };
  recentRepayments: LoanRepayment[];
  recentAccruals: InterestAccrual[];
}

export interface LoanRepayment {
  id: string;
  repaymentNumber: string;
  amount: string;
  principalAmount: string;
  interestAmount: string;
  penaltyAmount: string;
  paymentDate: string;
  paymentMethod: string;
  reference?: string;
  notes?: string;
  createdAt: string;
}

export interface InterestAccrual {
  id: string;
  accrualDate: string;
  interestAmount: string;
  daysAccrued: number;
  outstandingPrincipal: string;
}

export interface AmortizationSchedule {
  monthlyPayment: string;
  totalInterest: string;
  totalPayment: string;
  payments: {
    paymentNumber: number;
    dueDate: string;
    principal: string;
    interest: string;
    totalPayment: string;
    remainingBalance: string;
  }[];
}

export interface CreateLoanRequest {
  borrowerType: 'customer' | 'supplier' | 'employee';
  borrowerId: string;
  borrowerName: string;
  principal: number;
  interestRate: number;
  termInMonths: number;
  startDate?: string;
  paymentFrequency?: 'MONTHLY' | 'WEEKLY' | 'BIWEEKLY';
  disbursementDate?: string;
  notes?: string;
  cashAccountId?: string;
  loanAccountId?: string;
}

export interface RecordRepaymentRequest {
  amount: number;
  paymentDate?: string;
  paymentMethod: string;
  reference?: string;
  notes?: string;
}

export interface PaymentCalculation {
  principal: string;
  interestRate: string;
  term: number;
  monthlyPayment: string;
  totalInterest: string;
  totalPayment: string;
  annualPercentageRate: string;
}

class LoanService {
  /**
   * Create a new loan
   */
  async createLoan(data: CreateLoanRequest) {
    const response = await api.post('/loans', data);
    return response.data;
  }

  /**
   * List all loans with optional filters
   */
  async getLoans(params?: {
    status?: string;
    borrowerType?: string;
    borrowerId?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await api.get('/loans', { params });
    return response.data;
  }

  /**
   * Get detailed loan information
   */
  async getLoan(id: string): Promise<{ success: boolean; loan: LoanDetails }> {
    const response = await api.get(`/loans/${id}`);
    return response.data;
  }

  /**
   * Record a loan repayment
   */
  async recordRepayment(loanId: string, data: RecordRepaymentRequest) {
    const response = await api.post(`/loans/${loanId}/repay`, data);
    return response.data;
  }

  /**
   * Accrue interest for a loan
   */
  async accrueInterest(loanId: string, toDate?: string) {
    const response = await api.post(`/loans/${loanId}/accrue-interest`, {
      toDate: toDate || new Date().toISOString(),
    });
    return response.data;
  }

  /**
   * Get amortization schedule
   */
  async getAmortizationSchedule(
    loanId: string
  ): Promise<{ success: boolean; loan: any; schedule: AmortizationSchedule }> {
    const response = await api.get(`/loans/${loanId}/schedule`);
    return response.data;
  }

  /**
   * Get all repayments for a loan
   */
  async getRepayments(loanId: string) {
    const response = await api.get(`/loans/${loanId}/repayments`);
    return response.data;
  }

  /**
   * Calculate monthly payment (utility)
   */
  async calculatePayment(
    principal: number,
    interestRate: number,
    termInMonths: number
  ): Promise<{ success: boolean; calculation: PaymentCalculation }> {
    const response = await api.post('/loans/calculate-payment', {
      principal,
      interestRate,
      termInMonths,
    });
    return response.data;
  }

  /**
   * Update loan status
   */
  async updateLoanStatus(
    loanId: string,
    status: 'ACTIVE' | 'COMPLETED' | 'DEFAULTED' | 'WRITTEN_OFF',
    notes?: string
  ) {
    const response = await api.patch(`/loans/${loanId}/status`, { status, notes });
    return response.data;
  }
}

export default new LoanService();
