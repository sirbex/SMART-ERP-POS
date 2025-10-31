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
  changeAmount: number;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  notes?: string;
}): Promise<string | null> {
  try {
    // Map frontend cart to backend /api/sales payload
    // Backend computes totals if omitted; we'll send only essentials
    const paymentMethod = (transaction.paymentMethod || 'cash').toUpperCase();
    // Map common aliases
    const methodMap: Record<string, string> = {
      CASH: 'CASH',
      CARD: 'CARD',
      CREDIT: 'CREDIT',
      MOBILE: 'MOBILE_MONEY',
      MOBILE_MONEY: 'MOBILE_MONEY',
      BANK: 'BANK_TRANSFER',
      BANK_TRANSFER: 'BANK_TRANSFER',
      CHEQUE: 'CHEQUE',
      OTHER: 'OTHER',
    };
    const backendMethod = methodMap[paymentMethod] || 'CASH';

    const backendBody = {
      customerId: transaction.customerId || undefined,
      items: transaction.items.map((item) => ({
        productId: String(item.productId ?? ''),
        quantity: Number(item.quantity ?? 0),
        unitPrice: Number((item.unitPrice ?? item.price) ?? 0),
        // Optional fields: discount as fraction 0-1 if present
        ...(item.discount !== undefined && item.discount !== null
          ? { discount: Number(item.discount) }
          : {}),
      })),
      payments: [
        {
          method: backendMethod as any,
          amount: Number(transaction.paymentAmount ?? 0),
          // reference left undefined for now
        },
      ],
      // notes optional
      ...(transaction.notes ? { notes: transaction.notes } : {}),
    };

    const response = await api.post('/sales', backendBody);
    // Return created sale id for further fetching
    return response.data?.id || response.data?.data?.id || null;
  } catch (error) {
    console.error('Error creating transaction via API:', error);
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
    const response = await api.post(`/sales/${id}/cancel`, { reason });
    return response.status === 200;
  } catch (error) {
    console.error(`Error voiding transaction ${id} via API:`, error);
    return false;
  }
}