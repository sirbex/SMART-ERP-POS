import React, { createContext, useContext, useState, useEffect } from 'react';

// Enhanced Customer interface with more details
export interface Customer {
  id?: string; // Optional unique identifier
  name: string;
  contact: string;
  email?: string;
  address?: string;
  balance: number;
  joinDate?: string;
  type?: 'individual' | 'business'; // Customer type
  creditLimit?: number;
  notes?: string;
}

// Enhanced LedgerEntry with more transaction details
export interface LedgerEntry {
  id?: string; // Unique identifier for the entry
  customer: string;
  date: string;
  amount: number;
  type: 'credit' | 'debit';
  note: string;
  category?: string; // Category of the transaction
  paymentMethod?: string; // Method of payment
  status?: 'pending' | 'completed' | 'overdue';
  dueDate?: string; // For scheduled payments
  relatedInvoice?: string; // Reference to an invoice number
}

// Customer Analytics interface for tracking metrics
export interface CustomerAnalytics {
  customerId: string;
  customerName: string;
  lifetimeValue: number; // Total value of all transactions
  averageTransaction: number; // Average transaction amount
  lastTransaction?: string; // Date of last transaction
  transactionCount: number; // Number of transactions
  paymentFrequency: number; // Average days between payments
  paymentHistory: {
    onTime: number; // Number of on-time payments
    late: number; // Number of late payments
  };
  creditUtilization: number; // Percentage of credit limit used
  riskScore?: number; // Credit risk score (optional)
}

interface CustomerLedgerContextType {
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  ledger: LedgerEntry[];
  setLedger: React.Dispatch<React.SetStateAction<LedgerEntry[]>>;
  
  // New analytics functions
  getCustomerAnalytics: (customerId: string) => CustomerAnalytics | undefined;
  getCustomerTransactionHistory: (customerName: string) => LedgerEntry[];
  getTopCustomers: (limit?: number) => Customer[];
  getOverdueAccounts: () => Customer[];
  getAccountAgingSummary: () => { [key: string]: number }; // 0-30, 31-60, 61-90, 90+ days
  
  // Balance management functions
  updateCustomerBalance: (customerName: string, amount: number, type: 'credit' | 'debit', note: string, paymentInfo?: { method: string; reference?: string }) => boolean;
  getCustomerByName: (name: string) => Customer | undefined;
  getCustomerBalance: (name: string) => number;
}

const CustomerLedgerContext = createContext<CustomerLedgerContextType | undefined>(undefined);

export const useCustomerLedger = () => {
  const ctx = useContext(CustomerLedgerContext);
  if (!ctx) throw new Error('useCustomerLedger must be used within CustomerLedgerProvider');
  return ctx;
};

