import React, { createContext, useContext, useState, useEffect } from 'react';
import { CustomerService } from '../services/CustomerService';

// Enhanced Customer interface with more details
export interface Customer {
  id?: string; // Optional unique identifier
  name: string;
  contact: string;
  email?: string;
  address?: string;
  balance: number;
  loyaltyDiscount?: number; // Added: loyalty discount percentage
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

interface CustomerLedgerContextType {
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  ledger: LedgerEntry[];
  setLedger: React.Dispatch<React.SetStateAction<LedgerEntry[]>>;
  
  // Centralized customer service methods
  createCustomer: (name: string, contact?: string, email?: string) => boolean;
  updateCustomerBalance: (customerName: string, amount: number, type: 'credit' | 'debit', note: string, paymentInfo?: { method: string; reference?: string }) => boolean;
  getCustomerByName: (name: string) => Customer | undefined;
  getCustomerBalance: (name: string) => number;
  deleteCustomer: (customerName: string) => boolean;
  refreshCustomers: () => void;
}

const CustomerLedgerContext = createContext<CustomerLedgerContextType | undefined>(undefined);

export const useCustomerLedger = () => {
  const ctx = useContext(CustomerLedgerContext);
  if (!ctx) throw new Error('useCustomerLedger must be used within CustomerLedgerProvider');
  return ctx;
};

export const CustomerLedgerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State managed through CustomerService
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  
  // Load customers using centralized CustomerService
  const refreshCustomers = () => {
    try {
      console.log('🔄 Refreshing customers using CustomerService...');
      const loadedCustomers = CustomerService.getAllCustomers();
      setCustomers(loadedCustomers);
      console.log(`✅ Loaded ${loadedCustomers.length} customers via CustomerService`);
    } catch (error) {
      console.error('❌ Error loading customers via CustomerService:', error);
      setCustomers([]);
    }
  };

  // Initial load
  useEffect(() => {
    refreshCustomers();
  }, []);
  
  // Load ledger from localStorage
  useEffect(() => {
    try {
      const savedLedger = localStorage.getItem('pos_ledger');
      if (savedLedger) {
        const ledgerData = JSON.parse(savedLedger);
        setLedger(ledgerData);
        console.log(`📊 Loaded ${ledgerData.length} ledger entries from localStorage`);
      }
    } catch (error) {
      console.error('Error loading ledger from localStorage:', error);
    }
  }, []);
  
  // Save ledger when it changes
  useEffect(() => {
    try {
      localStorage.setItem('pos_ledger', JSON.stringify(ledger));
    } catch (error) {
      console.error('Error saving ledger to localStorage:', error);
    }
  }, [ledger]);

  // Create new customer using CustomerService
  const createCustomer = (name: string, contact?: string, email?: string): boolean => {
    const result = CustomerService.createCustomer({ name, contact, email });
    if (result.success) {
      refreshCustomers(); // Refresh state after creation
      return true;
    } else {
      console.error('Failed to create customer:', result.error);
      return false;
    }
  };

  // Update customer balance using CustomerService
  const updateCustomerBalance = (
    customerName: string, 
    amount: number, 
    type: 'credit' | 'debit', 
    note: string,
    paymentInfo?: { method: string; reference?: string }
  ): boolean => {
    const result = CustomerService.updateBalance(customerName, {
      amount,
      type,
      description: note,
      paymentMethod: paymentInfo?.method,
      reference: paymentInfo?.reference
    });

    if (result.success) {
      // Add ledger entry
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

      if (paymentInfo?.reference) {
        newEntry.relatedInvoice = paymentInfo.reference;
      }

      setLedger(prev => [...prev, newEntry]);
      refreshCustomers(); // Refresh to get updated balances
      return true;
    } else {
      console.error('Failed to update customer balance:', result.error);
      return false;
    }
  };

  // Get customer by name using CustomerService
  const getCustomerByName = (name: string): Customer | undefined => {
    return CustomerService.getCustomerByName(name) || undefined;
  };

  // Get customer balance using CustomerService
  const getCustomerBalance = (name: string): number => {
    const customer = CustomerService.getCustomerByName(name);
    return customer ? (customer.balance ?? 0) : 0;
  };

  // Delete customer using CustomerService
  const deleteCustomer = (customerName: string): boolean => {
    const customer = CustomerService.getCustomerByName(customerName);
    if (!customer || !customer.id) {
      console.error(`Customer '${customerName}' not found`);
      return false;
    }

    const result = CustomerService.deleteCustomer(customer.id);
    if (result.success) {
      // Remove related ledger entries
      setLedger(prev => prev.filter(entry => 
        entry.customer.toLowerCase() !== customerName.toLowerCase()
      ));
      refreshCustomers(); // Refresh state after deletion
      return true;
    } else {
      console.error('Failed to delete customer:', result.error);
      return false;
    }
  };

  return (
    <CustomerLedgerContext.Provider 
      value={{ 
        customers, 
        setCustomers, 
        ledger, 
        setLedger,
        createCustomer,
        updateCustomerBalance,
        getCustomerByName,
        getCustomerBalance,
        deleteCustomer,
        refreshCustomers
      }}
    >
      {children}
    </CustomerLedgerContext.Provider>
  );
};