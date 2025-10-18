/**
 * Enhanced Customer Account Management Types
 * Supports credit sales, deposits, installments, and comprehensive account management
 */

export type TransactionType = 
  | 'sale_credit'        // Customer takes goods on credit
  | 'sale_cash'         // Customer pays cash for goods
  | 'sale_account'      // Customer pays from account deposit
  | 'payment_cash'      // Customer makes cash payment to reduce balance
  | 'payment_installment' // Installment payment
  | 'deposit'           // Customer makes deposit to account
  | 'deposit_refund'    // Refund of customer deposit
  | 'credit_adjustment' // Manual credit adjustment
  | 'debit_adjustment'  // Manual debit adjustment
  | 'interest_charge'   // Interest on overdue balance
  | 'late_fee'          // Late payment fee
  | 'discount_applied'  // Discount given to customer
  | 'return_credit'     // Credit for returned goods
  | 'account_closure';  // Account deletion/closure

export type PaymentMethod = 
  | 'cash'
  | 'card'
  | 'bank_transfer' 
  | 'mobile_money'
  | 'check'
  | 'account_deposit'
  | 'store_credit';

export type AccountStatus = 
  | 'active'
  | 'suspended'
  | 'closed'
  | 'credit_hold'
  | 'overdue';

export type CustomerType = 
  | 'individual'
  | 'business'
  | 'wholesale'
  | 'retail';

export interface CustomerAccount {
  // Basic Information
  id: string;
  accountNumber: string;          // Unique account number
  name: string;
  contact: string;
  email?: string;
  address?: string;
  
  // Account Details
  customerType: CustomerType;
  status: AccountStatus;
  createdDate: string;
  lastActivityDate?: string;
  
  // Financial Information
  currentBalance: number;         // Current outstanding balance (what customer owes)
  depositBalance: number;         // Prepaid/deposit balance (what we owe customer)
  creditLimit: number;           // Maximum credit allowed
  totalCreditUsed: number;       // Total credit currently used
  availableCredit: number;       // Remaining credit available
  
  // Payment Terms
  paymentTermsDays: number;      // Payment terms (e.g., 30 days)
  interestRate: number;          // Annual interest rate for overdue amounts
  lateFeeAmount: number;         // Fixed late fee amount
  
  // Statistics
  lifetimeValue: number;         // Total value of all purchases
  totalPayments: number;         // Total payments made
  averageMonthlySpending: number;
  lastPaymentDate?: string;
  creditScore: number;           // Internal credit score (0-100)
  
  // Preferences
  autoApplyDeposit: boolean;     // Auto-use deposit for purchases
  allowNegativeBalance: boolean; // Allow going over credit limit
  sendReminders: boolean;        // Send payment reminders
  
  // Metadata
  notes?: string;
  tags?: string[];               // For categorization
  assignedSalesRep?: string;
}

export interface AccountTransaction {
  // Basic Transaction Info
  id: string;
  transactionNumber: string;     // Human-readable transaction number
  customerId: string;
  customerName: string;
  
  // Transaction Details
  date: string;
  type: TransactionType;
  description: string;
  
  // Financial Details
  amount: number;                // Transaction amount (always positive)
  isDebit: boolean;             // True if this reduces customer balance
  
  // Before/After Balances
  balanceBefore: number;
  balanceAfter: number;
  depositBalanceBefore: number;
  depositBalanceAfter: number;
  
  // Payment Information
  paymentMethod?: PaymentMethod;
  paymentReference?: string;     // Check number, transaction ID, etc.
  
  // Related Information
  relatedSaleId?: string;        // Link to sale record
  relatedInvoiceNumber?: string;
  installmentPlanId?: string;    // Link to installment plan
  
  // Metadata
  processedBy: string;           // User who processed transaction
  notes?: string;
  isReversed?: boolean;          // If transaction was reversed
  reversalTransactionId?: string; // ID of reversal transaction
  
  // Audit Trail
  createdAt: string;
  updatedAt: string;
}

export interface InstallmentPlan {
  // Plan Information
  id: string;
  planNumber: string;
  customerId: string;
  customerName: string;
  
  // Financial Details
  totalAmount: number;           // Total amount to be paid
  paidAmount: number;           // Amount paid so far
  remainingAmount: number;      // Amount still owed
  
  // Plan Structure
  numberOfInstallments: number;
  installmentAmount: number;     // Amount per installment
  frequency: 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly';
  
