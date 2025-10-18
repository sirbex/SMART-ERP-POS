import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '@/config/api.config';

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
  
  // Backend API methods (now async)
  createCustomer: (name: string, contact?: string, email?: string) => Promise<boolean>;
  updateCustomerBalance: (customerName: string, amount: number, type: 'credit' | 'debit', note: string, paymentInfo?: { method: string; reference?: string }) => Promise<boolean>;
  getCustomerByName: (name: string) => Customer | undefined;
  getCustomerBalance: (name: string) => number;
  deleteCustomer: (customerName: string) => Promise<boolean>;
  refreshCustomers: () => Promise<void>;
}

const CustomerLedgerContext = createContext<CustomerLedgerContextType | undefined>(undefined);

export const useCustomerLedger = () => {
  const ctx = useContext(CustomerLedgerContext);
  if (!ctx) throw new Error('useCustomerLedger must be used within CustomerLedgerProvider');
  return ctx;
};

export const CustomerLedgerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State managed through backend API
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  
  // Load customers from backend API
  const refreshCustomers = async () => {
    try {
      console.log('🔄 Refreshing customers from backend API...');
      const response = await api.get('/customers?limit=1000');
      const customersData = response.data?.data || [];
      
      // Transform backend data to Customer format
      const transformedCustomers: Customer[] = customersData.map((c: any) => ({
        id: c.id,
        name: c.name,
        contact: c.phone || '',
        email: c.email || '',
        address: c.address || '',
        balance: Number(c.accountBalance) || 0,
        creditLimit: Number(c.creditLimit) || 0,
        notes: c.notes || '',
        joinDate: c.createdAt,
        type: c.type || 'individual'
      }));
      
      setCustomers(transformedCustomers);
      console.log(`✅ Loaded ${transformedCustomers.length} customers from backend API`);
    } catch (error) {
      console.error('❌ Error loading customers from backend API:', error);
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

  // Create new customer using backend API
  const createCustomer = async (name: string, contact?: string, email?: string): Promise<boolean> => {
    try {
      await api.post('/customers', {
        name,
        phone: contact || '',
        email: email || '',
        type: 'INDIVIDUAL'
      });
      await refreshCustomers(); // Refresh state after creation
      return true;
    } catch (error) {
      console.error('Failed to create customer:', error);
      return false;
    }
  };

  // Update customer balance using backend API
  const updateCustomerBalance = async (
    customerName: string, 
    amount: number, 
    type: 'credit' | 'debit', 
    note: string,
    paymentInfo?: { method: string; reference?: string }
  ): Promise<boolean> => {
    try {
      // Find customer by name first
      const customer = customers.find(c => c.name.toLowerCase() === customerName.toLowerCase());
      if (!customer || !customer.id) {
        console.error(`Customer '${customerName}' not found`);
        return false;
      }

      // Record payment via backend API
      await api.post(`/customers/${customer.id}/payment`, {
        amount,
        method: (paymentInfo?.method || 'CASH').toUpperCase(),
        reference: paymentInfo?.reference,
        notes: note
      });

      // Add ledger entry locally
      const newEntry: LedgerEntry = {
        id: `ledger-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        customer: customerName,
        date: new Date().toISOString().split('T')[0],
        amount,
        type,
        note,
        paymentMethod: paymentInfo?.method,
        status: 'completed',
        relatedInvoice: paymentInfo?.reference
      };

      setLedger(prev => [...prev, newEntry]);
      await refreshCustomers(); // Refresh to get updated balances
      return true;
    } catch (error) {
      console.error('Failed to update customer balance:', error);
      return false;
    }
  };

  // Get customer by name from state
  const getCustomerByName = (name: string): Customer | undefined => {
    return customers.find(c => c.name.toLowerCase() === name.toLowerCase());
  };

  // Get customer balance from state
  const getCustomerBalance = (name: string): number => {
    const customer = getCustomerByName(name);
    return customer ? (customer.balance ?? 0) : 0;
  };

  // Delete customer using backend API
  const deleteCustomer = async (customerName: string): Promise<boolean> => {
    try {
      const customer = getCustomerByName(customerName);
      if (!customer || !customer.id) {
        console.error(`Customer '${customerName}' not found`);
        return false;
      }

      await api.delete(`/customers/${customer.id}`);
      
      // Remove related ledger entries
      setLedger(prev => prev.filter(entry => 
        entry.customer.toLowerCase() !== customerName.toLowerCase()
      ));
      
      await refreshCustomers(); // Refresh state after deletion
      return true;
    } catch (error) {
      console.error('Failed to delete customer:', error);
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