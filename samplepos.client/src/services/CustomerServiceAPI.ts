/**
 * Customer Service API Client
 * 
 * This service interacts with the backend API for customer management.
 */

import api from '../config/api.config';
import type { Customer } from '../models/Customer';

class CustomerServiceAPI {
  /**
   * Create a new customer
   */
  async createCustomer(customer: Omit<Customer, 'id'>): Promise<string | null> {
    try {
      const response = await api.post('/customers', customer);
      return response.data.id;
    } catch (error) {
      console.error('Error creating customer via API:', error);
      return null;
    }
  }

  /**
   * Get customer by ID
   */
  async getCustomer(id: string): Promise<Customer | null> {
    try {
      const response = await api.get(`/customers/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error getting customer ${id} via API:`, error);
      return null;
    }
  }

  /**
   * Get all customers
   */
  async getCustomers(): Promise<Customer[]> {
    try {
      const response = await api.get('/customers');
      return response.data;
    } catch (error) {
      console.error('Error getting customers via API:', error);
      return [];
    }
  }

  /**
   * Update a customer
   */
  async updateCustomer(customer: Customer): Promise<boolean> {
    try {
      const response = await api.put(`/customers/${customer.id}`, customer);
      return response.status === 200;
    } catch (error) {
      console.error(`Error updating customer ${customer.id} via API:`, error);
      return false;
    }
  }

  /**
   * Search customers
   */
  async searchCustomers(query: string): Promise<Customer[]> {
    try {
      const response = await api.get(`/customers/search`, {
        params: { q: query }
      });
      return response.data;
    } catch (error) {
      console.error(`Error searching customers with query "${query}" via API:`, error);
      return [];
    }
  }

  /**
   * Delete a customer
   */
  async deleteCustomer(id: string): Promise<boolean> {
    try {
      const response = await api.delete(`/customers/${id}`);
      return response.status === 200;
    } catch (error) {
      console.error(`Error deleting customer ${id} via API:`, error);
      return false;
    }
  }

  /**
   * Get customer balance
   */
  async getCustomerBalance(id: string): Promise<number | null> {
    try {
      const response = await api.get(`/customers/${id}/balance`);
      return response.data.balance;
    } catch (error) {
      console.error(`Error getting balance for customer ${id} via API:`, error);
      return null;
    }
  }

  /**
   * Get customer ledger (transactions and payments)
   */
  async getCustomerLedger(id: string): Promise<any[]> {
    try {
      const response = await api.get(`/customers/${id}/ledger`);
      return response.data;
    } catch (error) {
      console.error(`Error getting ledger for customer ${id} via API:`, error);
      return [];
    }
  }
}

export default CustomerServiceAPI;