export const CustomerLedgerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize with more detailed sample data
  const [customers, setCustomers] = useState<Customer[]>([
    { 
      id: '1', 
      name: 'John Doe', 
      contact: '1234567890', 
      email: 'john@example.com',
      balance: 120,
      joinDate: '2023-01-15',
      type: 'individual',
      creditLimit: 1000,
      notes: 'Regular customer'
    },
    { 
      id: '2', 
      name: 'Jane Smith', 
      contact: '9876543210', 
      email: 'jane@example.com',
      balance: 50,
      joinDate: '2023-03-22',
      type: 'individual',
      creditLimit: 500
    },
    { 
      id: '3', 
      name: 'Acme Corp', 
      contact: '5551234567',
      email: 'accounts@acme.com',
      balance: 500,
      joinDate: '2022-11-05',
      type: 'business',
      address: '123 Business Park, Suite 100',
      creditLimit: 5000,
      notes: 'Monthly billing cycle'
    },
  ]);
  
  // Initialize with sample ledger entries
  const [ledger, setLedger] = useState<LedgerEntry[]>([
    {
      id: '1',
      customer: 'John Doe',
      date: '2023-01-20',
      amount: 75,
      type: 'credit',
      note: 'Initial purchase',
      category: 'Sales',
      paymentMethod: 'Cash',
      status: 'completed'
    },
    {
      id: '2',
      customer: 'John Doe',
      date: '2023-02-15',
      amount: 45,
      type: 'credit',
      note: 'Product purchase',
      category: 'Sales',
      paymentMethod: 'Credit Card',
      status: 'completed'
    },
    {
      id: '3',
      customer: 'Acme Corp',
      date: '2023-01-25',
      amount: 500,
      type: 'credit',
      note: 'Monthly order',
      category: 'Wholesale',
      paymentMethod: 'Bank Transfer',
      status: 'completed'
    },
    {
      id: '4',
      customer: 'Jane Smith',
      date: '2023-03-22',
      amount: 50,
      type: 'credit',
      note: 'Product purchase',
      category: 'Sales',
      paymentMethod: 'Credit Card',
      status: 'pending',
      dueDate: '2023-04-22'
    }
  ]);
  
  // Persist to localStorage when customers or ledger change
  useEffect(() => {
    try {
      localStorage.setItem('pos_customers', JSON.stringify(customers));
    } catch (error) {
      console.error('Error saving customers to localStorage:', error);
    }
  }, [customers]);
  
  useEffect(() => {
    try {
      localStorage.setItem('pos_ledger', JSON.stringify(ledger));
    } catch (error) {
      console.error('Error saving ledger to localStorage:', error);
    }
  }, [ledger]);
  
  // Load from localStorage on first render
  useEffect(() => {
    try {
      const savedCustomers = localStorage.getItem('pos_customers');
      const savedLedger = localStorage.getItem('pos_ledger');
      
      if (savedCustomers) {
        setCustomers(JSON.parse(savedCustomers));
      }
      
      if (savedLedger) {
        setLedger(JSON.parse(savedLedger));
      }
    } catch (error) {
      console.error('Error loading data from localStorage:', error);
    }
  }, []);
  
  // Get analytics for a specific customer
  const getCustomerAnalytics = (customerId: string): CustomerAnalytics | undefined => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return undefined;
    
    const customerTransactions = ledger.filter(entry => entry.customer === customer.name);
    const totalTransactions = customerTransactions.length;
    
    if (totalTransactions === 0) {
      return {
        customerId,
        customerName: customer.name,
        lifetimeValue: 0,
        averageTransaction: 0,
        transactionCount: 0,
        paymentFrequency: 0,
        paymentHistory: { onTime: 0, late: 0 },
        creditUtilization: customer.creditLimit ? (customer.balance / customer.creditLimit * 100) : 0
      };
    }
    
    // Calculate lifetime value
    const lifetimeValue = customerTransactions.reduce((total, entry) => {
      return entry.type === 'credit' ? total + entry.amount : total;
    }, 0);
    
    // Calculate average transaction amount
    const averageTransaction = lifetimeValue / customerTransactions.filter(t => t.type === 'credit').length || 0;
    
    // Find last transaction date
    const sortedTransactions = [...customerTransactions].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const lastTransaction = sortedTransactions[0]?.date;
    
    // Calculate payment frequency in days
    let paymentFrequency = 0;
    if (totalTransactions > 1) {
      const firstDate = new Date(sortedTransactions[sortedTransactions.length - 1].date);
      const lastDate = new Date(sortedTransactions[0].date);
      const daysDiff = (lastDate.getTime() - firstDate.getTime()) / (1000 * 3600 * 24);
      paymentFrequency = daysDiff / (totalTransactions - 1);
    }
    
    // Count on-time vs late payments
    const paymentHistory = customerTransactions.reduce(
      (acc, entry) => {
        if (!entry.dueDate || !entry.status) return acc;
        
        if (entry.status === 'overdue') {
          return { ...acc, late: acc.late + 1 };
        } else {
          return { ...acc, onTime: acc.onTime + 1 };
        }
      },
      { onTime: 0, late: 0 }
    );
    
    // Calculate credit utilization
    const creditUtilization = customer.creditLimit ? (customer.balance / customer.creditLimit * 100) : 0;
    
    // Calculate a simple risk score (lower is better)
    // Based on payment history, credit utilization, and transaction frequency
    const lateRatio = paymentHistory.late / (paymentHistory.onTime + paymentHistory.late || 1);
    const riskScore = Math.round(
      (lateRatio * 50) + (creditUtilization / 200 * 50)
    );
    
    return {
      customerId,
      customerName: customer.name,
      lifetimeValue,
      averageTransaction,
      lastTransaction,
      transactionCount: totalTransactions,
      paymentFrequency,
      paymentHistory,
      creditUtilization,
      riskScore
    };
  };
  
  // Get transaction history for a specific customer
  const getCustomerTransactionHistory = (customerName: string): LedgerEntry[] => {
    return ledger
      .filter(entry => entry.customer === customerName)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };
  
  // Get top customers by lifetime value
  const getTopCustomers = (limit: number = 5): Customer[] => {
    // Get all customers with their total purchases
    const customersPurchases = customers.map(customer => {
      const customerTxns = ledger.filter(entry => 
        entry.customer === customer.name && entry.type === 'credit'
      );
      
      const totalPurchases = customerTxns.reduce((sum, entry) => sum + entry.amount, 0);
      
      return {
        ...customer,
        totalPurchases
      };
    });
    
    // Sort by total purchases and take the top 'limit'
    return customersPurchases
      .sort((a, b) => (b as any).totalPurchases - (a as any).totalPurchases)
      .slice(0, limit);
  };
  
  // Get customers with overdue payments
  const getOverdueAccounts = (): Customer[] => {
    const today = new Date();
    const customerSet = new Set<string>();
    
    // Find customers with overdue entries
    ledger.forEach(entry => {
      if (entry.dueDate && entry.status !== 'completed') {
        const dueDate = new Date(entry.dueDate);
        if (dueDate < today) {
          customerSet.add(entry.customer);
        }
      }
    });
    
    // Return the customer objects with overdue payments
    return customers.filter(customer => customerSet.has(customer.name));
  };
  
  // Get aging summary of accounts
  const getAccountAgingSummary = (): { [key: string]: number } => {
    const today = new Date();
    const aging: { [key: string]: number } = {
      '0-30': 0,
      '31-60': 0,
      '61-90': 0,
      '90+': 0
    };
    
    ledger.forEach(entry => {
      if (entry.dueDate && entry.status !== 'completed') {
        const dueDate = new Date(entry.dueDate);
        const daysDiff = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 3600 * 24));
        
        if (daysDiff <= 30) {
          aging['0-30'] += entry.amount;
        } else if (daysDiff <= 60) {
          aging['31-60'] += entry.amount;
        } else if (daysDiff <= 90) {
          aging['61-90'] += entry.amount;
        } else {
          aging['90+'] += entry.amount;
        }
      }
    });
    
    return aging;
  };

  // Find customer by name
  const getCustomerByName = (name: string): Customer | undefined => {
    return customers.find(c => c.name === name);
  };

  // Get customer balance by name
  const getCustomerBalance = (name: string): number => {
    const customer = getCustomerByName(name);
    return customer ? customer.balance : 0;
  };

  // Update customer balance and record in ledger
  const updateCustomerBalance = (
    customerName: string, 
    amount: number, 
    type: 'credit' | 'debit', 
    note: string,
    paymentInfo?: { method: string; reference?: string }
  ): boolean => {
    // Validate parameters
    if (!customerName || amount <= 0) {
      console.error('Invalid parameters for updateCustomerBalance');
      return false;
    }

    // Find customer index
    const customerIndex = customers.findIndex(c => c.name === customerName);
    if (customerIndex === -1) {
      console.error(`Customer '${customerName}' not found`);
      return false;
    }

    // Create a copy of customers array
    const updatedCustomers = [...customers];
    
    // Update balance based on transaction type
    if (type === 'credit') {
      // Credit increases the balance (customer owes more)
      updatedCustomers[customerIndex].balance += amount;
    } else {
      // Debit decreases the balance (customer pays)
      updatedCustomers[customerIndex].balance -= amount;
      
      // Prevent negative balance
      if (updatedCustomers[customerIndex].balance < 0) {
        updatedCustomers[customerIndex].balance = 0;
      }
    }

    // Create ledger entry
    const newEntry: LedgerEntry = {
      id: `ledger-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      customer: customerName,
      date: new Date().toISOString().split('T')[0],
      amount,
      type,
      note,
      paymentMethod: paymentInfo?.method,
      status: 'completed'
    };

    // Add reference if provided
    if (paymentInfo?.reference) {
      newEntry.relatedInvoice = paymentInfo.reference;
    }

    // Update state
    setCustomers(updatedCustomers);
    setLedger(prev => [...prev, newEntry]);

    return true;
  };

  return (
    <CustomerLedgerContext.Provider 
      value={{ 
        customers, 
        setCustomers, 
        ledger, 
        setLedger,
        getCustomerAnalytics,
        getCustomerTransactionHistory,
        getTopCustomers,
        getOverdueAccounts,
        getAccountAgingSummary,
        updateCustomerBalance,
        getCustomerByName,
        getCustomerBalance
      }}
    >
      {children}
    </CustomerLedgerContext.Provider>
  );
};
