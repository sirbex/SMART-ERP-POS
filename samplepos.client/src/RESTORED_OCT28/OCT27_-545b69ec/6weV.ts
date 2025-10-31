/**
 * POS Service API Client
 * 
 * This service interacts with the backend API for POS operations.
 */

import api from '../config/api.config';
import type { InventoryItem, Transaction, TransactionItem, Customer } from '../types';

/**
 * Get inventory items for POS screen
 */
export async function getInventory(): Promise<InventoryItem[]> {
  try {
    const response = await api.get('/inventory/items');
    return response.data;
  } catch (error) {
    console.error('Error loading inventory items from API:', error);
    return [];
  }
}

/**
 * Search inventory by name, sku, or barcode
 */
export async function searchInventory(term: string): Promise<InventoryItem[]> {
  try {
    const response = await api.get(`/inventory/search`, {
      params: { q: term }
    });
    return response.data;
  } catch (error) {
    console.error(`Error searching inventory with term "${term}" via API:`, error);
    return [];
  }
}

/**
 * Create a transaction
 */
export async function createTransaction(transaction: {
  items: TransactionItem[];
  customerId?: string;
  paymentMethod: string;
  paymentAmount: number;
  paymentReference?: string;
  changeAmount: number;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  notes?: string;
}): Promise<Transaction | null> {
  try {
    // Transform the data to match new /sales endpoint expectations
    const saleData = {
      customerId: transaction.customerId || null,
      items: transaction.items.map(item => ({
        productId: item.productId?.toString() || '', // Convert to string for backend
        quantity: item.quantity,
        unit: item.unit || 'base', // Use actual unit from cart item
        uomId: item.uomId || null, // Include UoM ID if present
        unitPrice: item.unitPrice || item.price,
        discount: item.discount || 0
      })),
      payments: [{
        method: transaction.paymentMethod.toUpperCase(), // CASH, CARD, CREDIT, etc.
        amount: transaction.paymentAmount,
        reference: transaction.paymentReference || ''
      }],
      subtotal: transaction.subtotal,
      discount: transaction.discountAmount,
      tax: transaction.taxAmount,
      total: transaction.total,
      notes: transaction.notes || ''
    };
    
    console.log('📤 Sending sale data:', JSON.stringify(saleData, null, 2));
    
    // Use path relative to baseURL ('/api'), avoid duplicating '/api'
    const response = await api.post('/sales', saleData);
    // Backend now returns full sale object with all details
    return response.data;
  } catch (error: any) {
    // Surface server validation details for easier debugging
    const details = error?.response?.data?.details;
    const firstDetail = Array.isArray(details) && details.length > 0 ? details[0]?.message || details[0] : null;
    console.error('❌ Error creating transaction via API:', error);
    console.error('❌ Error response:', error.response?.data);
    console.error('❌ Status code:', error.response?.status);
    if (firstDetail) {
      window?.alert?.(`Transaction failed: ${firstDetail}`);
    }
    return null;
  }
}

/**
 * Get a list of customers for the POS dropdown
 */
// Customer API endpoints - Updated 2025-10-17 to handle paginated responses
export async function getCustomersForPOS(): Promise<Customer[]> {
  try {
    const response = await api.get('/customers');
    console.log('📦 Raw customer API response:', response.data);
    
    // API returns { data: [...], pagination: {...} }
    // Handle both formats for backwards compatibility
    if (Array.isArray(response.data)) {
      return response.data;
    } else if (response.data.data && Array.isArray(response.data.data)) {
      return response.data.data;
    } else {
      console.warn('Unexpected customer API response format:', response.data);
      return [];
    }
  } catch (error) {
    console.error('Error loading customers for POS from API:', error);
    return [];
  }
}

/**
 * Search customers by name, phone, or email
 */
export async function searchCustomers(term: string): Promise<Customer[]> {
  try {
    const response = await api.get(`/customers/search/${encodeURIComponent(term)}`);
    // Search endpoint returns just the data array
    return response.data;
  } catch (error) {
    console.error(`Error searching customers with term "${term}" via API:`, error);
    return [];
  }
}

/**
 * Get customer by ID
 */
export async function getCustomer(id: string): Promise<Customer | null> {
  try {
    const response = await api.get(`/customers/${id}`);
    return response.data;
  } catch (error) {
    console.error(`Error getting customer ${id} from API:`, error);
    return null;
  }
}

/**
 * Create a new customer
 */
export async function createCustomer(customer: Omit<Customer, 'id'>): Promise<string | null> {
  try {
    const response = await api.post('/customers', customer);
    return response.data.id;
  } catch (error) {
    console.error('Error creating customer via API:', error);
    return null;
  }
}

/**
 * Get a transaction by ID with full details including items
 */
export async function getTransactionById(id: string): Promise<Transaction | null> {
  try {
    const response = await api.get(`/sales/${id}`);
    return response.data;
  } catch (error) {
    console.error(`Error getting transaction ${id} from API:`, error);
    return null;
  }
}

/**
 * Check if there is sufficient stock for an item
 */
export async function checkStock(itemId: string, quantity: number): Promise<{
  success: boolean;
  available: number;
  message?: string;
}> {
  try {
    const response = await api.get(`/inventory/items/${itemId}/check-stock`, {
      params: { quantity }
    });
    return response.data;
  } catch (error) {
    console.error(`Error checking stock for item ${itemId} via API:`, error);
    return { success: false, available: 0, message: 'Error checking stock' };
  }
}

/**
 * Get recent transactions for the POS screen
 */
export async function getRecentTransactions(limit: number = 10): Promise<Transaction[]> {
  try {
    // Use /sales endpoint with pagination
    const response = await api.get('/sales', {
      params: { limit, page: 1 }
    });
    // New API returns { data: [], pagination: {} }
    return response.data?.data || [];
  } catch (error) {
    console.error('Error loading recent transactions from API:', error);
    return [];
  }
}

/**
 * Get all transactions with pagination support
 */
export async function getAllTransactions(limit: number = 1000, offset: number = 0): Promise<any[]> {
  try {
    // Use /sales endpoint - convert offset to page number
    const page = Math.floor(offset / limit) + 1;
    const response = await api.get('/sales', {
      params: { limit, page }
    });
    // New API returns { data: [], pagination: {} }
    return response.data?.data || [];
  } catch (error) {
    console.error('Error loading all transactions from API:', error);
    return [];
  }
}

/**
 * Void a transaction
 */
export async function voidTransaction(id: string, reason: string): Promise<boolean> {
  try {
    const response = await api.post(`/transactions/${id}/void`, { reason });
    return response.status === 200;
  } catch (error) {
    console.error(`Error voiding transaction ${id} via API:`, error);
    return false;
  }
}