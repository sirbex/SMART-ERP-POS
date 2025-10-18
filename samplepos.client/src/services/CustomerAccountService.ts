/**
 * Enhanced Customer Account Management Service
 * Handles credit sales, deposits, installments, and comprehensive account management
 */

import type { 
  CustomerAccount, 
  AccountTransaction, 
  InstallmentPlan, 
  InstallmentPayment, 
  CreditSaleOptions, 
  AccountSummary, 
  PaymentProcessingResult, 
  CreditCheckResult,
  TransactionType,
  PaymentMethod,
  AccountingEntry 
} from '../types/CustomerAccount';

const STORAGE_KEYS = {
  CUSTOMER_ACCOUNTS: 'pos_customer_accounts_v2',
  ACCOUNT_TRANSACTIONS: 'pos_account_transactions_v2', 
  INSTALLMENT_PLANS: 'pos_installment_plans_v2',
  INSTALLMENT_PAYMENTS: 'pos_installment_payments_v2',
  ACCOUNTING_ENTRIES: 'pos_accounting_entries_v2'
} as const;

// ==================== PRECISION FINANCIAL CALCULATIONS ====================

/**
 * Round to currency precision (2 decimal places)
 */
function roundToCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Validate and sanitize numerical amounts
 */
function validateAmount(amount: any): number {
  if (typeof amount === 'string') {
    amount = parseFloat(amount);
  }
  if (isNaN(amount) || !isFinite(amount)) {
    return 0;
  }
  return amount;
}

/**
 * Safely add two numbers with proper rounding
 */
function safeAdd(a: number, b: number): number {
  return roundToCurrency(validateAmount(a) + validateAmount(b));
}

/**
 * Safely subtract two numbers with proper rounding
 */
function safeSubtract(a: number, b: number): number {
  return roundToCurrency(validateAmount(a) - validateAmount(b));
}

/**
 * Safely multiply two numbers with proper rounding
 */
function safeMultiply(a: number, b: number): number {
  return roundToCurrency(validateAmount(a) * validateAmount(b));
}

/**
 * Enhanced currency formatting with validation
 */
function formatCurrency(amount: any): string {
  const validAmount = validateAmount(amount);
  const rounded = roundToCurrency(validAmount);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(rounded);
}

export class CustomerAccountService {
  
  // ==================== CUSTOMER ACCOUNT MANAGEMENT ====================
  
