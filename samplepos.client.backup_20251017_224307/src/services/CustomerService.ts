/**
 * Centralized Customer Service
 * Single source of truth for all customer operations across the system
 */

import type { Customer } from '../context/CustomerLedgerContext';
import SettingsService from './SettingsService';

export interface CustomerCreateRequest {
  name: string;
  contact?: string;
  email?: string;
  address?: string;
  type?: 'individual' | 'business';
  creditLimit?: number;
  notes?: string;
}

export interface CustomerSearchOptions {
  searchTerm?: string;
  type?: 'individual' | 'business';
  minBalance?: number;
  maxBalance?: number;
}

export interface CustomerBalanceUpdate {
  amount: number;
  type: 'credit' | 'debit';
  description: string;
  paymentMethod?: string;
  reference?: string;
}

class CustomerServiceClass {
  private readonly STORAGE_KEY = 'customers';

  /**
   * Get all customers from storage
   */
  getAllCustomers(): Customer[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (!data) return [];

      const customers = JSON.parse(data);
      if (!Array.isArray(customers)) return [];

      // Normalize customer data format
      return customers.map(this.normalizeCustomer);
    } catch (error) {
      console.error('❌ CustomerService: Error loading customers:', error);
      return [];
    }
  }

  /**
   * Get customer by ID
   */
  getCustomerById(id: string): Customer | null {
    const customers = this.getAllCustomers();
    return customers.find(c => c.id === id) || null;
  }

  /**
   * Get customer by name (case insensitive)
   */
  getCustomerByName(name: string): Customer | null {
    if (!name?.trim()) return null;
    
    const customers = this.getAllCustomers();
    return customers.find(c => 
      c.name.toLowerCase() === name.toLowerCase().trim()
    ) || null;
  }

  /**
   * Search customers with flexible options
   */
  searchCustomers(options: CustomerSearchOptions = {}): Customer[] {
    const customers = this.getAllCustomers();
    
    if (!options.searchTerm && !options.type && 
        options.minBalance === undefined && options.maxBalance === undefined) {
      return customers; // Return all if no filters
    }

    return customers.filter(customer => {
      // Text search (name, contact, email)
      if (options.searchTerm) {
        const searchLower = options.searchTerm.toLowerCase();
        const matches = 
          customer.name.toLowerCase().includes(searchLower) ||
          customer.contact?.toLowerCase().includes(searchLower) ||
          customer.email?.toLowerCase().includes(searchLower) ||
          customer.id?.toLowerCase().includes(searchLower);
        
        if (!matches) return false;
      }

      // Type filter
      if (options.type && customer.type !== options.type) {
        return false;
      }

      // Balance range filter
      if (options.minBalance !== undefined && (customer.balance ?? 0) < options.minBalance) {
        return false;
      }
      if (options.maxBalance !== undefined && (customer.balance ?? 0) > options.maxBalance) {
        return false;
      }

      return true;
    });
  }

  /**
   * Create new customer with validation
   */
  createCustomer(request: CustomerCreateRequest): { success: boolean; customer?: Customer; error?: string } {
    try {
      // Validation
      if (!request.name?.trim()) {
        return { success: false, error: 'Customer name is required' };
      }

      // Check for duplicate name
      if (this.getCustomerByName(request.name)) {
        return { success: false, error: `Customer '${request.name}' already exists` };
      }

      // Create normalized customer
      const customer: Customer = {
        id: this.generateCustomerId(),
        name: request.name.trim(),
        contact: request.contact?.trim() || '',
        email: request.email?.trim() || '',
        address: request.address?.trim() || '',
        balance: 0,
        loyaltyDiscount: 0,  // Default to 0 loyalty discount
        joinDate: new Date().toISOString().split('T')[0],
        type: request.type || 'individual',
        creditLimit: request.creditLimit || 1000,
        notes: request.notes?.trim() || ''
      };

      // Save to storage
      const customers = this.getAllCustomers();
      customers.push(customer);
      this.saveCustomers(customers);

      console.log(`✅ CustomerService: Created customer '${customer.name}' with ID ${customer.id}`);
      return { success: true, customer };

    } catch (error) {
      console.error('❌ CustomerService: Error creating customer:', error);
      return { success: false, error: 'Failed to create customer' };
    }
  }

  /**
   * Update existing customer
   */
  updateCustomer(id: string, updates: Partial<CustomerCreateRequest>): { success: boolean; customer?: Customer; error?: string } {
    try {
      const customers = this.getAllCustomers();
      const index = customers.findIndex(c => c.id === id);
      
      if (index === -1) {
        return { success: false, error: 'Customer not found' };
      }

      // Check for name conflicts (if name is being updated)
      if (updates.name && updates.name !== customers[index].name) {
        if (this.getCustomerByName(updates.name)) {
          return { success: false, error: `Customer name '${updates.name}' already exists` };
        }
      }

      // Apply updates
      const updatedCustomer: Customer = {
        ...customers[index],
        ...(updates.name && { name: updates.name.trim() }),
        ...(updates.contact !== undefined && { contact: updates.contact.trim() }),
        ...(updates.email !== undefined && { email: updates.email.trim() }),
        ...(updates.address !== undefined && { address: updates.address.trim() }),
        ...(updates.type && { type: updates.type }),
        ...(updates.creditLimit !== undefined && { creditLimit: updates.creditLimit }),
        ...(updates.notes !== undefined && { notes: updates.notes.trim() })
      };

      customers[index] = updatedCustomer;
      this.saveCustomers(customers);

      console.log(`✅ CustomerService: Updated customer '${updatedCustomer.name}'`);
      return { success: true, customer: updatedCustomer };

    } catch (error) {
      console.error('❌ CustomerService: Error updating customer:', error);
      return { success: false, error: 'Failed to update customer' };
    }
  }

  /**
   * Update customer balance with precise calculation
   */
  updateBalance(customerName: string, update: CustomerBalanceUpdate): { success: boolean; newBalance?: number; error?: string } {
    try {
      if (!customerName?.trim()) {
        return { success: false, error: 'Customer name is required' };
      }

      if (update.amount <= 0) {
        return { success: false, error: 'Amount must be greater than zero' };
      }

      const customers = this.getAllCustomers();
      const index = customers.findIndex(c => c.name.toLowerCase() === customerName.toLowerCase());
      
      if (index === -1) {
        return { success: false, error: `Customer '${customerName}' not found` };
      }

      const customer = customers[index];
      let newBalance: number;

      if (update.type === 'credit') {
        // Credit increases customer's balance (they owe more)
        newBalance = this.roundToCurrency((customer.balance ?? 0) + update.amount);
      } else {
        // Debit decreases customer's balance (they pay down debt)
        newBalance = this.roundToCurrency((customer.balance ?? 0) - update.amount);
        if (newBalance < 0) newBalance = 0; // Prevent negative balances
      }

      customers[index] = { ...customer, balance: newBalance };
      this.saveCustomers(customers);

      console.log(`✅ CustomerService: Updated ${customerName} balance: ${customer.balance ?? 0} → ${newBalance} (${update.type}: ${update.amount})`);
      return { success: true, newBalance };

    } catch (error) {
      console.error('❌ CustomerService: Error updating balance:', error);
      return { success: false, error: 'Failed to update balance' };
    }
  }

  /**
   * Delete customer and all related data
   */
  deleteCustomer(id: string): { success: boolean; error?: string } {
    try {
      const customers = this.getAllCustomers();
      const customer = customers.find(c => c.id === id);
      
      if (!customer) {
        return { success: false, error: 'Customer not found' };
      }

      const filteredCustomers = customers.filter(c => c.id !== id);
      this.saveCustomers(filteredCustomers);

      console.log(`✅ CustomerService: Deleted customer '${customer.name}' (${id})`);
      return { success: true };

    } catch (error) {
      console.error('❌ CustomerService: Error deleting customer:', error);
      return { success: false, error: 'Failed to delete customer' };
    }
  }

  /**
   * Get customers with outstanding balances
   */
  getCustomersWithBalance(): Customer[] {
    return this.getAllCustomers().filter(c => (c.balance ?? 0) > 0);
  }

  /**
   * Get customer statistics
   */
  getCustomerStats() {
    const customers = this.getAllCustomers();
    const totalCustomers = customers.length;
    const customersWithBalance = customers.filter(c => (c.balance ?? 0) > 0).length;
    const totalOutstanding = customers.reduce((sum, c) => sum + (c.balance ?? 0), 0);
    const averageBalance = totalCustomers > 0 ? totalOutstanding / totalCustomers : 0;

    return {
      totalCustomers,
      customersWithBalance,
      totalOutstanding: this.roundToCurrency(totalOutstanding),
      averageBalance: this.roundToCurrency(averageBalance)
    };
  }

  /**
   * Validate customer exists and has sufficient credit
   */
  validateCustomerCredit(customerName: string, amount: number): { valid: boolean; error?: string; creditAvailable?: number } {
    const customer = this.getCustomerByName(customerName);
    
    if (!customer) {
      return { valid: false, error: `Customer '${customerName}' not found` };
    }

    const creditUsed = customer.balance ?? 0;
    const creditLimit = customer.creditLimit ?? 0;
    const creditAvailable = creditLimit - creditUsed;

    if (amount > creditAvailable) {
      return { 
        valid: false, 
        error: `Insufficient credit. Available: ${this.formatCurrency(creditAvailable)}, Required: ${this.formatCurrency(amount)}`,
        creditAvailable: this.roundToCurrency(creditAvailable)
      };
    }

    return { valid: true, creditAvailable: this.roundToCurrency(creditAvailable) };
  }

  /**
   * Clear all customer data (for testing/reset)
   */
  clearAllCustomers(): { success: boolean } {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      console.log('✅ CustomerService: Cleared all customer data');
      return { success: true };
    } catch (error) {
      console.error('❌ CustomerService: Error clearing customers:', error);
      return { success: false };
    }
  }

  // Private helper methods

  private normalizeCustomer(customer: any): Customer {
    return {
      id: customer.id || this.generateCustomerId(),
      name: customer.name || '',
      contact: customer.contact || customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      balance: this.roundToCurrency(customer.balance ?? customer.currentBalance ?? 0),
      joinDate: customer.joinDate || customer.createdDate || new Date().toISOString().split('T')[0],
      type: customer.type || customer.customerType || 'individual',
      creditLimit: customer.creditLimit || 1000,
      notes: customer.notes || ''
    };
  }

  private saveCustomers(customers: Customer[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(customers));
      console.log(`💾 CustomerService: Saved ${customers.length} customers to storage`);
    } catch (error) {
      console.error('❌ CustomerService: Error saving customers:', error);
      throw error;
    }
  }

  private generateCustomerId(): string {
    return `customer-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private roundToCurrency(amount: number): number {
    return Math.round(amount * 100) / 100;
  }

  private formatCurrency(amount: number): string {
    // Use the centralized formatter from SettingsService for consistency
    return SettingsService.getInstance().formatCurrency(amount);
  }
}

// Export singleton instance
export const CustomerService = new CustomerServiceClass();

// Export for type checking
export default CustomerService;