  // Dates
  startDate: string;
  endDate: string;
  nextDueDate: string;
  
  // Status
  status: 'active' | 'completed' | 'defaulted' | 'cancelled';
  
  // Settings
  interestRate: number;          // Interest rate for this plan
  lateFeeAmount: number;         // Late fee per missed payment
  gracePeriodDays: number;       // Days before late fee applies
  
  // Related Information
  relatedSaleId?: string;
  originalTransactionId: string;
  
  // Metadata
  createdDate: string;
  notes?: string;
}

export interface InstallmentPayment {
  id: string;
  planId: string;
  installmentNumber: number;     // Which installment this is (1, 2, 3, etc.)
  
  // Payment Details
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  paymentDate?: string;
  
  // Status
  status: 'pending' | 'paid' | 'overdue' | 'partial';
  daysPastDue?: number;
  
  // Payment Information
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  transactionId?: string;        // Link to account transaction
  
  // Fees
  lateFeeCharged?: number;
  interestCharged?: number;
  
  // Metadata
  notes?: string;
  processedBy?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreditSaleOptions {
  // Sale Information
  customerId: string;
  saleAmount: number;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  
  // Payment Options
  paymentType: 'full_credit' | 'partial_credit' | 'deposit_and_credit' | 'installment';
  
  // If using deposit
  useDepositAmount?: number;     // Amount to use from customer deposit
  
  // If credit
  creditAmount?: number;         // Amount to charge to credit
  
  // If installment
  installmentPlan?: {
    numberOfInstallments: number;
    frequency: 'weekly' | 'bi-weekly' | 'monthly';
    interestRate?: number;
  };
  
  // Validation
  bypassCreditLimit?: boolean;   // Allow exceeding credit limit
  authorizingUser?: string;      // User authorizing credit limit bypass
  
  // Metadata
  notes?: string;
  salesRep?: string;
}

export interface AccountSummary {
  // Basic Info
  customerId: string;
  customerName: string;
  accountNumber: string;
  
  // Current Status
  currentBalance: number;
  depositBalance: number;
  netBalance: number;            // currentBalance - depositBalance
  
  // Credit Information
  creditLimit: number;
  availableCredit: number;
  creditUtilization: number;     // Percentage of credit used
  
  // Payment Information
  totalOverdueAmount: number;
  daysOverdue: number;
  nextPaymentDue: number;
  nextPaymentDate?: string;
  
  // Activity Summary
  totalTransactions: number;
  lifetimeValue: number;
  totalPayments: number;
  averageMonthlySpending: number;
  
  // Risk Assessment
  creditScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  accountStatus: AccountStatus;
  
  // Recent Activity
  lastTransactionDate?: string;
  lastPaymentDate?: string;
  lastPaymentAmount?: number;
  
  // Active Plans
  activeInstallmentPlans: number;
  totalInstallmentBalance: number;
}

export interface AccountingEntry {
  // For proper double-entry bookkeeping
  id: string;
  transactionId: string;
  
  // Accounting Details
  account: 'accounts_receivable' | 'customer_deposits' | 'sales_revenue' | 'interest_income' | 'late_fees';
  debitAmount: number;
  creditAmount: number;
  
  // Reference
  description: string;
  date: string;
  
  // Metadata
  createdAt: string;
}

export interface PaymentProcessingResult {
  success: boolean;
  transactionId?: string;
  newBalance: number;
  newDepositBalance: number;
  amountProcessed: number;
  paymentMethod: PaymentMethod;
  errors?: string[];
  warnings?: string[];
  
  // If installment plan created
  installmentPlanId?: string;
  
  // Accounting entries created
  accountingEntries: AccountingEntry[];
}

export interface CreditCheckResult {
  approved: boolean;
  availableCredit: number;
  requestedAmount: number;
  exceedsLimit: boolean;
  requiresApproval: boolean;
  riskFactors: string[];
  recommendations: string[];
  creditScore: number;
}

export interface AccountAging {
  customerId: string;
  customerName: string;
  totalBalance: number;
  
  // Aging buckets
  current: number;           // 0-30 days
  days31to60: number;       // 31-60 days
  days61to90: number;       // 61-90 days
  over90Days: number;       // 90+ days
  
  // Analysis
  oldestInvoiceDate: string;
  daysSinceOldestInvoice: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}