  /**
   * Create a new customer account
   */
  static createCustomerAccount(customerData: Partial<CustomerAccount>): CustomerAccount {
    const accountNumber = this.generateAccountNumber();
    const now = new Date().toISOString();
    
    const newAccount: CustomerAccount = {
      id: `customer_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      accountNumber,
      name: customerData.name || '',
      contact: customerData.contact || '',
      email: customerData.email,
      address: customerData.address,
      
      // Account Details
      customerType: customerData.customerType || 'individual',
      status: 'active',
      createdDate: now,
      
      // Financial Information
      currentBalance: 0,
      depositBalance: customerData.depositBalance || 0,
      creditLimit: customerData.creditLimit || 1000,
      totalCreditUsed: 0,
      availableCredit: customerData.creditLimit || 1000,
      
      // Payment Terms
      paymentTermsDays: customerData.paymentTermsDays || 30,
      interestRate: customerData.interestRate || 18, // 18% annual
      lateFeeAmount: customerData.lateFeeAmount || 25,
      
      // Statistics
      lifetimeValue: 0,
      totalPayments: 0,
      averageMonthlySpending: 0,
      creditScore: 75, // Default starting score
      
      // Preferences
      autoApplyDeposit: customerData.autoApplyDeposit !== false,
      allowNegativeBalance: customerData.allowNegativeBalance || false,
      sendReminders: customerData.sendReminders !== false,
      
      // Metadata
      notes: customerData.notes,
      tags: customerData.tags || [],
      assignedSalesRep: customerData.assignedSalesRep
    };
    
    // Save to storage
    this.saveCustomerAccount(newAccount);
    
    // Create initial transaction if there's a deposit
    if (newAccount.depositBalance > 0) {
      this.recordTransaction({
        customerId: newAccount.id,
        type: 'deposit',
        amount: newAccount.depositBalance,
        description: 'Initial account deposit',
        paymentMethod: 'cash'
      });
    }
    
    return newAccount;
  }
  
  /**
   * Get all customer accounts
   */
  static getAllCustomerAccounts(): CustomerAccount[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CUSTOMER_ACCOUNTS);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading customer accounts:', error);
      return [];
    }
  }
  
  /**
   * Get customer account by ID
   */
  static getCustomerAccount(customerId: string): CustomerAccount | null {
    const accounts = this.getAllCustomerAccounts();
    return accounts.find(account => account.id === customerId) || null;
  }
  
  /**
   * Get customer account by name (for legacy compatibility)
   */
  static getCustomerAccountByName(name: string): CustomerAccount | null {
    const accounts = this.getAllCustomerAccounts();
    return accounts.find(account => account.name.toLowerCase() === name.toLowerCase()) || null;
  }
  
  /**
   * Update customer account
   */
  static updateCustomerAccount(customerId: string, updates: Partial<CustomerAccount>): boolean {
    try {
      const accounts = this.getAllCustomerAccounts();
      const accountIndex = accounts.findIndex(account => account.id === customerId);
      
      if (accountIndex === -1) {
        throw new Error(`Customer account not found: ${customerId}`);
      }
      
      // Update account with validation
      accounts[accountIndex] = {
        ...accounts[accountIndex],
        ...updates,
        // Ensure critical fields are calculated
        availableCredit: (updates.creditLimit || accounts[accountIndex].creditLimit) - accounts[accountIndex].totalCreditUsed,
        lastActivityDate: new Date().toISOString()
      };
      
      // Save updated accounts
      localStorage.setItem(STORAGE_KEYS.CUSTOMER_ACCOUNTS, JSON.stringify(accounts));
      return true;
    } catch (error) {
      console.error('Error updating customer account:', error);
      return false;
    }
  }

  /**
   * Delete customer account and associated data
   */
  static deleteCustomerAccount(customerId: string, options?: { 
    checkDependencies?: boolean;
    forceDelete?: boolean;
  }): { success: boolean; errors?: string[]; warnings?: string[] } {
    try {
      const customer = this.getCustomerAccount(customerId);
      if (!customer) {
        return { 
          success: false, 
          errors: ['Customer account not found'] 
        };
      }

      const warnings: string[] = [];
      const errors: string[] = [];

      // Check for dependencies if requested
      if (options?.checkDependencies !== false) {
        // Check for outstanding balance
        if (customer.currentBalance > 0) {
          const message = `Customer has outstanding balance of ${formatCurrency(customer.currentBalance)}`;
          if (options?.forceDelete) {
            warnings.push(message);
          } else {
            errors.push(message);
          }
        }

        // Check for deposit balance
        if (customer.depositBalance > 0) {
          const message = `Customer has deposit balance of ${formatCurrency(customer.depositBalance)}`;
          if (options?.forceDelete) {
            warnings.push(message);
          } else {
            errors.push(message);
          }
        }

        // Check for active installment plans
        const activePlans = this.getActiveInstallmentPlans(customerId);
        if (activePlans.length > 0) {
          const message = `Customer has ${activePlans.length} active installment plan(s)`;
          if (options?.forceDelete) {
            warnings.push(message);
          } else {
            errors.push(message);
          }
        }

        // Check for recent transactions (within last 30 days)
        const recentTransactions = this.getCustomerTransactions(customerId, 10);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const hasRecentActivity = recentTransactions.some(txn => 
          new Date(txn.createdAt) > thirtyDaysAgo
        );

        if (hasRecentActivity) {
          const message = 'Customer has recent transaction activity within the last 30 days';
          if (options?.forceDelete) {
            warnings.push(message);
          } else {
            errors.push(message);
          }
        }

        // If there are errors and not forcing deletion, return early
        if (errors.length > 0 && !options?.forceDelete) {
          return {
            success: false,
            errors: [...errors, 'Use forceDelete option to override these checks'],
            warnings
          };
        }
      }

      // Proceed with deletion
      if (options?.forceDelete || errors.length === 0) {
        // Remove customer account
        const accounts = this.getAllCustomerAccounts();
        const filteredAccounts = accounts.filter(account => account.id !== customerId);
        localStorage.setItem(STORAGE_KEYS.CUSTOMER_ACCOUNTS, JSON.stringify(filteredAccounts));

        // Mark installment plans as cancelled
        const allPlans = this.getAllInstallmentPlans();
        const updatedPlans = allPlans.map(plan => 
          plan.customerId === customerId 
            ? { ...plan, status: 'cancelled' as const, cancelledDate: new Date().toISOString() }
            : plan
        );
        localStorage.setItem(STORAGE_KEYS.INSTALLMENT_PLANS, JSON.stringify(updatedPlans));

        // Add deletion transaction for audit trail
        this.recordTransaction({
          customerId: customerId,
          type: 'account_closure',
          amount: 0,
          description: `Customer account deleted - ${customer.name}`,
          notes: `Account closed with ${warnings.length > 0 ? 'warnings' : 'no issues'}: ${warnings.join(', ')}`
        });

        return {
          success: true,
          warnings: warnings.length > 0 ? warnings : undefined
        };
      }

      return {
        success: false,
        errors
      };

    } catch (error) {
      console.error('Error deleting customer account:', error);
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error occurred']
      };
    }
  }

  /**
   * Check if customer can be safely deleted
   */
  static canDeleteCustomer(customerId: string): { 
    canDelete: boolean; 
    blockers: string[]; 
    warnings: string[] 
  } {
    const customer = this.getCustomerAccount(customerId);
    if (!customer) {
      return { canDelete: false, blockers: ['Customer not found'], warnings: [] };
    }

    const blockers: string[] = [];
    const warnings: string[] = [];

    // Critical blockers
    if (customer.currentBalance > 0) {
      blockers.push(`Outstanding balance: ${formatCurrency(customer.currentBalance)}`);
    }

    if (customer.depositBalance > 0) {
      blockers.push(`Deposit balance: ${formatCurrency(customer.depositBalance)}`);
    }

    const activePlans = this.getActiveInstallmentPlans(customerId);
    if (activePlans.length > 0) {
      blockers.push(`${activePlans.length} active installment plan(s)`);
    }

    // Warnings (won't prevent deletion but should be noted)
    const recentTransactions = this.getCustomerTransactions(customerId, 5);
    if (recentTransactions.length > 0) {
      warnings.push(`Has ${recentTransactions.length} transaction(s) in history`);
    }

    const lifetimeValue = customer.lifetimeValue;
    if (lifetimeValue > 1000) {
      warnings.push(`High lifetime value customer (${formatCurrency(lifetimeValue)})`);
    }

    return {
      canDelete: blockers.length === 0,
      blockers,
      warnings
    };
  }
  
  /**
   * Save customer account to storage
   */
  static saveCustomerAccount(account: CustomerAccount): boolean {
    try {
      const accounts = this.getAllCustomerAccounts();
      const existingIndex = accounts.findIndex(a => a.id === account.id);
      
      if (existingIndex >= 0) {
        accounts[existingIndex] = account;
      } else {
        accounts.push(account);
      }
      
      localStorage.setItem(STORAGE_KEYS.CUSTOMER_ACCOUNTS, JSON.stringify(accounts));
      return true;
    } catch (error) {
      console.error('Error saving customer account:', error);
      return false;
    }
  }
  
  // ==================== CREDIT SALES PROCESSING ====================
  
  /**
   * Process a credit sale
   */
  static processCreditSale(options: CreditSaleOptions): PaymentProcessingResult {
    try {
      const customer = this.getCustomerAccount(options.customerId);
      if (!customer) {
        return {
          success: false,
          errors: ['Customer account not found'],
          newBalance: 0,
          newDepositBalance: 0,
          amountProcessed: 0,
          paymentMethod: 'cash',
          accountingEntries: []
        };
      }
      
      // Perform credit check
      const creditCheck = this.performCreditCheck(options.customerId, options.saleAmount);
      
      if (!creditCheck.approved && !options.bypassCreditLimit) {
        return {
          success: false,
          errors: ['Credit limit exceeded', ...creditCheck.riskFactors],
          newBalance: customer.currentBalance,
          newDepositBalance: customer.depositBalance,
          amountProcessed: 0,
          paymentMethod: 'cash',
          accountingEntries: []
        };
      }
      
      const accountingEntries: AccountingEntry[] = [];
      let amountProcessed = 0;
      let newBalance = customer.currentBalance;
      let newDepositBalance = customer.depositBalance;
      let transactionId = '';
      let installmentPlanId: string | undefined;
      
      // Process payment based on type
      switch (options.paymentType) {
        case 'full_credit':
          // Charge full amount to credit with precision
          const validatedSaleAmount = validateAmount(options.saleAmount);
          newBalance = safeAdd(newBalance, validatedSaleAmount);
          amountProcessed = validatedSaleAmount;
          
          transactionId = this.recordTransaction({
            customerId: options.customerId,
            type: 'sale_credit',
            amount: options.saleAmount,
            description: `Credit sale - ${options.items.length} items`,
            relatedSaleId: options.notes // Assuming sale ID passed in notes
          }).transactionId!;
          
          // Create accounting entries
          accountingEntries.push(
            this.createAccountingEntry(transactionId, 'accounts_receivable', options.saleAmount, 0, 'Credit sale'),
            this.createAccountingEntry(transactionId, 'sales_revenue', 0, options.saleAmount, 'Sales revenue')
          );
          break;
          
        case 'deposit_and_credit':
          const validatedUseDepositAmount = validateAmount(options.useDepositAmount || 0);
          const validatedCurrentDepositBalance = validateAmount(customer.depositBalance);
          const validatedSaleAmountDeposit = validateAmount(options.saleAmount);
          
          const depositUsed = roundToCurrency(Math.min(validatedUseDepositAmount, validatedCurrentDepositBalance, validatedSaleAmountDeposit));
          const creditUsed = safeSubtract(validatedSaleAmountDeposit, depositUsed);
          
          // Use deposit first with precision
          if (depositUsed > 0) {
            newDepositBalance = safeSubtract(newDepositBalance, depositUsed);
            
            const depositTransactionId = this.recordTransaction({
              customerId: options.customerId,
              type: 'sale_account',
              amount: depositUsed,
              description: `Sale paid from account deposit`,
              paymentMethod: 'account_deposit'
            }).transactionId!;
            
            accountingEntries.push(
              this.createAccountingEntry(depositTransactionId, 'customer_deposits', depositUsed, 0, 'Deposit used for sale'),
              this.createAccountingEntry(depositTransactionId, 'sales_revenue', 0, depositUsed, 'Sales revenue from deposit')
            );
          }
          
          // Remaining amount on credit with precision
          if (creditUsed > 0) {
            newBalance = safeAdd(newBalance, creditUsed);
            
            transactionId = this.recordTransaction({
              customerId: options.customerId,
              type: 'sale_credit',
              amount: creditUsed,
              description: `Credit sale (after deposit use)`,
              relatedSaleId: options.notes
            }).transactionId!;
            
            accountingEntries.push(
              this.createAccountingEntry(transactionId, 'accounts_receivable', creditUsed, 0, 'Credit portion of sale'),
              this.createAccountingEntry(transactionId, 'sales_revenue', 0, creditUsed, 'Sales revenue')
            );
          }
          
          amountProcessed = options.saleAmount;
          break;
          
        case 'installment':
          // Create installment plan
          if (options.installmentPlan) {
            const plan = this.createInstallmentPlan(
              options.customerId,
              options.saleAmount,
              options.installmentPlan.numberOfInstallments,
              options.installmentPlan.frequency,
              options.installmentPlan.interestRate || customer.interestRate
            );
            
            installmentPlanId = plan.id;
            newBalance = safeAdd(newBalance, validateAmount(options.saleAmount));
            
            transactionId = this.recordTransaction({
              customerId: options.customerId,
              type: 'sale_credit',
              amount: options.saleAmount,
              description: `Credit sale with installment plan`,
              installmentPlanId: plan.id,
              relatedSaleId: options.notes
            }).transactionId!;
            
            accountingEntries.push(
              this.createAccountingEntry(transactionId, 'accounts_receivable', options.saleAmount, 0, 'Installment sale'),
              this.createAccountingEntry(transactionId, 'sales_revenue', 0, options.saleAmount, 'Sales revenue')
            );
          }
          
          amountProcessed = options.saleAmount;
          break;
      }
      
      // Update customer account
      this.updateCustomerAccount(options.customerId, {
        currentBalance: newBalance,
        depositBalance: newDepositBalance,
        totalCreditUsed: newBalance,
        availableCredit: customer.creditLimit - newBalance,
        lifetimeValue: customer.lifetimeValue + options.saleAmount,
        lastActivityDate: new Date().toISOString()
      });
      
      // Save accounting entries
      this.saveAccountingEntries(accountingEntries);
      
      return {
        success: true,
        transactionId,
        installmentPlanId,
        newBalance,
        newDepositBalance,
        amountProcessed,
        paymentMethod: options.paymentType === 'deposit_and_credit' ? 'account_deposit' : 'store_credit',
        accountingEntries
      };
      
    } catch (error) {
      console.error('Error processing credit sale:', error);
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error occurred'],
        newBalance: 0,
        newDepositBalance: 0,
        amountProcessed: 0,
        paymentMethod: 'cash',
        accountingEntries: []
      };
    }
  }
  
  // ==================== PAYMENT PROCESSING ====================
  
  /**
   * Process a payment from customer
   */
  static processPayment(
    customerId: string,
    amount: number,
    paymentMethod: PaymentMethod,
    applyToInstallments = true,
    notes?: string
  ): PaymentProcessingResult {
    try {
      const customer = this.getCustomerAccount(customerId);
      if (!customer) {
        return {
          success: false,
          errors: ['Customer account not found'],
          newBalance: 0,
          newDepositBalance: 0,
          amountProcessed: 0,
          paymentMethod,
          accountingEntries: []
        };
      }
      
      let remainingAmount = validateAmount(amount);
      const accountingEntries: AccountingEntry[] = [];
      let newBalance = validateAmount(customer.currentBalance);
      
      // Apply to installments first if enabled
      if (applyToInstallments && remainingAmount > 0) {
        const activeInstallments = this.getActiveInstallmentPlans(customerId);
        
        for (const plan of activeInstallments) {
          if (remainingAmount <= 0) break;
          
          const overduePayments = this.getOverdueInstallmentPayments(plan.id);
          
          for (const payment of overduePayments) {
            if (remainingAmount <= 0) break;
            
            const paymentDue = safeSubtract(validateAmount(payment.amountDue), validateAmount(payment.amountPaid));
            const paymentAmount = roundToCurrency(Math.min(remainingAmount, paymentDue));
            
            // Record installment payment with precision
            this.recordInstallmentPayment(payment.id, paymentAmount, paymentMethod, notes);
            remainingAmount = safeSubtract(remainingAmount, paymentAmount);
          }
        }
      }
      
      // Apply remaining amount to general balance with precision
      if (remainingAmount > 0) {
        const currentBalance = validateAmount(customer.currentBalance);
        const balancePayment = roundToCurrency(Math.min(remainingAmount, currentBalance));
        
        if (balancePayment > 0) {
          newBalance = safeSubtract(newBalance, balancePayment);
          remainingAmount = safeSubtract(remainingAmount, balancePayment);
          
          const transactionId = this.recordTransaction({
            customerId,
            type: 'payment_cash',
            amount: balancePayment,
            description: notes || 'Account payment',
            paymentMethod,
            isDebit: true
          }).transactionId!;
          
          accountingEntries.push(
            this.createAccountingEntry(transactionId, 'accounts_receivable', 0, balancePayment, 'Payment received'),
            this.createAccountingEntry(transactionId, 'cash', balancePayment, 0, 'Cash received') // Assuming cash account
          );
        }
        
        // Any remaining amount becomes deposit with precision
        if (remainingAmount > 0) {
          const newDepositBalance = safeAdd(validateAmount(customer.depositBalance), remainingAmount);
          
          const transactionId = this.recordTransaction({
            customerId,
            type: 'deposit',
            amount: remainingAmount,
            description: 'Excess payment deposited to account',
            paymentMethod,
            isDebit: false
          }).transactionId!;
          
          accountingEntries.push(
            this.createAccountingEntry(transactionId, 'customer_deposits', 0, remainingAmount, 'Customer deposit'),
            this.createAccountingEntry(transactionId, 'cash', remainingAmount, 0, 'Cash received')
          );
          
          // Update customer account
          this.updateCustomerAccount(customerId, {
            currentBalance: newBalance,
            depositBalance: newDepositBalance,
            totalCreditUsed: Math.max(0, newBalance),
            availableCredit: customer.creditLimit - Math.max(0, newBalance),
            totalPayments: customer.totalPayments + amount,
            lastPaymentDate: new Date().toISOString(),
            lastActivityDate: new Date().toISOString()
          });
          
          // Save accounting entries
          this.saveAccountingEntries(accountingEntries);
          
          return {
            success: true,
            newBalance,
            newDepositBalance,
            amountProcessed: amount,
            paymentMethod,
            accountingEntries
          };
        }
      }
      
      // Update customer account
      this.updateCustomerAccount(customerId, {
        currentBalance: newBalance,
        totalCreditUsed: Math.max(0, newBalance),
        availableCredit: customer.creditLimit - Math.max(0, newBalance),
        totalPayments: customer.totalPayments + amount,
        lastPaymentDate: new Date().toISOString(),
        lastActivityDate: new Date().toISOString()
      });
      
      // Save accounting entries
      this.saveAccountingEntries(accountingEntries);
      
      return {
        success: true,
        newBalance,
        newDepositBalance: customer.depositBalance,
        amountProcessed: amount,
        paymentMethod,
        accountingEntries
      };
      
    } catch (error) {
      console.error('Error processing payment:', error);
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error occurred'],
        newBalance: 0,
        newDepositBalance: 0,
        amountProcessed: 0,
        paymentMethod,
        accountingEntries: []
      };
    }
  }
  
  // ==================== TRANSACTION MANAGEMENT ====================
  
  /**
   * Record a transaction
   */
  static recordTransaction(transactionData: {
    customerId: string;
    type: TransactionType;
    amount: number;
    description: string;
    paymentMethod?: PaymentMethod;
    isDebit?: boolean;
    relatedSaleId?: string;
    installmentPlanId?: string;
    notes?: string;
  }): { success: boolean; transactionId?: string; errors?: string[] } {
    try {
      const customer = this.getCustomerAccount(transactionData.customerId);
      if (!customer) {
        return { success: false, errors: ['Customer account not found'] };
      }
      
      const transactionNumber = this.generateTransactionNumber();
      const now = new Date().toISOString();
      
      // Determine if transaction is debit (reduces balance) or credit (increases balance)
      const isDebit = transactionData.isDebit !== undefined 
        ? transactionData.isDebit 
        : ['payment_cash', 'payment_installment', 'deposit', 'return_credit', 'credit_adjustment'].includes(transactionData.type);
      
      const transaction: AccountTransaction = {
        id: `txn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        transactionNumber,
        customerId: transactionData.customerId,
        customerName: customer.name,
        
        date: now.split('T')[0],
        type: transactionData.type,
        description: transactionData.description,
        
        amount: Math.abs(transactionData.amount),
        isDebit,
        
        balanceBefore: customer.currentBalance,
        balanceAfter: isDebit 
          ? customer.currentBalance - Math.abs(transactionData.amount)
          : customer.currentBalance + Math.abs(transactionData.amount),
        depositBalanceBefore: customer.depositBalance,
        depositBalanceAfter: transactionData.type === 'deposit' 
          ? customer.depositBalance + Math.abs(transactionData.amount)
          : transactionData.type === 'sale_account'
          ? customer.depositBalance - Math.abs(transactionData.amount)
          : customer.depositBalance,
        
        paymentMethod: transactionData.paymentMethod,
        relatedSaleId: transactionData.relatedSaleId,
        installmentPlanId: transactionData.installmentPlanId,
        
        processedBy: 'System', // TODO: Get from current user context
        notes: transactionData.notes,
        
        createdAt: now,
        updatedAt: now
      };
      
      // Save transaction
      const transactions = this.getAllTransactions();
      transactions.push(transaction);
      localStorage.setItem(STORAGE_KEYS.ACCOUNT_TRANSACTIONS, JSON.stringify(transactions));
      
      return { success: true, transactionId: transaction.id };
      
    } catch (error) {
      console.error('Error recording transaction:', error);
      return { 
        success: false, 
        errors: [error instanceof Error ? error.message : 'Failed to record transaction'] 
      };
    }
  }
  
  /**
   * Get all transactions
   */
  static getAllTransactions(): AccountTransaction[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.ACCOUNT_TRANSACTIONS);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading transactions:', error);
      return [];
    }
  }
  
  /**
   * Get transactions for a specific customer
   */
  static getCustomerTransactions(customerId: string, limit?: number): AccountTransaction[] {
    const allTransactions = this.getAllTransactions();
    const customerTransactions = allTransactions
      .filter(txn => txn.customerId === customerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    return limit ? customerTransactions.slice(0, limit) : customerTransactions;
  }
  
  // ==================== INSTALLMENT PLAN MANAGEMENT ====================
  
  /**
   * Create an installment plan
   */
  static createInstallmentPlan(
    customerId: string,
    totalAmount: number,
    numberOfInstallments: number,
    frequency: 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly',
    interestRate: number = 0
  ): InstallmentPlan {
    const customer = this.getCustomerAccount(customerId);
    if (!customer) {
      throw new Error('Customer account not found');
    }
    
    const planNumber = this.generatePlanNumber();
    const now = new Date();
    
    // Calculate installment amount with precision (with interest if applicable)
    const validatedTotalAmount = validateAmount(totalAmount);
    const validatedInterestRate = validateAmount(interestRate);
    const interestMultiplier = safeAdd(1, validatedInterestRate / 100);
    const totalWithInterest = safeMultiply(validatedTotalAmount, interestMultiplier);
    const installmentAmount = roundToCurrency(totalWithInterest / numberOfInstallments);
    
    // Calculate dates
    const startDate = new Date(now);
    const endDate = this.calculateEndDate(startDate, numberOfInstallments, frequency);
    const nextDueDate = this.calculateNextDueDate(startDate, frequency);
    
    const plan: InstallmentPlan = {
      id: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      planNumber,
      customerId,
      customerName: customer.name,
      
      totalAmount: totalWithInterest,
      paidAmount: 0,
      remainingAmount: totalWithInterest,
      
      numberOfInstallments,
      installmentAmount,
      frequency,
      
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      nextDueDate: nextDueDate.toISOString().split('T')[0],
      
      status: 'active',
      
      interestRate,
      lateFeeAmount: customer.lateFeeAmount,
      gracePeriodDays: 7,
      
      originalTransactionId: `original_${Date.now()}`,
      createdDate: now.toISOString()
    };
    
    // Save plan
    const plans = this.getAllInstallmentPlans();
    plans.push(plan);
    localStorage.setItem(STORAGE_KEYS.INSTALLMENT_PLANS, JSON.stringify(plans));
    
    // Create individual installment payments
    this.createInstallmentPayments(plan);
    
    return plan;
  }
  
  /**
   * Get all installment plans
   */
  static getAllInstallmentPlans(): InstallmentPlan[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.INSTALLMENT_PLANS);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading installment plans:', error);
      return [];
    }
  }
  
  /**
   * Get active installment plans for a customer
   */
  static getActiveInstallmentPlans(customerId: string): InstallmentPlan[] {
    return this.getAllInstallmentPlans()
      .filter(plan => plan.customerId === customerId && plan.status === 'active')
      .sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime());
  }
  
  // ==================== UTILITY METHODS ====================
  
  /**
   * Perform credit check
   */
  static performCreditCheck(customerId: string, requestedAmount: number): CreditCheckResult {
    const customer = this.getCustomerAccount(customerId);
    if (!customer) {
      return {
        approved: false,
        availableCredit: 0,
        requestedAmount,
        exceedsLimit: true,
        requiresApproval: true,
        riskFactors: ['Customer account not found'],
        recommendations: ['Verify customer account exists'],
        creditScore: 0
      };
    }
    
    const availableCredit = customer.creditLimit - customer.totalCreditUsed;
    const exceedsLimit = requestedAmount > availableCredit;
    const riskFactors: string[] = [];
    const recommendations: string[] = [];
    
    // Risk assessment
    if (customer.currentBalance > customer.creditLimit * 0.8) {
      riskFactors.push('High credit utilization');
    }
    
    if (customer.creditScore < 50) {
      riskFactors.push('Low credit score');
    }
    
    const overdueAmount = this.getOverdueAmount(customerId);
    if (overdueAmount > 0) {
      riskFactors.push(`Overdue balance: $${overdueAmount.toFixed(2)}`);
    }
    
    // Recommendations
    if (exceedsLimit) {
      recommendations.push('Consider increasing credit limit');
      recommendations.push('Request partial payment before sale');
    }
    
    if (riskFactors.length > 0) {
      recommendations.push('Monitor account closely');
    }
    
    return {
      approved: !exceedsLimit && riskFactors.length < 2,
      availableCredit,
      requestedAmount,
      exceedsLimit,
      requiresApproval: exceedsLimit || riskFactors.length >= 2,
      riskFactors,
      recommendations,
      creditScore: customer.creditScore
    };
  }
  
  /**
   * Get account summary
   */
  static getAccountSummary(customerId: string): AccountSummary | null {
    const customer = this.getCustomerAccount(customerId);
    if (!customer) return null;
    
    const transactions = this.getCustomerTransactions(customerId);
    const activePlans = this.getActiveInstallmentPlans(customerId);
    const overdueAmount = this.getOverdueAmount(customerId);
    
    // Calculate risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (overdueAmount > 0) riskLevel = 'medium';
    if (customer.currentBalance > customer.creditLimit) riskLevel = 'high';
    if (overdueAmount > customer.creditLimit * 0.5) riskLevel = 'critical';
    
    return {
      customerId: customer.id,
      customerName: customer.name,
      accountNumber: customer.accountNumber,
      
      currentBalance: customer.currentBalance,
      depositBalance: customer.depositBalance,
      netBalance: customer.currentBalance - customer.depositBalance,
      
      creditLimit: customer.creditLimit,
      availableCredit: customer.availableCredit,
      creditUtilization: customer.creditLimit > 0 ? (customer.totalCreditUsed / customer.creditLimit) * 100 : 0,
      
      totalOverdueAmount: overdueAmount,
      daysOverdue: this.getDaysOverdue(customerId),
      nextPaymentDue: this.getNextPaymentDue(customerId),
      nextPaymentDate: this.getNextPaymentDate(customerId),
      
      totalTransactions: transactions.length,
      lifetimeValue: customer.lifetimeValue,
      totalPayments: customer.totalPayments,
      averageMonthlySpending: customer.averageMonthlySpending,
      
      creditScore: customer.creditScore,
      riskLevel,
      accountStatus: customer.status,
      
      lastTransactionDate: transactions[0]?.date,
      lastPaymentDate: customer.lastPaymentDate,
      lastPaymentAmount: this.getLastPaymentAmount(customerId),
      
      activeInstallmentPlans: activePlans.length,
      totalInstallmentBalance: activePlans.reduce((sum, plan) => sum + plan.remainingAmount, 0)
    };
  }
  
  // ==================== PRIVATE HELPER METHODS ====================
  
  private static generateAccountNumber(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ACC-${timestamp.slice(-6)}${random}`;
  }
  
  private static generateTransactionNumber(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 4).toUpperCase();
    return `TXN-${timestamp.slice(-8)}${random}`;
  }
  
  private static generatePlanNumber(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 4).toUpperCase();
    return `PLAN-${timestamp.slice(-6)}${random}`;
  }
  
  private static calculateEndDate(startDate: Date, numberOfInstallments: number, frequency: string): Date {
    const endDate = new Date(startDate);
    switch (frequency) {
      case 'weekly':
        endDate.setDate(endDate.getDate() + (numberOfInstallments * 7));
        break;
      case 'bi-weekly':
        endDate.setDate(endDate.getDate() + (numberOfInstallments * 14));
        break;
      case 'monthly':
        endDate.setMonth(endDate.getMonth() + numberOfInstallments);
        break;
      case 'quarterly':
        endDate.setMonth(endDate.getMonth() + (numberOfInstallments * 3));
        break;
    }
    return endDate;
  }
  
  private static calculateNextDueDate(startDate: Date, frequency: string): Date {
    const nextDate = new Date(startDate);
    switch (frequency) {
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case 'bi-weekly':
        nextDate.setDate(nextDate.getDate() + 14);
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case 'quarterly':
        nextDate.setMonth(nextDate.getMonth() + 3);
        break;
    }
    return nextDate;
  }
  
  private static createAccountingEntry(
    transactionId: string,
    account: string,
    debitAmount: number,
    creditAmount: number,
    description: string
  ): AccountingEntry {
    return {
      id: `acc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      transactionId,
      account: account as any,
      debitAmount,
      creditAmount,
      description,
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString()
    };
  }
  
  private static saveAccountingEntries(entries: AccountingEntry[]): void {
    try {
      const existing = this.getAllAccountingEntries();
      existing.push(...entries);
      localStorage.setItem(STORAGE_KEYS.ACCOUNTING_ENTRIES, JSON.stringify(existing));
    } catch (error) {
      console.error('Error saving accounting entries:', error);
    }
  }
  
  private static getAllAccountingEntries(): AccountingEntry[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.ACCOUNTING_ENTRIES);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading accounting entries:', error);
      return [];
    }
  }
  
  private static createInstallmentPayments(plan: InstallmentPlan): void {
    // Create payment schedule for installment plan
    const installmentAmount = plan.installmentAmount;
    const startDate = new Date(plan.startDate);
    
    for (let i = 0; i < plan.numberOfInstallments; i++) {
      const dueDate = new Date(startDate);
      
      // Calculate due date based on frequency
      switch (plan.frequency) {
        case 'weekly':
          dueDate.setDate(dueDate.getDate() + (i * 7));
          break;
        case 'bi-weekly':
          dueDate.setDate(dueDate.getDate() + (i * 14));
          break;
        case 'monthly':
          dueDate.setMonth(dueDate.getMonth() + i);
          break;
        case 'quarterly':
          dueDate.setMonth(dueDate.getMonth() + (i * 3));
          break;
      }
      
      const payment: InstallmentPayment = {
        id: `payment_${plan.id}_${i + 1}`,
        planId: plan.id,
        installmentNumber: i + 1,
        dueDate: dueDate.toISOString(),
        amountDue: installmentAmount,
        amountPaid: 0,
        status: 'pending',
        createdAt: plan.createdDate
      };
      
      // Save to localStorage
      const existingPayments = JSON.parse(localStorage.getItem('installment_payments') || '[]');
      existingPayments.push(payment);
      localStorage.setItem('installment_payments', JSON.stringify(existingPayments));
    }
  }
  
  private static getOverdueInstallmentPayments(planId: string): InstallmentPayment[] {
    const allPayments: InstallmentPayment[] = JSON.parse(localStorage.getItem('installment_payments') || '[]');
    const now = new Date();
    
    return allPayments.filter(payment => 
      payment.planId === planId && 
      payment.status === 'overdue' ||
      (payment.status === 'pending' && new Date(payment.dueDate) < now)
    );
  }
  
  private static recordInstallmentPayment(
    paymentId: string,
    amount: number,
    paymentMethod: PaymentMethod,
    notes?: string
  ): void {
    const allPayments: InstallmentPayment[] = JSON.parse(localStorage.getItem('installment_payments') || '[]');
    const paymentIndex = allPayments.findIndex(p => p.id === paymentId);
    
    if (paymentIndex === -1) return;
    
    const payment = allPayments[paymentIndex];
    payment.amountPaid += amount;
    payment.paymentDate = new Date().toISOString();
    payment.paymentMethod = paymentMethod;
    payment.updatedAt = new Date().toISOString();
    
    if (notes) payment.notes = notes;
    
    // Update status based on amount paid
    if (payment.amountPaid >= payment.amountDue) {
      payment.status = 'paid';
    } else {
      payment.status = 'partial';
    }
    
    localStorage.setItem('installment_payments', JSON.stringify(allPayments));
  }
  
  // Public utility methods
  public static getAllCustomers(): CustomerAccount[] {
    return this.getAllCustomerAccounts();
  }

  public static getCustomerInstallmentPlans(customerId: string): InstallmentPlan[] {
    const allPlans: InstallmentPlan[] = this.getAllInstallmentPlans();
    return allPlans.filter(plan => plan.customerId === customerId);
  }

  public static async recordPayment(paymentData: {
    customerId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    applyToInstallment?: boolean;
    installmentPlanId?: string;
    notes?: string;
  }): Promise<PaymentProcessingResult> {
    try {
      const customer = this.getCustomerAccount(paymentData.customerId);
      if (!customer) {
        return { 
          success: false, 
          errors: ['Customer not found'],
          newBalance: 0,
          newDepositBalance: 0,
          amountProcessed: 0,
          paymentMethod: paymentData.paymentMethod,
          accountingEntries: []
        };
      }

      // Create payment transaction
      const transaction: AccountTransaction = {
        id: `payment_${Date.now()}`,
        transactionNumber: `PAY-${Date.now()}`,
        customerId: paymentData.customerId,
        customerName: customer.name,
        date: new Date().toISOString(),
        type: paymentData.applyToInstallment ? 'payment_installment' : 'payment_cash',
        description: paymentData.notes || `Payment received via ${paymentData.paymentMethod}`,
        amount: paymentData.amount,
        isDebit: false, // Payment reduces customer balance
        balanceBefore: customer.currentBalance,
        balanceAfter: customer.currentBalance - paymentData.amount,
        depositBalanceBefore: customer.depositBalance,
        depositBalanceAfter: customer.depositBalance,
        paymentMethod: paymentData.paymentMethod,
        installmentPlanId: paymentData.installmentPlanId,
        processedBy: 'system',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Apply payment
      if (paymentData.applyToInstallment && paymentData.installmentPlanId) {
        this.recordInstallmentPayment(
          paymentData.installmentPlanId, 
          paymentData.amount, 
          paymentData.paymentMethod, 
          paymentData.notes
        );
      }

      // Update customer balance
      customer.currentBalance -= paymentData.amount;
      customer.lastPaymentDate = new Date().toISOString();
      customer.totalPayments += paymentData.amount;

      // Create accounting entries
      const accountingEntries: AccountingEntry[] = [{
        id: `entry_${Date.now()}`,
        transactionId: transaction.id,
        account: 'accounts_receivable',
        debitAmount: 0,
        creditAmount: paymentData.amount,
        description: `Payment received from customer ${customer.name}`,
        date: transaction.date,
        createdAt: new Date().toISOString()
      }];

      // Save updates
      this.saveAccountTransactionToStorage(transaction);
      this.saveCustomerAccount(customer);

      return { 
        success: true, 
        transactionId: transaction.id,
        newBalance: customer.currentBalance,
        newDepositBalance: customer.depositBalance,
        amountProcessed: paymentData.amount,
        paymentMethod: paymentData.paymentMethod,
        accountingEntries
      };
    } catch (error) {
      return { 
        success: false, 
        errors: [(error as Error).message],
        newBalance: 0,
        newDepositBalance: 0,
        amountProcessed: 0,
        paymentMethod: paymentData.paymentMethod,
        accountingEntries: []
      };
    }
  }

  public static async addDeposit(depositData: {
    customerId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    notes?: string;
  }): Promise<PaymentProcessingResult> {
    try {
      const customer = this.getCustomerAccount(depositData.customerId);
      if (!customer) {
        return { 
          success: false, 
          errors: ['Customer not found'],
          newBalance: 0,
          newDepositBalance: 0,
          amountProcessed: 0,
          paymentMethod: depositData.paymentMethod,
          accountingEntries: []
        };
      }

      // Create deposit transaction
      const transaction: AccountTransaction = {
        id: `deposit_${Date.now()}`,
        transactionNumber: `DEP-${Date.now()}`,
        customerId: depositData.customerId,
        customerName: customer.name,
        date: new Date().toISOString(),
        type: 'deposit',
        description: depositData.notes || `Deposit received via ${depositData.paymentMethod}`,
        amount: depositData.amount,
        isDebit: false,
        balanceBefore: customer.currentBalance,
        balanceAfter: customer.currentBalance,
        depositBalanceBefore: customer.depositBalance,
        depositBalanceAfter: customer.depositBalance + depositData.amount,
        paymentMethod: depositData.paymentMethod,
        processedBy: 'system',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Update customer deposit balance
      customer.depositBalance += depositData.amount;
      customer.lastActivityDate = new Date().toISOString();

      // Create accounting entries
      const accountingEntries: AccountingEntry[] = [{
        id: `entry_${Date.now()}`,
        transactionId: transaction.id,
        account: 'customer_deposits',
        debitAmount: 0,
        creditAmount: depositData.amount,
        description: `Deposit received from customer ${customer.name}`,
        date: transaction.date,
        createdAt: new Date().toISOString()
      }];

      // Save updates
      this.saveAccountTransactionToStorage(transaction);
      this.saveCustomerAccount(customer);

      return { 
        success: true, 
        transactionId: transaction.id,
        newBalance: customer.currentBalance,
        newDepositBalance: customer.depositBalance,
        amountProcessed: depositData.amount,
        paymentMethod: depositData.paymentMethod,
        accountingEntries
      };
    } catch (error) {
      return { 
        success: false, 
        errors: [(error as Error).message],
        newBalance: 0,
        newDepositBalance: 0,
        amountProcessed: 0,
        paymentMethod: depositData.paymentMethod,
        accountingEntries: []
      };
    }
  }

  private static getOverdueAmount(customerId: string): number {
    const customer = this.getCustomerAccount(customerId);
    if (!customer) return 0;
    
    const transactions = this.getCustomerTransactions(customerId);
    const now = new Date();
    const termsDays = customer.paymentTermsDays;
    
    return transactions
      .filter(t => 
        (t.type === 'sale_credit' || t.type === 'interest_charge' || t.type === 'late_fee') &&
        t.amount > 0 &&
        new Date(t.date).getTime() + (termsDays * 24 * 60 * 60 * 1000) < now.getTime()
      )
      .reduce((sum, t) => sum + t.amount, 0);
  }
  
  private static getDaysOverdue(customerId: string): number {
    const customer = this.getCustomerAccount(customerId);
    if (!customer) return 0;
    
    const transactions = this.getCustomerTransactions(customerId);
    const now = new Date();
    const termsDays = customer.paymentTermsDays;
    
    const oldestOverdueTransaction = transactions
      .filter(t => 
        (t.type === 'sale_credit') &&
        t.amount > 0 &&
        new Date(t.date).getTime() + (termsDays * 24 * 60 * 60 * 1000) < now.getTime()
      )
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
    
    if (!oldestOverdueTransaction) return 0;
    
    const overdueDate = new Date(oldestOverdueTransaction.date);
    overdueDate.setDate(overdueDate.getDate() + termsDays);
    
    return Math.floor((now.getTime() - overdueDate.getTime()) / (24 * 60 * 60 * 1000));
  }
  
  private static getNextPaymentDue(customerId: string): number {
    const allPayments: InstallmentPayment[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.INSTALLMENT_PAYMENTS) || '[]');
    const allPlans: InstallmentPlan[] = this.getAllInstallmentPlans();
    
    // Get customer's installment plans
    const customerPlans = allPlans.filter(plan => plan.customerId === customerId && plan.status === 'active');
    
    let nextAmount = 0;
    const now = new Date();
    
    for (const plan of customerPlans) {
      const planPayments = allPayments.filter(p => 
        p.planId === plan.id && 
        p.status === 'pending' && 
        new Date(p.dueDate) <= now
      );
      
      nextAmount += planPayments.reduce((sum, p) => sum + (p.amountDue - p.amountPaid), 0);
    }
    
    return nextAmount;
  }
  
  private static getNextPaymentDate(customerId: string): string | undefined {
    const allPayments: InstallmentPayment[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.INSTALLMENT_PAYMENTS) || '[]');
    const allPlans: InstallmentPlan[] = this.getAllInstallmentPlans();
    
    const customerPlans = allPlans.filter(plan => plan.customerId === customerId && plan.status === 'active');
    
    let earliestDate: Date | null = null;
    
    for (const plan of customerPlans) {
      const nextPayment = allPayments
        .filter(p => p.planId === plan.id && p.status === 'pending')
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
      
      if (nextPayment) {
        const dueDate = new Date(nextPayment.dueDate);
        if (!earliestDate || dueDate < earliestDate) {
          earliestDate = dueDate;
        }
      }
    }
    
    return earliestDate?.toISOString();
  }
  
  private static getLastPaymentAmount(customerId: string): number | undefined {
    const transactions = this.getCustomerTransactions(customerId);
    
    const lastPayment = transactions
      .filter(t => 
        t.type === 'payment_cash' || 
        t.type === 'payment_installment' ||
        t.type === 'deposit'
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    
    return lastPayment?.amount;
  }

  // Helper methods for storage
  private static saveAccountTransactionToStorage(transaction: AccountTransaction): void {
    const transactions = this.getCustomerTransactions(transaction.customerId);
    transactions.push(transaction);
    localStorage.setItem(`customer_transactions_${transaction.customerId}`, JSON.stringify(transactions));
  }
}